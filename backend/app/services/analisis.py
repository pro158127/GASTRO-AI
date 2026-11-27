"""Paso 2 de la carga: POST /analisis, y la lectura del análisis (contrato §3.4 a §3.6).

`ServicioAnalisis` es la Fachada: el controlador hace UNA llamada y aquí adentro pasa
todo, en este orden (contrato §3.4):
  normalizar documento → candado del paciente → imagen temporal → modelo vigente →
  buscar o crear el caso → código A-AAAA-NNNNNN → mover la imagen → guardar → encolar.
El documento solo vive en memoria durante la petición (RF-D01 CA 5, RNF-04).

`ProxyAccesoAnalisis` es el Proxy: deja ver un análisis solo si su caso es del doctor de
la sesión (propio o recibido por traslado). Si no, 404 como si no existiera (S-01).
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from enum import StrEnum
from uuid import UUID, uuid4

from app.adapters.almacen import Almacen, ErrorAlmacen
from app.adapters.cola import Cola, ErrorCola
from app.core.errores import ErrorApi
from app.core.seudonimo import Seudonimizador
from app.models import (
    Analisis,
    CasoPaciente,
    EstadoAnalisis,
    EstadoInferencia,
    EtapaProceso,
    ExplicacionLlm,
    FormatoImagen,
    LogInferencia,
    ObservacionProfesional,
    Traslado,
    Usuario,
    Valoracion,
)
from app.repositories.analisis_repository import RepositorioAnalisis
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.explicacion import ServicioExplicaciones
from app.services.imagenes import ServicioImagenes
from app.services.pacientes import documento_normalizado

log = logging.getLogger("gastroia.analisis")

# Colombia no tiene horario de verano: -05:00 fijo, sin depender de tzdata en Windows.
# El año del código es el de Cali, no el de Greenwich (un 31 de dic a las 8 p. m. ya es
# 2027 en UTC y el doctor vería A-2027 en un análisis del 2026).
ZONA_COLOMBIA = timezone(timedelta(hours=-5))

# Una entrega viva no pasa de 150 s (task_time_limit); si en 10 min nadie renovó
# procesando_desde, el worker murió y el mensaje no volvió (PROC-01)
ATASCO = timedelta(minutes=10)
# Va en LogInferencia.codigo_error para distinguirlo en la supervisión
CODIGO_SIN_WORKER = "SIN_RESPUESTA_WORKER"


class CodigoFalla(StrEnum):
    """Catálogo de `codigo_error` del análisis (contrato §3.5: «definir el catálogo»).

    Es lo único que ve el doctor de una falla; el detalle técnico queda en el log del worker.
    """

    CALIDAD_INSUFICIENTE = "ERR-1001"  # W-07b
    SERVICIO_NO_DISPONIBLE = "ERR-1002"  # W-07c: el Space no responde, timeout o revisión distinta
    COLA_NO_DISPONIBLE = "ERR-1003"  # Redis caído al encolar
    ERROR_INTERNO = "ERR-1004"  # cualquier otra cosa que truene en el worker


@dataclass(frozen=True)
class SolicitudAnalisis:
    imagen_id: str
    tipo_documento: str
    numero_documento: str
    confirmacion_documento: str | None = None


@dataclass(frozen=True)
class DetalleAnalisis:
    """El análisis ya cargado + lo que no cuelga de él directo (el traslado)."""

    analisis: Analisis
    traslado: Traslado | None


# El orden en que W-07 pinta los pasos
ETAPAS = [
    EtapaProceso.ANONIMIZAR,
    EtapaProceso.CALIDAD,
    EtapaProceso.CLASIFICAR,
    EtapaProceso.GRAD_CAM,
]


def etapas_de(analisis: Analisis) -> list[tuple[str, str]]:
    """(código, estado) de cada etapa pa W-07, sacados de `estado` + `etapa_proceso`.

    - COMPLETADO: todas LISTO.
    - PROCESANDO: las de antes LISTO, la actual EN_CURSO, el resto PENDIENTE
      (sin etapa todavía = sigue en la cola, todas PENDIENTE).
    - FALLIDO: igual, pero la actual en ERROR (sin etapa = tronó al encolar, la primera).
    """
    fallido = analisis.estado is EstadoAnalisis.FALLIDO
    if analisis.estado is EstadoAnalisis.COMPLETADO:
        return [(e.value, "LISTO") for e in ETAPAS]
    if analisis.etapa_proceso is None and not fallido:
        return [(e.value, "PENDIENTE") for e in ETAPAS]
    actual = ETAPAS.index(analisis.etapa_proceso) if analisis.etapa_proceso else 0
    marca = "ERROR" if fallido else "EN_CURSO"
    return [
        (e.value, "LISTO" if i < actual else marca if i == actual else "PENDIENTE")
        for i, e in enumerate(ETAPAS)
    ]


def codigo_analisis(numero: int, cuando: datetime) -> str:
    """A-2026-000147 (RNF-24). Más de un millón en un año y crece a 7 dígitos, sin drama."""
    return f"A-{cuando.astimezone(ZONA_COLOMBIA).year}-{numero:06d}"


class ProxyAccesoAnalisis:
    """Mismo «obtener» del repositorio, pero filtrado por el doctor de la sesión (RF-H01 CA 4)."""

    def __init__(self, repositorio: RepositorioAnalisis, doctor_id: UUID) -> None:
        self._real = repositorio
        self._doctor_id = doctor_id

    def obtener(self, analisis_id: UUID) -> Analisis:
        analisis = self._real.del_doctor(analisis_id, self._doctor_id)
        if analisis is None:
            raise ErrorApi(404, "NO_ENCONTRADO", "No encontramos este análisis.")
        return analisis


class ServicioAnalisis:
    def __init__(
        self,
        repositorio: RepositorioAnalisis,
        imagenes: ServicioImagenes,
        almacen: Almacen,
        seudonimizador: Seudonimizador,
        cola: Cola,
        unidad: UnidadTrabajo,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repositorio
        self._imagenes = imagenes
        self._almacen = almacen
        self._seudonimizador = seudonimizador
        self._cola = cola
        self._unidad = unidad
        self._reloj = reloj
        # En la API no se llama a Gemini: solo se consulta y se reabre (redactor=None)
        self._explicaciones = ServicioExplicaciones(repositorio, None, unidad, "", reloj)

    def solicitar(self, doctor: Usuario, solicitud: SolicitudAnalisis) -> Analisis:
        valor = documento_normalizado(solicitud.tipo_documento, solicitud.numero_documento)
        actual = self._seudonimizador.actual(valor)

        # Desde aquí hasta el commit, nadie más crea casos de este paciente
        self._repo.tomar_candado_paciente(actual.valor)
        # Dentro del candado: si otra petición ya usó esta imagen, aquí ya no está (410)
        temporal = self._imagenes.tomar(doctor.id, solicitud.imagen_id)

        modelo = self._repo.modelo_vigente()
        if modelo is None:
            raise ErrorApi(
                503, "SERVICIO_NO_DISPONIBLE", "El servicio de análisis no está disponible."
            )

        seudonimos = self._seudonimizador.todos(valor)
        caso = self._repo.caso_del_doctor(doctor.id, seudonimos)
        # Sin un análisis COMPLETADO con este doctor, el número va dos veces y debe coincidir
        # (RF-D01, W-06i). Un caso con solo análisis fallidos no cuenta: si contara, un número
        # mal escrito cuyo análisis falló quedaría como paciente conocido y nadie lo revisaría.
        # Es la misma regla de POST /pacientes/consulta.
        if caso is None or not self._repo.paciente_con_historial(doctor.id, seudonimos):
            self._exigir_confirmacion(solicitud, valor)
        if caso is None:
            caso = CasoPaciente(
                id=uuid4(),
                seudonimo=actual.valor,
                version_clave=actual.version_clave,
                doctor_asignado=doctor,
            )
            self._repo.agregar(caso)

        ahora = self._reloj()
        analisis_id = uuid4()
        extension = "png" if temporal.formato is FormatoImagen.PNG else "jpg"
        clave = f"analisis/{analisis_id}.{extension}"
        # Copiar y borrar tmp/ ANTES del commit: con el candado puesto, una segunda petición
        # con el mismo imagen_id ya no la encuentra. Si el commit falla queda una copia
        # huérfana en analisis/, que no tiene datos del paciente y no le hace daño a nadie.
        self._almacen.copiar(temporal.clave, clave)
        try:
            self._almacen.borrar(temporal.clave)
        except ErrorAlmacen:
            log.warning("No se pudo borrar la imagen temporal; la limpia el ciclo de vida")

        analisis = Analisis(
            id=analisis_id,
            codigo=codigo_analisis(self._repo.siguiente_numero(), ahora),
            caso=caso,
            doctor_ejecutor=doctor,
            modelo=modelo,
            imagen_clave_objeto=clave,
            imagen_sha256=temporal.sha256,
            imagen_formato=temporal.formato,
            imagen_ancho=temporal.ancho,
            imagen_alto=temporal.alto,
            imagen_peso_bytes=temporal.peso_bytes,
            estado=EstadoAnalisis.PROCESANDO,
            solicitado_en=ahora,
            procesando_desde=ahora,
        )
        self._repo.agregar(analisis)
        self._unidad.confirmar()  # suelta el candado
        self._encolar_o_fallar(analisis)
        return analisis

    def _encolar_o_fallar(self, analisis: Analisis) -> None:
        try:
            self._cola.encolar_analisis(analisis.id)
        except ErrorCola:
            # Ya está guardado: no se borra (un análisis no se cancela), queda FALLIDO y el
            # doctor ve el error en vez de un PROCESANDO eterno
            log.exception("No se pudo encolar el análisis %s", analisis.id)
            analisis.estado = EstadoAnalisis.FALLIDO
            analisis.etapa_proceso = EtapaProceso.ANONIMIZAR
            analisis.codigo_error = CodigoFalla.COLA_NO_DISPONIBLE.value
            self._unidad.confirmar()
            raise _servicio_no_disponible() from None

    def obtener(self, doctor_id: UUID, analisis_id: UUID) -> DetalleAnalisis:
        analisis = ProxyAccesoAnalisis(self._repo, doctor_id).obtener(analisis_id)
        self._cerrar_si_atascado(analisis)
        traslado = (
            self._repo.traslado_recibido(analisis.caso_id, doctor_id)
            if analisis.doctor_ejecutor_id != doctor_id
            else None
        )
        return DetalleAnalisis(analisis, traslado)

    def reintentar(self, doctor_id: UUID, analisis_id: UUID) -> Analisis:
        """ANA-05 (W-07c): vuelve a encolar un análisis FALLIDO con la misma imagen y código.

        No aplica a la calidad insuficiente (ERR-1001): la misma imagen fallaría igual; ahí
        el doctor carga otra. Responde 409 NO_REINTENTABLE.
        """
        analisis = ProxyAccesoAnalisis(self._repo, doctor_id).obtener(analisis_id)
        self._cerrar_si_atascado(analisis)  # uno atascado sí se puede reintentar
        if (
            analisis.estado is not EstadoAnalisis.FALLIDO
            or analisis.codigo_error == CodigoFalla.CALIDAD_INSUFICIENTE.value
        ):
            raise ErrorApi(409, "NO_REINTENTABLE", "Este análisis no se puede reintentar.")
        analisis.estado = EstadoAnalisis.PROCESANDO
        analisis.etapa_proceso = None
        analisis.codigo_error = None
        analisis.procesando_desde = self._reloj()
        self._unidad.confirmar()
        self._encolar_o_fallar(analisis)
        return analisis

    def _cerrar_si_atascado(self, analisis: Analisis) -> None:
        """PROCESANDO sin señales del worker en ATASCO → FALLIDO con ERR-1002 (W-07c).

        Pasa si el worker murió y el mensaje se perdió (Redis reiniciado, cola purgada). Sin
        esto el doctor vería PROCESANDO para siempre y el reintento respondería 409. Se
        bloquea la fila y se vuelve a mirar, por si el worker justo la estaba terminando.
        """
        if analisis.estado is not EstadoAnalisis.PROCESANDO or not self._atascado(analisis):
            return
        self._repo.bloquear(analisis)
        if analisis.estado is not EstadoAnalisis.PROCESANDO or not self._atascado(analisis):
            self._unidad.confirmar()  # suelta el bloqueo
            return
        log.error("Análisis %s atascado en PROCESANDO; se marca FALLIDO", analisis.id)
        self._repo.agregar(
            LogInferencia(
                analisis_id=analisis.id,
                modelo_id=analisis.modelo_id,
                estado=EstadoInferencia.ERROR,
                latencia_vision_ms=0,  # la llamada al Space nunca terminó
                codigo_error=CODIGO_SIN_WORKER,
            )
        )
        analisis.estado = EstadoAnalisis.FALLIDO
        analisis.codigo_error = CodigoFalla.SERVICIO_NO_DISPONIBLE.value
        # La etapa se deja donde iba (sin etapa, etapas_de pinta el ERROR en la primera)
        self._unidad.confirmar()

    def _atascado(self, analisis: Analisis) -> bool:
        # Los análisis de antes de 0004 no tienen procesando_desde: cuenta la solicitud
        desde = analisis.procesando_desde or analisis.solicitado_en
        return desde is not None and self._reloj() - desde >= ATASCO

    def explicacion(
        self, doctor_id: UUID, analisis_id: UUID
    ) -> tuple[Analisis, ExplicacionLlm | None]:
        analisis = ProxyAccesoAnalisis(self._repo, doctor_id).obtener(analisis_id)
        return analisis, analisis.explicacion

    def reintentar_explicacion(self, doctor_id: UUID, analisis_id: UUID) -> ExplicacionLlm:
        """ANA-04 (W-08d): reabre la explicación y la encola con los mismos datos_enviados."""
        analisis = ProxyAccesoAnalisis(self._repo, doctor_id).obtener(analisis_id)
        explicacion = self._explicaciones.reintentar(analisis)
        try:
            self._cola.encolar_explicacion(analisis.id)
        except ErrorCola:
            log.exception("No se pudo encolar la explicación de %s", analisis.id)
            self._explicaciones.marcar_fallida(explicacion)
            raise _servicio_no_disponible() from None
        return explicacion

    def observar(
        self, doctor: Usuario, analisis_id: UUID, valoracion: Valoracion, texto: str | None
    ) -> ObservacionProfesional:
        """RF-D04: la valoración del doctor sobre el resultado, con texto opcional.

        - Una por doctor y análisis, y no se sobrescribe: 409 OBSERVACION_YA_REGISTRADA.
          El doctor que recibe un caso trasladado agrega la suya sin tocar la del doctor de
          origen (RF-A07 CA 3).
        - Solo sobre un resultado: 409 ANALISIS_NO_COMPLETADO.
        - No toca el modelo, que es estático (RF-D04 CA 4).
        """
        analisis = ProxyAccesoAnalisis(self._repo, doctor.id).obtener(analisis_id)
        if analisis.estado is not EstadoAnalisis.COMPLETADO:
            raise ErrorApi(409, "ANALISIS_NO_COMPLETADO", "El análisis todavía no tiene resultado.")
        # Con ids y no con relaciones: si choca con el UNIQUE, no queda colgada en la lista
        # de observaciones del análisis en memoria
        observacion = ObservacionProfesional(
            id=uuid4(),
            analisis_id=analisis.id,
            autor_id=doctor.id,
            valoracion=valoracion,
            texto=(texto or "").strip() or None,
            registrada_en=self._reloj(),
        )
        if not self._repo.agregar_observacion(observacion):
            raise ErrorApi(
                409,
                "OBSERVACION_YA_REGISTRADA",
                "Ya registraste tu valoración para este análisis.",
            )
        # Ya guardada: ahora sí se enlaza, pa que el detalle la muestre sin recargar
        observacion.autor = doctor
        analisis.observaciones.append(observacion)
        self._unidad.confirmar()
        return observacion

    @staticmethod
    def puede_reintentar_explicacion(explicacion: ExplicacionLlm) -> bool:
        return ServicioExplicaciones.puede_reintentar(explicacion)

    def url_firmada(self, clave: str) -> str:
        return self._almacen.url_firmada(clave)

    @staticmethod
    def _exigir_confirmacion(solicitud: SolicitudAnalisis, valor: str) -> None:
        if not solicitud.confirmacion_documento:
            raise _no_coincide()
        confirmacion = documento_normalizado(
            solicitud.tipo_documento,
            solicitud.confirmacion_documento,
            campo_numero="confirmacion_documento",
        )
        if confirmacion != valor:
            raise _no_coincide()


def _servicio_no_disponible() -> ErrorApi:
    return ErrorApi(
        503,
        "SERVICIO_NO_DISPONIBLE",
        "El servicio de análisis no está disponible. Intente de nuevo en unos minutos.",
    )


def _no_coincide() -> ErrorApi:
    mensaje = "Los dos números de documento no coinciden."
    return ErrorApi(
        422,
        "DOCUMENTO_NO_COINCIDE",
        mensaje,
        [{"campo": "confirmacion_documento", "mensaje": mensaje}],
    )
