"""Inicio de sesión en dos pasos, cambio de temporal, vinculación TOTP y control de la sesión.

Flujo (RF-U01, RF-U02):
    login ─┬─ temporal ──────► CAMBIO_CONTRASENA ─► (sin TOTP) VINCULAR_TOTP ─► ACTIVA
           ├─ sin TOTP ──────► VINCULAR_TOTP ─────────────────────────────────► ACTIVA
           └─ con TOTP ──────► PENDIENTE_2FA ─────────────────────────────────► ACTIVA
Cada etapa solo abre los endpoints de esa etapa; los demás módulos piden ACTIVA.

Rutas, campos y códigos: el contrato del frontend (ARCHITECTURE.md §3.5).

Reglas que no se negocian, y dónde viven:
- Cualquier fallo de credenciales responde lo mismo, incluida cuenta bloqueada, INACTIVO
  o ELIMINADO (RF-U01 CA 2, RF-U12 CA 2): 401 AUTH_CREDENCIALES_INVALIDAS → GENERICO.
  El contrato proponía 423 y 403 aparte; el equipo lo descartó pa no delatar cuentas.
- La contraseña se verifica SIEMPRE antes de mirar el estado de la cuenta, pa que una
  cuenta inactiva no responda más rápido que una activa (CWE-208).
- 5 fallos seguidos, de contraseña o de código, bloquean 15 min (RF-U12, RNF-03) → _fallo.
- Los fallos se confirman ANTES de responder el error; si no, el contador nunca sube.
"""

import base64
import io
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import NoReturn

import qrcode

from app.adapters.filtraciones import VerificadorFiltraciones
from app.core.errores import ErrorApi
from app.core.seguridad import (
    CifradorTotp,
    generar_secreto_totp,
    generar_token_sesion,
    hash_token,
    hashear_contrasena,
    uri_aprovisionamiento,
    verificar_codigo_totp,
    verificar_contrasena,
)
from app.models import (
    AccionBitacora,
    CodigoRol,
    EstadoUsuario,
    EtapaSesion,
    ResultadoAccion,
    Sesion,
    Usuario,
)
from app.repositories.sesiones_repository import RepositorioSesiones
from app.repositories.traslados_repository import RepositorioTraslados
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.repositories.usuarios_repository import RepositorioUsuarios
from app.services.auditoria import EventoAuditoria, PublicadorEventos
from app.services.politica_contrasena import validar_contrasena

ESTADOS_QUE_ENTRAN = (EstadoUsuario.ACTIVO, EstadoUsuario.PENDIENTE)
TODAS_LAS_ETAPAS = tuple(EtapaSesion)

GENERICO = ("AUTH_CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos.")
CODIGO_INVALIDO = ("TOTP_CODIGO_INVALIDO", "El código es incorrecto o ya venció.")
SESION_EXPIRADA = ("SESION_EXPIRADA", "Tu sesión terminó. Inicia sesión de nuevo.")
MOTIVO_BLOQUEO = "DEMASIADOS_INTENTOS"

# A dónde manda el front después de entrar (ARCHITECTURE.md §3.5)
RUTAS_INICIALES = {
    CodigoRol.DOCTOR: "/doctor/dashboard",
    CodigoRol.ADMINISTRADOR: "/admin/dashboard",
}
AVISO_ANTES_DEL_CIERRE = timedelta(minutes=1)  # el aviso sale al minuto 9 (RF-U10 CA 3)


@dataclass(frozen=True)
class ReglasSesion:
    inactividad: timedelta = timedelta(minutes=10)  # RF-U10
    intentos: int = 5  # RNF-03
    bloqueo: timedelta = timedelta(minutes=15)  # RNF-03


REGLAS_POR_DEFECTO = ReglasSesion()


@dataclass(frozen=True)
class InicioSesion:
    token: str  # va a la cookie y a ningún otro lado
    etapa: EtapaSesion


def _error(estado: int, codigo_mensaje: tuple[str, str]) -> ErrorApi:
    return ErrorApi(estado, *codigo_mensaje)


def _sesion_expirada(motivo: str | None = None) -> ErrorApi:
    return ErrorApi(401, *SESION_EXPIRADA, extra={"motivo": motivo} if motivo else None)


def _qr_png_base64(uri: str) -> str:
    """PNG del QR en Base64 pelado (sin «data:»): el front le pone el prefijo."""
    imagen = qrcode.make(uri, box_size=8, border=2)
    buffer = io.BytesIO()
    imagen.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


