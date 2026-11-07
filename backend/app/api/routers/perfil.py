"""Controlador de /perfil: el propio usuario, cualquiera de los dos roles (RF-U04)."""

from fastapi import APIRouter

from app.api.deps import IpCliente, ServicioMiPerfil, SesionActiva
from app.models import Usuario
from app.schemas.errores import RespuestaError
from app.schemas.usuarios import EdicionPerfil, Perfil, RolPerfil

router = APIRouter(prefix="/perfil", tags=["perfil"])

ERRORES = {401: {"model": RespuestaError}, 422: {"model": RespuestaError}}


def _perfil(usuario: Usuario) -> Perfil:
    return Perfil(
        id=usuario.id,
        nombre=usuario.nombre,
        apellido=usuario.apellido,
        correo=usuario.correo,
        telefono=usuario.telefono,
        rol=RolPerfil(codigo=usuario.rol.codigo, nombre=usuario.rol.nombre),
        estado=usuario.estado,
        creado_en=usuario.creado_en,
        totp_vinculado=usuario.totp_vinculado_en is not None,
    )


@router.get("", response_model=Perfil, responses=ERRORES)
def ver(sesion: SesionActiva):
    """Mis datos. El correo y el rol se ven pero no se editan aquí (RF-U04 CA 2)."""
    return _perfil(sesion.usuario)


@router.patch("", response_model=Perfil, responses=ERRORES)
def editar(entrada: EdicionPerfil, sesion: SesionActiva, servicio: ServicioMiPerfil, ip: IpCliente):
    """Nombre, apellido y teléfono. Si mandan correo o rol, se ignoran (solo los cambia el
    administrador). `telefono: null` lo borra (es opcional, minimización de datos)."""
    return _perfil(servicio.editar(sesion.usuario, entrada.a_cambios(), ip))
