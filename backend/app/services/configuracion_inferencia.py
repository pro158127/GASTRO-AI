"""Configuración de los umbrales de decisión (RF-A01). Solo afecta análisis futuros.

- Rango del 10 % al 90 % pa todo umbral (CA 3). La base tiene el mismo CHECK por si acaso.
- En modo por característica deben venir TODAS las activas con su umbral (contrato §7.7).
- Cada cambio deja en la bitácora el antes y el después (RF-A02).
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.core.errores import ErrorApi
from app.models import AccionBitacora, Caracteristica, ConfiguracionInferencia, Usuario
from app.repositories.catalogo_repository import RepositorioCatalogo
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.auditoria import EventoAuditoria, PublicadorEventos
from app.services.politica_umbral import MAXIMO, MINIMO, PoliticaUmbral, en_rango, politica_desde

CUATRO_DECIMALES = Decimal("0.0001")  # la columna es Numeric(5, 4)


@dataclass(frozen=True)
class CambioUmbral:
    caracteristica_id: int
    umbral: Decimal | None  # None = sin umbral propio (usa el global)


@dataclass(frozen=True)
class NuevaConfiguracion:
    usar_umbral_por_caracteristica: bool
    umbral_global: Decimal
    umbrales: list[CambioUmbral]


@dataclass
class VistaConfiguracion:
    configuracion: ConfiguracionInferencia
    caracteristicas: list[Caracteristica]


def _redondear(valor: Decimal | None) -> Decimal | None:
    return None if valor is None else valor.quantize(CUATRO_DECIMALES, rounding=ROUND_HALF_UP)


def _fotografia(config: ConfiguracionInferencia, caracteristicas: list[Caracteristica]) -> dict:
    """Pa la bitácora: códigos y números como texto (sin floats que redondeen raro)."""
    return {
        "usar_umbral_por_caracteristica": config.usar_umbral_por_caracteristica,
        "umbral_global": str(config.umbral_global),
        "umbrales": {
            c.codigo: None if c.umbral is None else str(c.umbral) for c in caracteristicas
        },
    }


class ServicioConfiguracionInferencia:
    def __init__(
        self, catalogo: RepositorioCatalogo, publicador: PublicadorEventos, unidad: UnidadTrabajo
    ) -> None:
        self._catalogo = catalogo
        self._publicador = publicador
        self._unidad = unidad

    def ver(self) -> VistaConfiguracion:
        config = self._catalogo.configuracion()
        if config is None:  # sin carga inicial: es un error de despliegue
            raise RuntimeError("Falta la fila de ConfiguracionInferencia: corre python -m app.seed")
        return VistaConfiguracion(config, self._catalogo.caracteristicas_activas())

    def politica(self) -> PoliticaUmbral:
        """La estrategia vigente; la usará el worker al guardar cada resultado."""
        vista = self.ver()
        return politica_desde(
            vista.configuracion.usar_umbral_por_caracteristica,
            vista.configuracion.umbral_global,
            {c.codigo: c.umbral for c in vista.caracteristicas},
        )

    def actualizar(
        self, nueva: NuevaConfiguracion, actor: Usuario, ip: str | None
    ) -> VistaConfiguracion:
        config = self._catalogo.configuracion(para_actualizar=True)
        if config is None:
            raise RuntimeError("Falta la fila de ConfiguracionInferencia: corre python -m app.seed")
        caracteristicas = {c.id: c for c in self._catalogo.caracteristicas_activas()}

        campos = []
        umbral_global = _redondear(nueva.umbral_global)
        if not en_rango(umbral_global):
            campos.append({"campo": "umbral_global", "mensaje": "Usa un valor entre 10 % y 90 %."})
        umbrales: dict[int, Decimal | None] = {}
        for i, cambio in enumerate(nueva.umbrales):
            if cambio.caracteristica_id not in caracteristicas:
                campos.append(
                    {
                        "campo": f"umbrales[{i}].caracteristica_id",
                        "mensaje": "No existe esa característica.",
                    }
                )
                continue
            valor = _redondear(cambio.umbral)
            if valor is not None and not en_rango(valor):
                campos.append(
                    {"campo": f"umbrales[{i}].umbral", "mensaje": "Usa un valor entre 10 % y 90 %."}
                )
            umbrales[cambio.caracteristica_id] = valor
        if campos:
            raise ErrorApi(
                422,
                "UMBRAL_FUERA_DE_RANGO",
                "Usa valores entre 10 % y 90 %.",
                campos,
                {"rango": {"min": float(MINIMO), "max": float(MAXIMO)}},
            )
        if nueva.usar_umbral_por_caracteristica:
            faltan = [c.codigo for i, c in caracteristicas.items() if umbrales.get(i) is None]
            if faltan:
                raise ErrorApi(
                    422,
                    "UMBRALES_INCOMPLETOS",
                    "En modo por característica, cada una necesita su umbral.",
                    [{"campo": "umbrales", "mensaje": "Faltan: " + ", ".join(faltan)}],
                )

        antes = _fotografia(config, list(caracteristicas.values()))
        config.umbral_global = umbral_global
        config.usar_umbral_por_caracteristica = nueva.usar_umbral_por_caracteristica
        # La relación, no el id: la app no recarga objetos al confirmar (expire_on_commit=False)
        config.actualizador = actor
        for caracteristica_id, valor in umbrales.items():
            caracteristicas[caracteristica_id].umbral = valor
        despues = _fotografia(config, list(caracteristicas.values()))

        self._publicador.publicar(
            EventoAuditoria(
                accion=AccionBitacora.CONFIGURACION_INFERENCIA_CAMBIADA,
                actor_id=actor.id,
                entidad="ConfiguracionInferencia",
                entidad_id="1",
                detalle={"antes": antes, "despues": despues},
                ip=ip,
            )
        )
        self._unidad.confirmar()
        return self.ver()
