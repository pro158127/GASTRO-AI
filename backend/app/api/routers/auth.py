"""Controlador de /auth (AUTH-01 a AUTH-08). Aquí solo HTTP y la cookie; las reglas, en el servicio.

Pal front: la sesión viaja en la cookie gastro_sesion (HttpOnly, Secure, SameSite=Strict),
así que JavaScript nunca la ve y no hay que mandar ningún header de Authorization. Basta
con hacer fetch con `credentials: "include"` (o "same-origin" si todo va por nginx).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from app.api.deps import (
    COOKIE_SESION,
    IpCliente,
    ServicioAuth,
    SesionActiva,
    sesion_en,
)
from app.core.errores import ErrorApi
from app.models import EtapaSesion, Sesion, Usuario
from app.schemas.auth import (
    CodigoEntrada,
    LoginEntrada,
    LogoutEntrada,
    NuevaContrasenaEntrada,
    RespuestaEtapa,
    RespuestaIngreso,
    RespuestaSesion,
    RespuestaVencimiento,
    RespuestaVinculacion,
    UsuarioSesion,
)
from app.schemas.errores import RespuestaError

router = APIRouter(prefix="/auth", tags=["autenticación"])

ERRORES = {401: {"model": RespuestaError}, 403: {"model": RespuestaError}}

SesionCualquiera = Annotated[Sesion, Depends(sesion_en(*EtapaSesion))]


def _usuario(usuario: Usuario) -> UsuarioSesion:
    return UsuarioSesion(
        id=usuario.id, nombre=usuario.nombre, apellido=usuario.apellido, rol=usuario.rol.codigo
    )


def _poner_cookie(respuesta: Response, token: str) -> None:
    # Sin max_age: cookie de sesión del navegador. El vencimiento real lo controla el
    # servidor con la inactividad de 10 min, no la cookie.
    respuesta.set_cookie(
        COOKIE_SESION, token, httponly=True, secure=True, samesite="strict", path="/"
    )


@router.post("/login", response_model=RespuestaEtapa, responses=ERRORES)
def login(entrada: LoginEntrada, respuesta: Response, servicio: ServicioAuth, ip: IpCliente):
    """AUTH-01 · Correo y contraseña. Devuelve la etapa que sigue y deja la cookie puesta."""
    inicio = servicio.iniciar_sesion(entrada.correo, entrada.contrasena, ip)
    _poner_cookie(respuesta, inicio.token)
    return RespuestaEtapa(etapa=inicio.etapa)


@router.post("/2fa", response_model=RespuestaIngreso, responses=ERRORES)
def segundo_factor(
    entrada: CodigoEntrada,
    sesion: Annotated[Sesion, Depends(sesion_en(EtapaSesion.PENDIENTE_2FA))],
    servicio: ServicioAuth,
    ip: IpCliente,
):
    """AUTH-02 · Código de 6 dígitos de la app autenticadora."""
    usuario = servicio.verificar_segundo_factor(sesion, entrada.codigo, ip)
    return RespuestaIngreso(etapa=EtapaSesion.ACTIVA, usuario=_usuario(usuario))


@router.post(
    "/contrasena-temporal",
    response_model=RespuestaEtapa,
    responses={**ERRORES, 422: {"model": RespuestaError}},
)
def cambiar_temporal(
    entrada: NuevaContrasenaEntrada,
    sesion: Annotated[Sesion, Depends(sesion_en(EtapaSesion.CAMBIO_CONTRASENA))],
    servicio: ServicioAuth,
    ip: IpCliente,
):
    """AUTH-03 · Cambio obligatorio de la temporal (12 a 64 caracteres, RF-U02)."""
    return RespuestaEtapa(etapa=servicio.cambiar_temporal(sesion, entrada.nueva_contrasena, ip))


@router.post("/totp/vinculacion", response_model=RespuestaVinculacion, responses=ERRORES)
def generar_vinculacion(
    sesion: Annotated[Sesion, Depends(sesion_en(EtapaSesion.VINCULAR_TOTP))],
    servicio: ServicioAuth,
):
    """AUTH-04 · QR y clave escrita pa vincular la app autenticadora."""
    return RespuestaVinculacion(**servicio.generar_vinculacion(sesion))


@router.post("/totp/confirmacion", response_model=RespuestaIngreso, responses=ERRORES)
def confirmar_vinculacion(
    entrada: CodigoEntrada,
    sesion: Annotated[Sesion, Depends(sesion_en(EtapaSesion.VINCULAR_TOTP))],
    servicio: ServicioAuth,
    ip: IpCliente,
):
    """AUTH-05 · Primer código válido: la app queda vinculada y la cuenta, activa."""
    usuario = servicio.confirmar_vinculacion(sesion, entrada.codigo, ip)
    return RespuestaIngreso(etapa=EtapaSesion.ACTIVA, usuario=_usuario(usuario))


@router.get("/sesion", response_model=RespuestaSesion, responses=ERRORES)
def ver_sesion(sesion: SesionCualquiera, servicio: ServicioAuth):
    """AUTH-06 · Quién soy, en qué etapa voy y a qué hora vence la sesión.

    Es lo que el front llama al recargar la página. Si la manda con X-Actividad: pasiva
    no renueva la sesión.
    """
    return RespuestaSesion(
        etapa=sesion.etapa, vence_en=servicio.vence_en(sesion), usuario=_usuario(sesion.usuario)
    )


@router.post("/sesion/actividad", response_model=RespuestaVencimiento, responses=ERRORES)
def seguir_activo(sesion: SesionActiva, servicio: ServicioAuth):
    """AUTH-07 · «Sigo aquí» del diálogo del minuto 9. La dependencia ya renovó la sesión."""
    return RespuestaVencimiento(vence_en=servicio.vence_en(sesion))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    servicio: ServicioAuth,
    ip: IpCliente,
    entrada: LogoutEntrada | None = None,
):
    """AUTH-08 · Cierra la sesión en el servidor y borra la cookie. Siempre responde 204.

    Si la sesión ya había vencido (el front llama esto al llegar a los 10 min), no hay
    nada que cerrar y tampoco se le responde error: así nadie queda atrapado en una
    sesión que no puede cerrar. Se valida en modo pasivo pa no renovarla justo al cerrar.
    """
    try:
        sesion = servicio.validar_sesion(
            request.cookies.get(COOKIE_SESION), tuple(EtapaSesion), pasiva=True
        )
        por_inactividad = entrada is not None and entrada.motivo == "inactividad"
        servicio.cerrar_sesion(sesion, por_inactividad, ip)
    except ErrorApi as error:
        if error.estado != 401:
            raise
    respuesta = Response(status_code=status.HTTP_204_NO_CONTENT)
    respuesta.delete_cookie(COOKIE_SESION, httponly=True, secure=True, samesite="strict", path="/")
    return respuesta
