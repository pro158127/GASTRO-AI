"""El armadero de piezas: Depends junta servicio + repositorio para cada petición.

Aquí viven también la sesión actual, la etapa y el rol. En las pruebas se reemplazan con
dependency_overrides y listo. Todo lo que pide `DbSession` en una misma petición recibe
LA MISMA sesión de base (FastAPI la cachea), así la acción y su bitácora van juntas.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.adapters.almacen import Almacen, crear_almacen
from app.adapters.cola import Cola, ColaCelery
from app.adapters.correo import EnviadorCorreo, crear_enviador
from app.adapters.filtraciones import VerificadorFiltraciones, crear_verificador
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.errores import ErrorApi
from app.core.seguridad import CifradorTotp
from app.core.seudonimo import Seudonimizador
from app.models import CodigoRol, EtapaSesion, Sesion
from app.repositories.analisis_repository import RepositorioAnalisis
from app.repositories.bitacora_repository import RepositorioBitacora
from app.repositories.catalogo_repository import RepositorioCatalogo
from app.repositories.credenciales_repository import RepositorioCredenciales
from app.repositories.health_repository import HealthRepository
from app.repositories.historial_repository import RepositorioHistorial
from app.repositories.pacientes_repository import RepositorioPacientes
from app.repositories.resumen_cuentas_repository import RepositorioResumenCuentas
from app.repositories.sesiones_repository import RepositorioSesiones
from app.repositories.traslados_repository import RepositorioTraslados
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.repositories.usuarios_repository import RepositorioUsuarios
from app.services.analisis import ServicioAnalisis
from app.services.auditoria import PublicadorEventos, SuscriptorBitacora
from app.services.autenticacion import ReglasSesion, ServicioAutenticacion
from app.services.configuracion_inferencia import ServicioConfiguracionInferencia
from app.services.credenciales import ServicioCredenciales
from app.services.health_service import HealthService
from app.services.historial import ServicioHistorial
from app.services.imagenes import ServicioImagenes
from app.services.pacientes import ServicioPacientes
from app.services.perfil import ServicioPerfil
from app.services.resumen_cuentas import ServicioResumenCuentas
from app.services.usuarios import ServicioUsuarios
from app.services.verificadores_imagen import construir_cadena
from app.workers.celery_app import celery_app

# El nombre de la cookie lo fija la especificación de la API; el front no la lee nunca
COOKIE_SESION = "gastro_sesion"
# X-Actividad-Pasiva: 1 → la petición no renueva la inactividad (ARCHITECTURE.md §3.5)
CABECERA_PASIVA = "X-Actividad-Pasiva"

DbSession = Annotated[Session, Depends(get_db)]


def get_ajustes() -> Settings:
    return get_settings()


Ajustes = Annotated[Settings, Depends(get_ajustes)]


def get_health_service(db: DbSession) -> HealthService:
    return HealthService(HealthRepository(db))


def get_publicador(db: DbSession) -> PublicadorEventos:
    """Un publicador por petición, atado a la misma sesión que usa el servicio."""
    return PublicadorEventos([SuscriptorBitacora(RepositorioBitacora(db))])


Publicador = Annotated[PublicadorEventos, Depends(get_publicador)]


@lru_cache
def _verificador(activo: bool, url: str, timeout: float) -> VerificadorFiltraciones:
    # Uno solo pa toda la app: reusa las conexiones a HIBP en vez de abrir una por petición
    return crear_verificador(activo, url, timeout)


def get_verificador_filtraciones(ajustes: Ajustes) -> VerificadorFiltraciones:
    return _verificador(
        ajustes.contrasenas_filtradas_activo,
        ajustes.contrasenas_filtradas_url,
        ajustes.contrasenas_filtradas_timeout_seconds,
    )


def get_servicio_autenticacion(
    db: DbSession,
    publicador: Publicador,
    ajustes: Ajustes,
    verificador: Annotated[VerificadorFiltraciones, Depends(get_verificador_filtraciones)],
) -> ServicioAutenticacion:
    return ServicioAutenticacion(
        usuarios=RepositorioUsuarios(db),
        sesiones=RepositorioSesiones(db),
        publicador=publicador,
        unidad=UnidadTrabajo(db),
        cifrador=lambda: CifradorTotp(ajustes.totp_clave_cifrado.get_secret_value()),
        verificador=verificador,
        reglas=ReglasSesion(
            inactividad=timedelta(minutes=ajustes.sesion_inactividad_minutos),
            intentos=ajustes.bloqueo_intentos,
            bloqueo=timedelta(minutes=ajustes.bloqueo_minutos),
        ),
    )


ServicioAuth = Annotated[ServicioAutenticacion, Depends(get_servicio_autenticacion)]


def get_enviador_correo(ajustes: Ajustes) -> EnviadorCorreo:
    return crear_enviador(ajustes)


def _ahora() -> datetime:
    return datetime.now(UTC)


def get_servicio_usuarios(
    db: DbSession,
    publicador: Publicador,
    enviador: Annotated[EnviadorCorreo, Depends(get_enviador_correo)],
) -> ServicioUsuarios:
    credenciales_repo = RepositorioCredenciales(db)
    return ServicioUsuarios(
        usuarios=RepositorioUsuarios(db),
        sesiones=RepositorioSesiones(db),
        traslados=RepositorioTraslados(db),
        credenciales_repo=credenciales_repo,
        credenciales=ServicioCredenciales(credenciales_repo, enviador, publicador, _ahora),
        publicador=publicador,
        unidad=UnidadTrabajo(db),
        reloj=_ahora,
    )


ServicioCuentas = Annotated[ServicioUsuarios, Depends(get_servicio_usuarios)]


def get_servicio_resumen_cuentas(db: DbSession) -> ServicioResumenCuentas:
    return ServicioResumenCuentas(RepositorioResumenCuentas(db), _ahora)


ServicioDeResumenCuentas = Annotated[ServicioResumenCuentas, Depends(get_servicio_resumen_cuentas)]


def get_servicio_configuracion(
    db: DbSession, publicador: Publicador
) -> ServicioConfiguracionInferencia:
    return ServicioConfiguracionInferencia(RepositorioCatalogo(db), publicador, UnidadTrabajo(db))


ServicioConfiguracion = Annotated[
    ServicioConfiguracionInferencia, Depends(get_servicio_configuracion)
]


def get_catalogo(db: DbSession) -> RepositorioCatalogo:
    return RepositorioCatalogo(db)


Catalogo = Annotated[RepositorioCatalogo, Depends(get_catalogo)]


def get_seudonimizador(ajustes: Ajustes) -> Seudonimizador:
    """Con todas las versiones de HMAC_CLAVES. Mal configuradas → 500 genérico + log."""
    claves = {version: clave.get_secret_value() for version, clave in ajustes.hmac_claves.items()}
    return Seudonimizador(claves, ajustes.hmac_version_actual)


def get_servicio_pacientes(
    db: DbSession, seudonimizador: Annotated[Seudonimizador, Depends(get_seudonimizador)]
) -> ServicioPacientes:
    return ServicioPacientes(RepositorioPacientes(db), seudonimizador)


ServicioDePacientes = Annotated[ServicioPacientes, Depends(get_servicio_pacientes)]


@lru_cache
def _almacen_compartido() -> Almacen:
    # Un cliente boto3 pa toda la app: es thread-safe y crearlo cuesta
    return crear_almacen(get_settings())


def get_almacen() -> Almacen:
    return _almacen_compartido()


def get_cola() -> Cola:
    return ColaCelery(celery_app)


def get_servicio_imagenes(
    ajustes: Ajustes, almacen: Annotated[Almacen, Depends(get_almacen)]
) -> ServicioImagenes:
    return ServicioImagenes(
        construir_cadena(),
        almacen,
        timedelta(minutes=ajustes.imagen_temporal_minutos),
        _ahora,
    )


ServicioDeImagenes = Annotated[ServicioImagenes, Depends(get_servicio_imagenes)]


def get_servicio_analisis(
    db: DbSession,
    imagenes: ServicioDeImagenes,
    almacen: Annotated[Almacen, Depends(get_almacen)],
    seudonimizador: Annotated[Seudonimizador, Depends(get_seudonimizador)],
    cola: Annotated[Cola, Depends(get_cola)],
) -> ServicioAnalisis:
    return ServicioAnalisis(
        RepositorioAnalisis(db), imagenes, almacen, seudonimizador, cola, UnidadTrabajo(db), _ahora
    )


ServicioDeAnalisis = Annotated[ServicioAnalisis, Depends(get_servicio_analisis)]


def get_servicio_historial(
    db: DbSession, seudonimizador: Annotated[Seudonimizador, Depends(get_seudonimizador)]
) -> ServicioHistorial:
    return ServicioHistorial(RepositorioHistorial(db), seudonimizador)


ServicioDeHistorial = Annotated[ServicioHistorial, Depends(get_servicio_historial)]


def get_servicio_perfil(db: DbSession, publicador: Publicador) -> ServicioPerfil:
    return ServicioPerfil(publicador, UnidadTrabajo(db))


ServicioMiPerfil = Annotated[ServicioPerfil, Depends(get_servicio_perfil)]


def ip_cliente(request: Request) -> str | None:
    """IP real del usuario. Detrás de nginx sale del X-Forwarded-For (uvicorn --proxy-headers)."""
    return request.client.host if request.client else None


IpCliente = Annotated[str | None, Depends(ip_cliente)]


def sesion_en(*etapas: EtapaSesion) -> Callable[..., Sesion]:
    """Dependencia que exige una sesión válida en alguna de esas etapas.

    Ejemplo: `sesion: Annotated[Sesion, Depends(sesion_en(EtapaSesion.PENDIENTE_2FA))]`.
    """

    def _dependencia(request: Request, servicio: ServicioAuth) -> Sesion:
        # Consultas automáticas (polling, aviso de inactividad): no renuevan la sesión
        pasiva = request.headers.get(CABECERA_PASIVA, "").strip() == "1"
        return servicio.validar_sesion(request.cookies.get(COOKIE_SESION), etapas, pasiva)

    return _dependencia


# La de todos los días: sesión completa (pasó la contraseña y el segundo factor)
SesionActiva = Annotated[Sesion, Depends(sesion_en(EtapaSesion.ACTIVA))]


def requiere_rol(*roles: CodigoRol) -> Callable[..., Sesion]:
    """Rol leído de la base en cada petición (RF-U03 CA 4, RNF-01). Rol equivocado → 403."""

    def _dependencia(sesion: SesionActiva) -> Sesion:
        if sesion.usuario.rol.codigo not in roles:
            raise ErrorApi(403, "PERMISO_DENEGADO", "No tienes permiso para esta acción.")
        return sesion

    return _dependencia


SesionDoctor = Annotated[Sesion, Depends(requiere_rol(CodigoRol.DOCTOR))]
SesionAdmin = Annotated[Sesion, Depends(requiere_rol(CodigoRol.ADMINISTRADOR))]
