"""Controlador de /auth (contrato en ARCHITECTURE.md §3.5). Aquí solo HTTP y la cookie.

Pal front: la sesión viaja en la cookie gastro_sesion (HttpOnly, Secure, SameSite=Strict),
así que JavaScript nunca la ve y no hay que mandar ningún header de Authorization. Basta
con hacer fetch con `credentials: "same-origin"` pasando por nginx.

| Etapa             | Endpoints que abre                                   |
| ----------------- | ---------------------------------------------------- |
| CAMBIO_CONTRASENA | /auth/contrasena/cambiar                             |
| VINCULAR_TOTP     | /auth/totp/iniciar, /auth/totp/vincular              |
| PENDIENTE_2FA     | /auth/totp/verificar                                 |
| cualquiera        | /auth/sesion, /auth/sesion/continuar, /auth/logout   |
| ACTIVA            | el resto de la API, según el rol                     |
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from app.api.deps import (
    COOKIE_SESION,
    IpCliente,
    ServicioAuth,
    sesion_en,
)
from app.core.errores import ErrorApi
from app.models import EtapaSesion, Sesion, Usuario
from app.schemas.auth import (
    CambioContrasenaEntrada,
    CodigoEntrada,
    LoginEntrada,
    LogoutEntrada,
    RespuestaContinuar,
    RespuestaEtapa,
    RespuestaIngreso,
    RespuestaSesion,
    RespuestaTotpIniciar,
    UsuarioSesion,
)
from app.schemas.errores import RespuestaError

router = APIRouter(prefix="/auth", tags=["autenticación"])

ERRORES = {
    401: {"model": RespuestaError},
    403: {"model": RespuestaError},
    422: {"model": RespuestaError},
}

SesionCualquiera = Annotated[Sesion, Depends(sesion_en(*EtapaSesion))]


def _usuario(usuario: Usuario) -> UsuarioSesion:
    return UsuarioSesion(
        id=usuario.id, nombre=usuario.nombre, apellido=usuario.apellido, rol=usuario.rol.codigo
    )


def _ingreso(usuario: Usuario, servicio) -> RespuestaIngreso:
    return RespuestaIngreso(
        etapa=EtapaSesion.ACTIVA,
        usuario=_usuario(usuario),
        ruta_inicial=servicio.ruta_inicial(usuario),
    )


def _poner_cookie(respuesta: Response, token: str) -> None:
    # Sin max_age: cookie de sesión del navegador. El vencimiento real lo controla el
    # servidor con la inactividad de 10 min, no la cookie.
    respuesta.set_cookie(
        COOKIE_SESION, token, httponly=True, secure=True, samesite="strict", path="/"
    )


@router.post("/login", response_model=RespuestaEtapa, responses=ERRORES)
def login(entrada: LoginEntrada, respuesta: Response, servicio: ServicioAuth, ip: IpCliente):
    """Correo y contraseña (W-01). Devuelve la etapa que sigue y deja la cookie puesta.

    Cualquier fallo de credenciales: 401 AUTH_CREDENCIALES_INVALIDAS. Temporal vencida
    (solo con la contraseña correcta): 403 AUTH_TEMPORAL_EXPIRADA (W-01e).
    """
    inicio = servicio.iniciar_sesion(entrada.correo, entrada.contrasena, ip)
    _poner_cookie(respuesta, inicio.token)
    return RespuestaEtapa(etapa=inicio.etapa)


@router.post("/contrasena/cambiar", response_model=RespuestaEtapa, responses=ERRORES)
def cambiar_contrasena(
    entrada: CambioContrasenaEntrada,
    sesion: Annotated[Sesion, Depends(sesion_en(EtapaSesion.CAMBIO_CONTRASENA))],
    servicio: ServicioAuth,
    ip: IpCliente,
):
    """Cambio obligatorio de la temporal (W-02). 422 CONTRASENA_NO_CUMPLE_POLITICA trae
    `campos` y `requisitos` [{codigo, cumple}] pa la lista de W-02b."""
    etapa = servicio.cambiar_temporal(sesion, entrada.contrasena_nueva, entrada.confirmacion, ip)
    return RespuestaEtapa(etapa=etapa)


@router.post("/totp/iniciar", response_model=RespuestaTotpIniciar, responses=ERRORES)
def iniciar_totp(
    sesion: Annotated[Sesion, Depends(sesion_en(EtapaSesion.VINCULAR_TOTP))],
    servicio: ServicioAuth,
):
    """QR y secreto escrito pa vincular la app (W-03). El secreto solo viaja aquí.

    Llamarlo otra vez genera un secreto nuevo mientras no esté vinculado.
    """
    return RespuestaTotpIniciar(**servicio.generar_vinculacion(sesion))


@router.post("/totp/vincular", response_model=RespuestaIngreso, responses=ERRORES)
def vincular_totp(
    entrada: CodigoEntrada,
    sesion: Annotated[Sesion, Depends(sesion_en(EtapaSesion.VINCULAR_TOTP))],
    servicio: ServicioAuth,
    ip: IpCliente,
):
    """Primer código válido: la app queda vinculada y la cuenta, activa (W-03).

    Código malo: 422 TOTP_CODIGO_INVALIDO (W-03b). Sin /totp/iniciar antes: 409 TOTP_NO_INICIADO.
    """
    return _ingreso(servicio.confirmar_vinculacion(sesion, entrada.codigo, ip), servicio)


@router.post("/totp/verificar", response_model=RespuestaIngreso, responses=ERRORES)
def verificar_totp(
    entrada: CodigoEntrada,
    sesion: Annotated[Sesion, Depends(sesion_en(EtapaSesion.PENDIENTE_2FA))],
    servicio: ServicioAuth,
    ip: IpCliente,
):
    """Código de 6 dígitos en cada ingreso (W-04). Malo o vencido: 401 TOTP_CODIGO_INVALIDO."""
    return _ingreso(servicio.verificar_segundo_factor(sesion, entrada.codigo, ip), servicio)


@router.get("/sesion", response_model=RespuestaSesion, responses=ERRORES)
def ver_sesion(sesion: SesionCualquiera, servicio: ServicioAuth):
    """Quién soy, en qué etapa voy y cómo va la inactividad. Funciona en cualquier etapa.

    Lo llama el front al cargar la app. Con X-Actividad-Pasiva: 1 no renueva la sesión.
    Sin sesión o vencida: 401 SESION_EXPIRADA (con motivo INACTIVIDAD si fue por eso).
    """
    return RespuestaSesion(
        etapa=sesion.etapa,
        usuario=_usuario(sesion.usuario),
        inactividad=servicio.inactividad(sesion),
        casos_recibidos_nuevos=servicio.casos_recibidos_nuevos(sesion),
    )


@router.post("/sesion/continuar", response_model=RespuestaContinuar, responses=ERRORES)
def continuar_sesion(sesion: SesionCualquiera):
    """«Sigo aquí» del aviso del minuto 9 (RF-U10 CA 4). La dependencia ya renovó la sesión.

    Funciona en cualquier etapa: también en el cambio de contraseña, la vinculación del TOTP
    y el código, pa que ahí también se pueda avisar y ampliar el tiempo (WCAG 2.2.1). No
    salta ningún paso: solo renueva la inactividad, como cualquier otra petición.
    """
    return RespuestaContinuar(ultima_actividad_en=sesion.ultima_actividad_en)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    servicio: ServicioAuth,
    ip: IpCliente,
    entrada: LogoutEntrada | None = None,
):
    """Cierra la sesión en el servidor y borra la cookie. Siempre responde 204.

    Si la sesión ya había vencido, no hay nada que cerrar y tampoco se le responde error:
    así nadie queda atrapado en una sesión que no puede cerrar. Se valida en modo pasivo
    pa no renovarla justo al cerrar.
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