class ServicioAutenticacion:
    def __init__(
        self,
        usuarios: RepositorioUsuarios,
        sesiones: RepositorioSesiones,
        publicador: PublicadorEventos,
        unidad: UnidadTrabajo,
        cifrador: Callable[[], CifradorTotp],
        verificador: VerificadorFiltraciones,
        reglas: ReglasSesion = REGLAS_POR_DEFECTO,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
        traslados: RepositorioTraslados | None = None,
    ) -> None:
        self._usuarios = usuarios
        self._sesiones = sesiones
        self._publicador = publicador
        self._unidad = unidad
        self._cifrador = cifrador  # perezoso: sin TOTP_CLAVE_CIFRADO igual se puede hacer login
        self._verificador = verificador
        self._reglas = reglas
        self._reloj = reloj
        self._traslados = traslados

    # ------------------------------------------------------------------ AUTH-01

    def iniciar_sesion(self, correo: str, contrasena: str, ip: str | None) -> InicioSesion:
        usuario = self._usuarios.por_correo(correo.strip().lower())
        contrasena_ok = verificar_contrasena(
            contrasena, usuario.hash_contrasena if usuario else None
        )
        ahora = self._reloj()

        if usuario is None or usuario.estado not in ESTADOS_QUE_ENTRAN:
            self._registrar_y_fallar(usuario, ip, "cuenta")
        if usuario.bloqueado_hasta and usuario.bloqueado_hasta > ahora:  # RF-U12 CA 2
            self._registrar_y_fallar(usuario, ip, "bloqueo")
        if not contrasena_ok:
            self._fallo(usuario, ip, ahora)
            self._registrar_y_fallar(usuario, ip, "contrasena")
        if usuario.contrasena_temporal and (
            usuario.temporal_expira_en is None or usuario.temporal_expira_en < ahora
        ):  # RNF-27. Ya se probó la contraseña, así que decir «venció» no filtra nada
            self._publicar(
                AccionBitacora.INICIO_SESION,
                usuario,
                ip,
                ResultadoAccion.FALLO,
                {"motivo": "temporal_expirada"},
            )
            self._unidad.confirmar()
            raise ErrorApi(
                403,
                "AUTH_TEMPORAL_EXPIRADA",
                "Tu contraseña temporal venció. Pide una nueva al administrador.",
            )

        if usuario.contrasena_temporal:
            etapa = EtapaSesion.CAMBIO_CONTRASENA
        elif usuario.totp_vinculado_en:
            etapa = EtapaSesion.PENDIENTE_2FA
        else:
            etapa = EtapaSesion.VINCULAR_TOTP
        token = generar_token_sesion()
        self._sesiones.crear(usuario.id, etapa, hash_token(token), ip)
        self._publicar(AccionBitacora.INICIO_SESION, usuario, ip, detalle={"etapa": etapa.value})
        self._unidad.confirmar()
        return InicioSesion(token=token, etapa=etapa)

    # ------------------------------------------------- dependencia de cada petición

    def validar_sesion(
        self, token: str | None, etapas: tuple[EtapaSesion, ...], pasiva: bool
    ) -> Sesion:
        """Lo que corre antes de cada endpoint protegido.

        Cierra la sesión si venció por inactividad o si la cuenta ya no puede entrar
        (desactivada, eliminada o bloqueada mientras estaba adentro).
        `pasiva` = cabecera X-Actividad-Pasiva: 1; esas consultas no renuevan (RF-U10).
        Sin sesión, cerrada o vencida: 401 SESION_EXPIRADA, con `motivo` cuando se sabe:
        INACTIVIDAD (los 10 min, W-01d) o DEMASIADOS_INTENTOS (cuenta bloqueada por códigos
        o contraseñas fallidas). Este último solo lo ve quien ya tenía sesión, o sea quien
        ya pasó la contraseña, así que no destapa nada en el login (RF-U01 CA 2).
        """
        if not token:
            raise _error(401, SESION_EXPIRADA)
        sesion = self._sesiones.por_token_hash(hash_token(token))
        if sesion is None:
            raise _error(401, SESION_EXPIRADA)

        usuario, ahora = sesion.usuario, self._reloj()
        bloqueada = usuario.bloqueado_hasta is not None and usuario.bloqueado_hasta > ahora
        if sesion.cerrada_en is not None:
            raise _sesion_expirada(MOTIVO_BLOQUEO if bloqueada else None)

        por_inactividad = ahora - sesion.ultima_actividad_en > self._reglas.inactividad
        cuenta_fuera = usuario.estado not in ESTADOS_QUE_ENTRAN or bloqueada
        if por_inactividad or cuenta_fuera:
            sesion.cerrada_en = ahora
            if por_inactividad:
                self._publicar(AccionBitacora.CIERRE_SESION_INACTIVIDAD, usuario, sesion.ip)
            self._unidad.confirmar()
            raise _sesion_expirada(
                "INACTIVIDAD" if por_inactividad else MOTIVO_BLOQUEO if bloqueada else None
            )

        if sesion.etapa not in etapas:
            # El contrato no le pone código a esto; va la etapa pa que el front redirija
            # sin tener que volver a preguntar GET /auth/sesion
            raise ErrorApi(
                403,
                "ETAPA_INVALIDA",
                "Completa el paso pendiente.",
                extra={"etapa": sesion.etapa.value},
            )
        if not pasiva:
            sesion.ultima_actividad_en = ahora
            self._unidad.confirmar()
        return sesion

    def inactividad(self, sesion: Sesion) -> dict[str, object]:
        """Lo que pinta el aviso de inactividad: segundos desde la última actividad (W-05)."""
        cierre = self._reglas.inactividad
        return {
            "aviso_en_s": int((cierre - AVISO_ANTES_DEL_CIERRE).total_seconds()),
            "cierre_en_s": int(cierre.total_seconds()),
            "ultima_actividad_en": sesion.ultima_actividad_en,
        }

    @staticmethod
    def ruta_inicial(usuario: Usuario) -> str:
        return RUTAS_INICIALES[usuario.rol.codigo]

    # ------------------------------------------------------------------ AUTH-02

    def verificar_segundo_factor(self, sesion: Sesion, codigo: str, ip: str | None) -> Usuario:
        usuario = sesion.usuario
        paso = self._paso_valido(usuario, codigo, usuario.totp_ultimo_paso)
        if paso is None:
            bloqueada = self._fallo(usuario, ip, self._reloj(), sesion)
            self._publicar(AccionBitacora.VERIFICACION_2FA, usuario, ip, ResultadoAccion.FALLO)
            self._unidad.confirmar()
            if bloqueada:  # el quinto: el front muestra por qué lo sacaron
                raise _sesion_expirada(MOTIVO_BLOQUEO)
            raise _error(401, CODIGO_INVALIDO)
        usuario.totp_ultimo_paso = paso
        self._entrar(sesion, usuario)
        self._publicar(AccionBitacora.VERIFICACION_2FA, usuario, ip)
        self._unidad.confirmar()
        return usuario

    # ------------------------------------------------------------------ AUTH-03

    def cambiar_temporal(
        self, sesion: Sesion, nueva: str, confirmacion: str, ip: str | None
    ) -> EtapaSesion:
        usuario = sesion.usuario
        validar_contrasena(
            nueva,
            confirmacion=confirmacion,
            correo=usuario.correo,
            verificador=self._verificador,
            # Repetir la temporal sería no cambiarla (RF-U02 CA 4)
            es_la_temporal=verificar_contrasena(nueva, usuario.hash_contrasena),
        )
        usuario.hash_contrasena = hashear_contrasena(nueva)
        usuario.contrasena_temporal = False
        usuario.temporal_expira_en = None
        etapa = (
            EtapaSesion.PENDIENTE_2FA if usuario.totp_vinculado_en else EtapaSesion.VINCULAR_TOTP
        )
        sesion.etapa = etapa
        self._publicar(AccionBitacora.CAMBIO_CONTRASENA_TEMPORAL, usuario, ip)
        self._unidad.confirmar()
        return etapa

    # ------------------------------------------------------------------ AUTH-04

    def generar_vinculacion(self, sesion: Sesion) -> dict[str, str]:
        """Secreto nuevo, guardado cifrado. No cuenta como vinculado hasta AUTH-05."""
        usuario = sesion.usuario
        secreto = generar_secreto_totp()
        usuario.totp_secreto_cifrado = self._cifrador().cifrar(secreto, str(usuario.id))
        usuario.totp_vinculado_en = None
        usuario.totp_ultimo_paso = None
        self._unidad.confirmar()
        uri = uri_aprovisionamiento(secreto, usuario.correo or "")
        return {
            "otpauth_uri": uri,
            # El secreto en grupos de 4 pa «¿No puede escanear?»: alternativa accesible (CA 10)
            "secreto_manual": " ".join(secreto[i : i + 4] for i in range(0, len(secreto), 4)),
            "qr_png_base64": _qr_png_base64(uri),
        }

    # ------------------------------------------------------------------ AUTH-05

    def confirmar_vinculacion(self, sesion: Sesion, codigo: str, ip: str | None) -> Usuario:
        usuario = sesion.usuario
        if usuario.totp_secreto_cifrado is None:
            raise ErrorApi(409, "TOTP_NO_INICIADO", "Primero genera el código QR.")
        paso = self._paso_valido(usuario, codigo, None)
        if paso is None:
            bloqueada = self._fallo(usuario, ip, self._reloj(), sesion)
            self._unidad.confirmar()
            if bloqueada:
                raise _sesion_expirada(MOTIVO_BLOQUEO)
            raise _error(
                422, CODIGO_INVALIDO
            )  # el contrato pide 422 aquí (W-03b) y 401 en verificar
        ahora = self._reloj()
        usuario.totp_vinculado_en = ahora
        usuario.totp_ultimo_paso = paso
        if usuario.estado == EstadoUsuario.PENDIENTE:  # aquí deja de estar pendiente (RF-U06 CA 5)
            usuario.estado = EstadoUsuario.ACTIVO
            usuario.activado_en = ahora
        self._entrar(sesion, usuario)
        self._publicar(AccionBitacora.VINCULACION_TOTP, usuario, ip)
        self._unidad.confirmar()
        return usuario

    # ------------------------------------------------------------------ AUTH-08

    def cerrar_sesion(self, sesion: Sesion, por_inactividad: bool, ip: str | None) -> None:
        sesion.cerrada_en = self._reloj()
        accion = (
            AccionBitacora.CIERRE_SESION_INACTIVIDAD
            if por_inactividad
            else AccionBitacora.CIERRE_SESION
        )
        self._publicar(accion, sesion.usuario, ip)
        self._unidad.confirmar()

    def casos_recibidos_nuevos(self, sesion: Sesion) -> int | None:
        """Traslados que el doctor no ha abierto (el número del menú). None si no aplica."""
        if (
            self._traslados is None
            or sesion.etapa is not EtapaSesion.ACTIVA
            or sesion.usuario.rol.codigo is not CodigoRol.DOCTOR
        ):
            return None
        return self._traslados.sin_ver(sesion.usuario.id)

    # --------------------------------------------------------------- piezas internas

    def _paso_valido(self, usuario: Usuario, codigo: str, ultimo: int | None) -> int | None:
        if usuario.totp_secreto_cifrado is None:
            return None
        secreto = self._cifrador().descifrar(usuario.totp_secreto_cifrado, str(usuario.id))
        return verificar_codigo_totp(secreto, codigo, ultimo, ahora=self._reloj().timestamp())

    def _entrar(self, sesion: Sesion, usuario: Usuario) -> None:
        # Login completo: el contador vuelve a cero (RF-U12 CA 5)
        usuario.intentos_fallidos = 0
        usuario.bloqueado_hasta = None
        sesion.etapa = EtapaSesion.ACTIVA

    def _fallo(
        self, usuario: Usuario, ip: str | None, ahora: datetime, sesion: Sesion | None = None
    ) -> bool:
        """+1 intento; al quinto, bloqueo de 15 min con su entrada en bitácora (RF-U12 CA 4).

        Devuelve True si con este quedó bloqueada.
        """
        if self._usuarios.sumar_intento_fallido(usuario.id) >= self._reglas.intentos:
            self._usuarios.bloquear(usuario.id, ahora + self._reglas.bloqueo)
            self._publicar(AccionBitacora.CUENTA_BLOQUEADA, usuario, ip)
            if sesion is not None:
                sesion.cerrada_en = ahora  # la sesión a medias tampoco sigue viva
            return True
        return False

    def _registrar_y_fallar(self, usuario: Usuario | None, ip: str | None, motivo: str) -> NoReturn:
        self._publicar(
            AccionBitacora.INICIO_SESION, usuario, ip, ResultadoAccion.FALLO, {"motivo": motivo}
        )
        self._unidad.confirmar()
        raise _error(401, GENERICO)

    def _publicar(
        self,
        accion: AccionBitacora,
        usuario: Usuario | None,
        ip: str | None,
        resultado: ResultadoAccion = ResultadoAccion.EXITO,
        detalle: dict | None = None,
    ) -> None:
        self._publicador.publicar(
            EventoAuditoria(
                accion=accion,
                actor_id=usuario.id if usuario else None,
                resultado=resultado,
                entidad="Usuario" if usuario else None,
                entidad_id=str(usuario.id) if usuario else None,
                detalle=detalle,
                ip=ip,
            )
        )
