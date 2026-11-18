"""Recuperación del único administrador desde el servidor (RF-U09 CA 10).

Si hay otro administrador activo, la contraseña se restablece desde la aplicación
(RF-U09). Este camino es solo para cuando nadie puede hacerlo: hay un único administrador y
perdió la contraseña, la app autenticadora o quedó bloqueado. Quien lo corre necesita
acceso al servidor (`docker compose exec api …`), y ese acceso es el que lo autoriza.

Hace lo mismo que el restablecimiento de la aplicación:
- emite una temporal nueva, que vence a las 72 h e invalida la anterior;
- desvincula la app autenticadora, así que al entrar se vuelve a vincular (CA 9);
- quita el bloqueo y los intentos fallidos;
- cierra todas sus sesiones;
- deja la acción en la bitácora con `"origen": "SERVIDOR"` (para distinguirla de un
  restablecimiento hecho desde la app) y por dónde se entregó la temporal.

La temporal sale por correo, igual que siempre. Solo con `mostrar_en_pantalla=True` (cuando
el SMTP no funciona) se devuelve una vez para que la vea quien está en el servidor; en ese
caso no se registra un envío de correo, porque no lo hubo.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from app.core.seguridad import generar_contrasena_temporal, hashear_contrasena
from app.models import AccionBitacora, CodigoRol, EstadoEnvio, MotivoCredencial, Usuario
from app.repositories.sesiones_repository import RepositorioSesiones
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.repositories.usuarios_repository import RepositorioUsuarios
from app.services.auditoria import EventoAuditoria, PublicadorEventos
from app.services.credenciales import VIGENCIA_TEMPORAL, ServicioCredenciales
from app.services.estado_cuenta import TransicionNoPermitida, estado_de


class ErrorRecuperacion(Exception):
    """No se puede recuperar esa cuenta por este camino. El mensaje es para quien lo corre."""


@dataclass(frozen=True)
class Recuperacion:
    correo: str
    vence: datetime
    correo_enviado: bool
    temporal: str | None = None  # solo con mostrar_en_pantalla


class ServicioRecuperacionAdmin:
    def __init__(
        self,
        usuarios: RepositorioUsuarios,
        sesiones: RepositorioSesiones,
        credenciales: ServicioCredenciales,
        publicador: PublicadorEventos,
        unidad: UnidadTrabajo,
        reloj: Callable[[], datetime],
    ) -> None:
        self._usuarios = usuarios
        self._sesiones = sesiones
        self._credenciales = credenciales
        self._publicador = publicador
        self._unidad = unidad
        self._reloj = reloj

    def recuperar(self, correo: str, mostrar_en_pantalla: bool = False) -> Recuperacion:
        correo = correo.strip().lower()
        admin = self._usuarios.por_correo(correo)
        # Mismo mensaje si no existe o si es un doctor: no se confirma qué correos hay
        if admin is None or admin.rol.codigo != CodigoRol.ADMINISTRADOR:
            raise ErrorRecuperacion(f"No hay un administrador con el correo {correo}.")
        try:
            # Solo PENDIENTE o ACTIVO: una cuenta desactivada o eliminada no se recupera así
            admin.estado = estado_de(admin.estado).restablecer_contrasena()
        except TransicionNoPermitida:
            raise ErrorRecuperacion(
                f"La cuenta está {admin.estado.value}: no se puede recuperar por este camino."
            ) from None
        # Lo mismo que hace la app (candado incluido): si hay otro, que lo haga desde allí
        self._usuarios.tomar_candado_administradores()
        if self._usuarios.otros_administradores_activos(admin.id) > 0:
            raise ErrorRecuperacion(
                "Hay otro administrador activo: que restablezca la contraseña desde la "
                "aplicación (Gestión de usuarios → Restablecer contraseña)."
            )

        admin.totp_secreto_cifrado = None
        admin.totp_vinculado_en = None
        admin.totp_ultimo_paso = None
        admin.intentos_fallidos = 0
        admin.bloqueado_hasta = None
        self._sesiones.cerrar_todas(admin.id, self._reloj())
        self._registrar(admin, "PANTALLA" if mostrar_en_pantalla else "CORREO")

        if mostrar_en_pantalla:
            temporal = self._temporal_sin_correo(admin)
            recuperacion = Recuperacion(correo, admin.temporal_expira_en, False, temporal)
        else:
            envio = self._credenciales.emitir(admin, MotivoCredencial.RESTABLECIMIENTO, admin, None)
            recuperacion = Recuperacion(
                correo, admin.temporal_expira_en, envio.estado == EstadoEnvio.ENVIADO
            )
        self._unidad.confirmar()
        return recuperacion

    def _temporal_sin_correo(self, admin: Usuario) -> str:
        temporal = generar_contrasena_temporal()
        admin.hash_contrasena = hashear_contrasena(temporal)
        admin.contrasena_temporal = True
        admin.temporal_expira_en = self._reloj() + VIGENCIA_TEMPORAL
        return temporal

    def _registrar(self, admin: Usuario, entrega: str) -> None:
        self._publicador.publicar(
            EventoAuditoria(
                accion=AccionBitacora.CONTRASENA_RESTABLECIDA,
                actor_id=admin.id,
                entidad="Usuario",
                entidad_id=str(admin.id),
                detalle={"origen": "SERVIDOR", "entrega": entrega},
            )
        )
