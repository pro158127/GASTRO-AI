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
from app.services.auditoria import EventoAuditoria, PublicadorEventos

VIGENCIA_TEMPORAL = timedelta(hours=72)  # RNF-27

ASUNTOS = {
    MotivoCredencial.CREACION: "Tu acceso a Gastro-AI",
    MotivoCredencial.RESTABLECIMIENTO: "Tu contraseña de Gastro-AI fue restablecida",
    MotivoCredencial.CAMBIO_CORREO: "Tu nuevo correo de acceso a Gastro-AI",
}


def _texto(usuario: Usuario, temporal: str, vence: datetime) -> str:
    return (
        f"Hola, {usuario.nombre}.\n\n"
        f"Tu contraseña temporal de Gastro-AI es:\n\n    {temporal}\n\n"
        f"Vence el {vence:%Y-%m-%d %H:%M} (UTC), a las 72 horas de este mensaje. Al entrar, "
        "el sistema te pedirá cambiarla y vincular una aplicación autenticadora.\n\n"
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

        try:
            self._enviador.enviar(
                usuario.correo or "", ASUNTOS[motivo], _texto(usuario, temporal, vence)
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
