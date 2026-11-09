"""Casos y análisis en la base. La única capa que toca la Session pa este módulo."""

from uuid import UUID

from sqlalchemy import and_, or_, select, text, update
from sqlalchemy.orm import Session, selectinload

from app.core.seudonimo import Seudonimo
from app.models import (
    Analisis,
    CasoPaciente,
    EstadoExplicacion,
    EstadoInferencia,
    ExplicacionLlm,
    LogInferencia,
    ModeloDesplegado,
    ObservacionProfesional,
    ResultadoCaracteristica,
    Traslado,
    TrasladoCaso,
)

# Espacio de candados del análisis (el primer int de pg_advisory_xact_lock(int, int)).
# Postgres no mezcla esta forma de dos enteros con la de un bigint que usa usuarios.
ESPACIO_CANDADO_PACIENTE = 2


class RepositorioAnalisis:
    def __init__(self, db: Session) -> None:
        self.db = db

    def modelo_vigente(self) -> ModeloDesplegado | None:
        return self.db.scalar(
            select(ModeloDesplegado).where(ModeloDesplegado.es_vigente.is_(True)).limit(1)
        )

    def tomar_candado_paciente(self, seudonimo: str) -> None:
        """Candado de transacción por paciente: dos POST /analisis a la vez con el mismo
        documento no crean dos casos (contrato, migración 0003). Se suelta con el commit.

        La llave son los primeros 32 bits del seudónimo (hex): sin datos del paciente y con
        choques tan raros que, si pasan, solo hacen esperar un poquito a otra petición.
        """
        llave = int.from_bytes(bytes.fromhex(seudonimo[:8]), "big", signed=True)
        self.db.execute(
            text("SELECT pg_advisory_xact_lock(:espacio, :llave)"),
            {"espacio": ESPACIO_CANDADO_PACIENTE, "llave": llave},
        )

    def caso_del_doctor(self, doctor_id: UUID, seudonimos: list[Seudonimo]) -> CasoPaciente | None:
        """El caso más viejo del doctor con ese paciente (con cualquier versión de clave)."""
        return self.db.scalar(
            select(CasoPaciente)
            .where(
                CasoPaciente.doctor_asignado_id == doctor_id,
                or_(
                    *(
                        and_(
                            CasoPaciente.seudonimo == s.valor,
                            CasoPaciente.version_clave == s.version_clave,
                        )
                        for s in seudonimos
                    )
                ),
            )
            .order_by(CasoPaciente.creado_en.asc())
            .limit(1)
        )

    def siguiente_numero(self) -> int:
        """El NNNNNN de A-AAAA-NNNNNN. Una secuencia nunca repite, ni con rollback (RNF-24)."""
        return int(self.db.scalar(text("SELECT nextval('analisis_codigo_seq')")))

    def agregar(self, *objetos: object) -> None:
        self.db.add_all(objetos)
        self.db.flush()

    def por_id(self, analisis_id: UUID) -> Analisis | None:
        return self.db.get(Analisis, analisis_id)

    def del_doctor(self, analisis_id: UUID, doctor_id: UUID) -> Analisis | None:
        """El análisis si su caso está asignado a ese doctor (propio o recibido por traslado).

        Con todo lo que pinta W-08 cargado de una, pa no hacer una consulta por región.
        """
        return self.db.scalar(
            select(Analisis)
            .join(CasoPaciente, Analisis.caso_id == CasoPaciente.id)
            .where(Analisis.id == analisis_id, CasoPaciente.doctor_asignado_id == doctor_id)
            .options(
                selectinload(Analisis.modelo),
                selectinload(Analisis.doctor_ejecutor),
                selectinload(Analisis.resultados).selectinload(
                    ResultadoCaracteristica.caracteristica
                ),
                selectinload(Analisis.resultados).selectinload(ResultadoCaracteristica.regiones),
                selectinload(Analisis.explicacion),
                selectinload(Analisis.observaciones).selectinload(ObservacionProfesional.autor),
            )
        )

    def traslado_recibido(self, caso_id: UUID, doctor_id: UUID) -> Traslado | None:
        """El último traslado con el que ese caso llegó a este doctor (W-17b), o None."""
        return self.db.scalar(
            select(Traslado)
            .join(TrasladoCaso, TrasladoCaso.traslado_id == Traslado.id)
            .where(TrasladoCaso.caso_id == caso_id, Traslado.destino_id == doctor_id)
            .options(selectinload(Traslado.origen))
            .order_by(Traslado.ejecutado_en.desc())
            .limit(1)
        )

    def reabrir_explicacion(self, explicacion_id: UUID, max_intentos: int) -> bool:
        """FALLIDA/RECHAZADA → PENDIENTE con intentos + 1, en un solo UPDATE (ANA-04).

        Las condiciones van en el WHERE: si dos reintentos llegan juntos, solo uno cambia la
        fila y el otro recibe False. El objeto en memoria se refresca con lo que quedó.
        """
        cambiado = self.db.scalar(
            update(ExplicacionLlm)
            .where(
                ExplicacionLlm.id == explicacion_id,
                ExplicacionLlm.estado.in_([EstadoExplicacion.FALLIDA, EstadoExplicacion.RECHAZADA]),
                ExplicacionLlm.intentos < max_intentos,
            )
            .values(
                estado=EstadoExplicacion.PENDIENTE,
                intentos=ExplicacionLlm.intentos + 1,
                texto=None,
                codigo_error=None,
            )
            .returning(ExplicacionLlm.id)
            .execution_options(synchronize_session="fetch")
        )
        return cambiado is not None

    def registrar_latencia_llm(self, analisis_id: UUID, latencia_ms: int) -> None:
        """Anota cuánto tardó Gemini en el último renglón EXITO del log (RF-M03)."""
        ultimo = self.db.scalar(
            select(LogInferencia)
            .where(
                LogInferencia.analisis_id == analisis_id,
                LogInferencia.estado == EstadoInferencia.EXITO,
            )
            .order_by(LogInferencia.id.desc())
            .limit(1)
        )
        if ultimo is not None:
            ultimo.latencia_llm_ms = latencia_ms
