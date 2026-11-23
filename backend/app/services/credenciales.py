"""Emisión de contraseñas temporales: generarla, guardarla con hash, mandarla y dejar rastro.

Se usa al crear la cuenta, al restablecer, al reenviar y al cambiar el correo (RF-U05,
RF-U07 CA 7, RF-U09). La temporal:
- sale de un generador criptográfico y no se deriva de nada del usuario (RNF-02);
- vence a las 72 h (RNF-27) e invalida cualquier temporal anterior (RF-U09 CA 3);
- solo viaja por correo: nunca en la respuesta de la API ni en el log (RF-U05 CA 5).
Si el correo falla, la cuenta queda igual y el envío queda FALLIDO pa reintentar (CA 9).

Orden a propósito: primero se guarda el hash (flush), luego se manda el correo y al final
se registra el envío; el commit lo hace quien llama. Si ese commit fallara, el usuario
tendría en el correo una temporal que no sirve y el admin la reenvía: es raro y no deja
nada inseguro, a diferencia de mandar el correo antes de guardar.
"""

from collections.abc import Callable
from datetime import datetime, timedelta

from app.adapters.correo import EnviadorCorreo, ErrorCorreo
from app.core.seguridad import generar_contrasena_temporal, hashear_contrasena
from app.models import (
    AccionBitacora,
    EnvioCredencial,
    EstadoEnvio,
    MotivoCredencial,
    ResultadoAccion,
    Usuario,
)
from app.repositories.credenciales_repository import RepositorioCredenciales
from app.services.analisis import ZONA_COLOMBIA
from app.services.auditoria import EventoAuditoria, PublicadorEventos

VIGENCIA_TEMPORAL = timedelta(hours=72)  # RNF-27

ASUNTOS = {
    MotivoCredencial.CREACION: "Tu acceso a Gastro-AI",
    MotivoCredencial.RESTABLECIMIENTO: "Tu contraseña de Gastro-AI fue restablecida",
    MotivoCredencial.CAMBIO_CORREO: "Tu nuevo correo de acceso a Gastro-AI",
}


INTRODUCCIONES = {
    MotivoCredencial.CREACION: "Ya tienes una cuenta en Gastro-AI.",
    MotivoCredencial.RESTABLECIMIENTO: "Se restableció tu contraseña de Gastro-AI.",
    MotivoCredencial.CAMBIO_CORREO: "Este es ahora tu correo de acceso a Gastro-AI.",
}

# RF-U09 CA 9: al restablecer se desvincula la app. La app autenticadora no deja crear una
# segunda entrada con el mismo nombre y los códigos de la vieja ya no validan; sin este
# aviso la persona queda atascada en el QR sin saber por qué.
AVISO_APP_ANTERIOR = (
    "Tu aplicación autenticadora anterior quedó desvinculada y sus códigos ya no sirven. "
    "Antes de escanear el código QR nuevo, borra de la aplicación la entrada de Gastro-AI "
    "que ya tenías."
)


def _texto(usuario: Usuario, motivo: MotivoCredencial, temporal: str, vence: datetime) -> str:
    """Cuerpo del correo según el motivo y lo que de verdad pedirá el sistema al entrar.

    Después de cambiar la temporal, autenticacion.py pide el código si la app ya está
    vinculada (PENDIENTE_2FA) y el QR si no (VINCULAR_TOTP). El cambio de correo no toca el
    TOTP, así que a quien ya lo tenía no se le dice que vincule nada.
    """
    if usuario.totp_vinculado_en:
        al_entrar = (
            "Al entrar, el sistema te pedirá cambiarla y después el código de tu aplicación "
            "autenticadora, como siempre."
        )
    else:
        al_entrar = (
            "Al entrar, el sistema te pedirá cambiarla y vincular una aplicación autenticadora "
            "con un código QR."
        )
    if motivo is MotivoCredencial.RESTABLECIMIENTO and not usuario.totp_vinculado_en:
        al_entrar += f"\n\n{AVISO_APP_ANTERIOR}"
    return (
        f"Hola, {usuario.nombre}.\n\n"
        f"{INTRODUCCIONES[motivo]} Tu contraseña temporal es:\n\n    {temporal}\n\n"
        f"Vence el {vence.astimezone(ZONA_COLOMBIA):%d/%m/%Y a las %H:%M} (hora de Colombia), "
        f"72 horas después de este mensaje. {al_entrar}\n\n"
        "Si no esperabas este correo, avísale al administrador de Gastro-AI.\n"
    )


class ServicioCredenciales:
    def __init__(
        self,
        repositorio: RepositorioCredenciales,
        enviador: EnviadorCorreo,
        publicador: PublicadorEventos,
        reloj: Callable[[], datetime],
    ) -> None:
        self._repositorio = repositorio
        self._enviador = enviador
        self._publicador = publicador
        self._reloj = reloj

    def emitir(
        self, usuario: Usuario, motivo: MotivoCredencial, actor: Usuario, ip: str | None
    ) -> EnvioCredencial:
        temporal = generar_contrasena_temporal()
        vence = self._reloj() + VIGENCIA_TEMPORAL
        usuario.hash_contrasena = hashear_contrasena(temporal)
        usuario.contrasena_temporal = True
        usuario.temporal_expira_en = vence
        # Primero la base y después el correo: si la base falla, la temporal no sale
        self._repositorio.guardar_hash()

        try:
            self._enviador.enviar(
                usuario.correo or "", ASUNTOS[motivo], _texto(usuario, motivo, temporal, vence)
            )
            estado, codigo_error = EstadoEnvio.ENVIADO, None
        except ErrorCorreo:
            estado, codigo_error = EstadoEnvio.FALLIDO, "CORREO_NO_ENVIADO"
        del temporal  # que no quede rondando en memoria más de lo necesario

        envio = self._repositorio.registrar(usuario.id, motivo, estado, codigo_error)
        self._publicador.publicar(
            EventoAuditoria(
                accion=AccionBitacora.ENVIO_CREDENCIAL,
                actor_id=actor.id,
                resultado=ResultadoAccion.EXITO
                if estado == EstadoEnvio.ENVIADO
                else ResultadoAccion.FALLO,
                entidad="Usuario",
                entidad_id=str(usuario.id),
                detalle={"motivo": motivo.value},
                ip=ip,
            )
        )
        return envio
