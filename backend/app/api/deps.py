"""El armadero de piezas: Depends junta servicio + repositorio para cada petición.

Aquí viven también la sesión actual, la etapa y el rol. En las pruebas se reemplazan con
dependency_overrides y listo. Todo lo que pide `DbSession` en una misma petición recibe
LA MISMA sesión de base (FastAPI la cachea), así la acción y su bitácora van juntas.
"""

from collections.abc import Callable
from datetime import timedelta
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.adapters.filtraciones import VerificadorFiltraciones, crear_verificador
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.errores import ErrorApi
from app.core.seguridad import CifradorTotp
from app.models import CodigoRol, EtapaSesion, Sesion
from app.repositories.bitacora_repository import RepositorioBitacora
from app.repositories.health_repository import HealthRepository
from app.repositories.sesiones_repository import RepositorioSesiones
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.repositories.usuarios_repository import RepositorioUsuarios
from app.services.auditoria import PublicadorEventos, SuscriptorBitacora
from app.services.autenticacion import ReglasSesion, ServicioAutenticacion
from app.services.health_service import HealthService

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
