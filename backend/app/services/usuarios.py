"""Gestión de cuentas por el administrador (RF-U05 a RF-U09, RF-U11, RF-U12, RF-A06).

Reglas que viven aquí:
- Siempre debe quedar al menos un administrador ACTIVO (RF-U07 CA 6, RF-U08 CA 4,
  RF-U11 CA 10). Se revisa con un candado de Postgres pa que dos admins no se
  desactiven entre sí al mismo tiempo.
- Desactivar o eliminar a un doctor con casos activos exige `destino_id`: los casos se
  trasladan en la misma operación (RF-U11 CA 9, RF-A06).
- Desactivar, eliminar, restablecer y cambiar el correo cierran las sesiones abiertas.
- Cada acción deja su entrada en la bitácora (RF-A02). En `detalle` van nombres de campos
  y códigos, nunca correos ni contraseñas.
- La contraseña temporal nunca sale en la respuesta: solo por correo (RF-U05 CA 5).
- Cuenta ELIMINADO: se puede consultar, pero cualquier cambio responde 404.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4

from app.core.errores import ErrorApi
from app.models import (
    AccionBitacora,
    CodigoRol,
    EnvioCredencial,
    EstadoUsuario,
    MotivoCredencial,
    TipoTraslado,
    Traslado,
    Usuario,
)
from app.repositories.credenciales_repository import RepositorioCredenciales
from app.repositories.sesiones_repository import RepositorioSesiones
from app.repositories.traslados_repository import RepositorioTraslados
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.repositories.usuarios_repository import FiltroUsuarios, RepositorioUsuarios
from app.services.auditoria import EventoAuditoria, PublicadorEventos
from app.services.credenciales import ServicioCredenciales
from app.services.estado_cuenta import TransicionNoPermitida, estado_de

NO_ENCONTRADO = ("NO_ENCONTRADO", "No encontramos esa cuenta.")


@dataclass
class ResultadoTraslado:
    traslado: Traslado
    casos_trasladados: int


@dataclass
class Detalle:
    usuario: Usuario
    casos_activos: int
    envios: list[EnvioCredencial]


@dataclass(frozen=True)
class CambiosCuenta:
    """PATCH: solo cambia lo que viene (None = no tocar; telefono "" = borrarlo)."""

    nombre: str | None = None
    apellido: str | None = None
    telefono: str | None = None
    borrar_telefono: bool = False
    correo: str | None = None


class ServicioUsuarios:
    def __init__(
        self,
        usuarios: RepositorioUsuarios,
        sesiones: RepositorioSesiones,
        traslados: RepositorioTraslados,
        credenciales_repo: RepositorioCredenciales,
        credenciales: ServicioCredenciales,
        publicador: PublicadorEventos,
        unidad: UnidadTrabajo,
        reloj: Callable[[], datetime],
    ) -> None:
        self._usuarios = usuarios
        self._sesiones = sesiones
        self._traslados = traslados
        self._envios = credenciales_repo
        self._credenciales = credenciales
        self._publicador = publicador
        self._unidad = unidad
        self._reloj = reloj

    # ------------------------------------------------------------------ consultas

    def listar(self, filtro: FiltroUsuarios) -> tuple[list[Usuario], int]:
        return self._usuarios.listar(filtro)

    def detalle(self, usuario_id: UUID) -> Detalle:
        usuario = self._usuarios.por_id(usuario_id)
        if usuario is None:
            raise ErrorApi(404, *NO_ENCONTRADO)
        return Detalle(
            usuario, self._usuarios.casos_activos(usuario.id), self._envios.recientes(usuario.id)
        )

    # --------------------------------------------------------------------- crear

    def crear(
        self,
        nombre: str,
        apellido: str,
        correo: str,
        telefono: str | None,
        rol: CodigoRol,
        actor: Usuario,
        ip: str | None,
    ) -> tuple[Usuario, EnvioCredencial]:
        correo = correo.strip().lower()
        if self._usuarios.correo_en_uso(correo):  # RF-U05 CA 2
            raise ErrorApi(
                409,
                "CORREO_YA_REGISTRADO",
                "Ya existe una cuenta con ese correo.",
                [{"campo": "correo", "mensaje": "Ya existe una cuenta con ese correo."}],
            )
        rol_bd = self._usuarios.rol(rol)
        if rol_bd is None:
            raise ErrorApi(
                422,
                "DATOS_INVALIDOS",
                "El rol no existe.",
                [{"campo": "rol", "mensaje": "El rol no existe."}],
            )
        # El id se pone aquí y el INSERT espera: `emitir` le pone el hash de la temporal y
        # al guardar el envío se inserta la cuenta ya completa (el CHECK de 0002 exige hash)
        usuario = Usuario(
            id=uuid4(),
            nombre=nombre,
            apellido=apellido,
            correo=correo,
            telefono=telefono,
            rol=rol_bd,
            estado=EstadoUsuario.PENDIENTE,
            creado_por=actor.id,
        )
        self._usuarios.agregar(usuario)
        self._publicar(AccionBitacora.CUENTA_CREADA, actor, usuario, ip, {"rol": rol.value})
        envio = self._credenciales.emitir(usuario, MotivoCredencial.CREACION, actor, ip)
        self._unidad.confirmar()
        return usuario, envio

    # -------------------------------------------------------------------- editar

    def editar(self, usuario_id: UUID, cambios: CambiosCuenta, actor: Usuario, ip: str | None):
        usuario = self._modificable(usuario_id, "editar")
        campos = []
        for campo in ("nombre", "apellido"):
            valor = getattr(cambios, campo)
            if valor is not None and valor != getattr(usuario, campo):
                setattr(usuario, campo, valor)
                campos.append(campo)
        if cambios.borrar_telefono or (
            cambios.telefono is not None and cambios.telefono != usuario.telefono
        ):
            usuario.telefono = None if cambios.borrar_telefono else cambios.telefono
            campos.append("telefono")

        envio = None
        if cambios.correo is not None and cambios.correo.strip().lower() != usuario.correo:
            correo = cambios.correo.strip().lower()
            if self._usuarios.correo_en_uso(correo, excepto=usuario.id):
                raise ErrorApi(
                    409,
                    "CORREO_YA_REGISTRADO",
                    "Ya existe una cuenta con ese correo.",
                    [{"campo": "correo", "mensaje": "Ya existe una cuenta con ese correo."}],
                )
            usuario.correo = correo
            campos.append("correo")
            # RF-U07 CA 7: temporal nueva al correo nuevo y fuera las sesiones abiertas
            self._sesiones.cerrar_todas(usuario.id, self._reloj())
            self._publicar(AccionBitacora.CORREO_CAMBIADO, actor, usuario, ip)
            envio = self._credenciales.emitir(usuario, MotivoCredencial.CAMBIO_CORREO, actor, ip)
        if campos:
            self._publicar(AccionBitacora.CUENTA_EDITADA, actor, usuario, ip, {"campos": campos})
        self._unidad.confirmar()
        return usuario, envio

    # ------------------------------------------------------------------------ rol

    def cambiar_rol(
        self, usuario_id: UUID, rol: CodigoRol, actor: Usuario, ip: str | None
    ) -> Usuario:
        usuario = self._modificable(usuario_id, "cambiar el rol de")
        anterior = usuario.rol.codigo
        if anterior == rol:
            return usuario
        if anterior == CodigoRol.ADMINISTRADOR:
            self._proteger_ultimo_administrador(usuario)
        if anterior == CodigoRol.DOCTOR and self._usuarios.casos_activos(usuario.id) > 0:
            raise ErrorApi(409, "CASOS_SIN_REASIGNAR", "Reasigna primero los casos de este doctor.")
        rol_bd = self._usuarios.rol(rol)
        if rol_bd is None:
            raise ErrorApi(
                422,
                "DATOS_INVALIDOS",
                "El rol no existe.",
                [{"campo": "rol", "mensaje": "El rol no existe."}],
            )
        usuario.rol_id = rol_bd.id
        self._publicar(
            AccionBitacora.ROL_CAMBIADO, actor, usuario, ip, {"de": anterior.value, "a": rol.value}
        )
        self._unidad.confirmar()
        # Como el rol se lee de la base en cada petición, el cambio aplica ya (RF-U08 CA 2)
        return self._usuarios.por_id(usuario.id)

    # ----------------------------------------------------------- activar/desactivar

    def activar(self, usuario_id: UUID, actor: Usuario, ip: str | None) -> Usuario:
        usuario = self._modificable(usuario_id, "activar")
        usuario.estado = self._transicion(
            lambda e: e.activar(usuario.activado_en is not None), usuario
        )
        self._publicar(AccionBitacora.CUENTA_ACTIVADA, actor, usuario, ip)
        self._unidad.confirmar()
        return usuario

    def desactivar(
        self, usuario_id: UUID, destino_id: UUID | None, actor: Usuario, ip: str | None
    ) -> tuple[Usuario, ResultadoTraslado | None]:
        usuario = self._modificable(usuario_id, "desactivar")
        nuevo = self._transicion(lambda e: e.desactivar(), usuario)
        self._proteger_ultimo_administrador(usuario)
        traslado = self._trasladar_si_hace_falta(
            usuario, destino_id, TipoTraslado.DESACTIVACION, actor, ip
        )
        usuario.estado = nuevo
        self._sesiones.cerrar_todas(usuario.id, self._reloj())  # RF-U07 CA 3
        self._publicar(AccionBitacora.CUENTA_DESACTIVADA, actor, usuario, ip)
        self._unidad.confirmar()
        return usuario, traslado

    # -------------------------------------------------------------------- eliminar

    def eliminar(
        self, usuario_id: UUID, destino_id: UUID | None, actor: Usuario, ip: str | None
    ) -> tuple[Usuario, ResultadoTraslado | None]:
        """Eliminación lógica (RF-U11): se van correo, contraseña, teléfono y TOTP; quedan
        el nombre y todos sus registros, que siguen enlazados por el traslado."""
        usuario = self._modificable(usuario_id, "eliminar")
        nuevo = self._transicion(lambda e: e.eliminar(), usuario)
        self._proteger_ultimo_administrador(usuario)
        traslado = self._trasladar_si_hace_falta(
            usuario, destino_id, TipoTraslado.ELIMINACION, actor, ip
        )
        ahora = self._reloj()
        usuario.estado = nuevo
        usuario.eliminado_en = ahora
        usuario.correo = None  # el correo queda libre pa otra cuenta
        usuario.telefono = None
        usuario.hash_contrasena = None
        usuario.contrasena_temporal = False
        usuario.temporal_expira_en = None
        usuario.totp_secreto_cifrado = None
        usuario.totp_vinculado_en = None
        usuario.totp_ultimo_paso = None
        self._sesiones.cerrar_todas(usuario.id, ahora)  # RF-U11 CA 7
        self._publicar(AccionBitacora.CUENTA_ELIMINADA, actor, usuario, ip)
        self._unidad.confirmar()
        return usuario, traslado

    # ------------------------------------------------------------------- reasignar

    def reasignar_casos(
        self,
        usuario_id: UUID,
        destino_id: UUID,
        caso_ids: list[UUID] | None,
        actor: Usuario,
        ip: str | None,
    ) -> ResultadoTraslado:
        """Reasignación manual (RF-A06), sin desactivar a nadie. caso_ids None = todos."""
        origen = self._modificable(usuario_id, "reasignar los casos de")
        if origen.rol.codigo != CodigoRol.DOCTOR:
            raise ErrorApi(409, "TRANSICION_INVALIDA", "Solo los doctores tienen casos asignados.")
        casos = self._traslados.casos_activos(origen.id, caso_ids)
        if caso_ids is not None and len(casos) != len(set(caso_ids)):
            raise ErrorApi(
                422,
                "CASOS_INVALIDOS",
                "Algunos casos no están activos o no son de este doctor.",
                [{"campo": "caso_ids", "mensaje": "Revisa los casos seleccionados."}],
            )
        if not casos:
            raise ErrorApi(409, "SIN_CASOS_ACTIVOS", "Este doctor no tiene casos activos.")
        destino = self._destino_valido(origen, destino_id)
        resultado = self._mover(origen, destino, TipoTraslado.REASIGNACION, casos, actor, ip)
        self._unidad.confirmar()
        return resultado

    # ---------------------------------------------------------- credenciales y bloqueo

    def restablecer_contrasena(
        self, usuario_id: UUID, actor: Usuario, ip: str | None
    ) -> tuple[Usuario, EnvioCredencial]:
        """RF-U09: temporal nueva, app desvinculada (CA 9), sin bloqueo y sin sesiones."""
        usuario = self._modificable(usuario_id, "restablecer la contraseña de")
        usuario.estado = self._transicion(lambda e: e.restablecer_contrasena(), usuario)
        usuario.totp_secreto_cifrado = None
        usuario.totp_vinculado_en = None
        usuario.totp_ultimo_paso = None
        usuario.intentos_fallidos = 0
        usuario.bloqueado_hasta = None
        self._sesiones.cerrar_todas(usuario.id, self._reloj())
        self._publicar(AccionBitacora.CONTRASENA_RESTABLECIDA, actor, usuario, ip)
        envio = self._credenciales.emitir(usuario, MotivoCredencial.RESTABLECIMIENTO, actor, ip)
        self._unidad.confirmar()
        return usuario, envio

    def reenviar_credencial(
        self, usuario_id: UUID, actor: Usuario, ip: str | None
    ) -> tuple[Usuario, EnvioCredencial]:
        """Cuenta pendiente cuyo correo falló o cuya temporal venció (RF-U05 CA 9, RF-U06).

        No se puede reenviar la misma temporal (solo se guarda su hash): sale una nueva.
        """
        usuario = self._modificable(usuario_id, "reenviar la contraseña temporal de")
        usuario.estado = self._transicion(lambda e: e.reenviar_credencial(), usuario)
        self._sesiones.cerrar_todas(usuario.id, self._reloj())
        envio = self._credenciales.emitir(usuario, MotivoCredencial.CREACION, actor, ip)
        self._unidad.confirmar()
        return usuario, envio

    def desbloquear(self, usuario_id: UUID, actor: Usuario, ip: str | None) -> Usuario:
        """Antes de los 15 min (RF-U12 CA 3). Un solo clic, sin diálogo (RNF-08)."""
        usuario = self._modificable(usuario_id, "desbloquear")
        usuario.bloqueado_hasta = None
        usuario.intentos_fallidos = 0
        self._publicar(AccionBitacora.CUENTA_DESBLOQUEADA, actor, usuario, ip)
        self._unidad.confirmar()
        return usuario

    # ------------------------------------------------------------- piezas internas

    def _modificable(self, usuario_id: UUID, accion: str) -> Usuario:
        usuario = self._usuarios.por_id(usuario_id)
        if usuario is None or usuario.estado == EstadoUsuario.ELIMINADO:
            raise ErrorApi(404, *NO_ENCONTRADO)
        return usuario

    @staticmethod
    def _transicion(paso, usuario: Usuario) -> EstadoUsuario:
        try:
            return paso(estado_de(usuario.estado))
        except TransicionNoPermitida as error:
            raise ErrorApi(409, "TRANSICION_INVALIDA", str(error)) from error

    def _proteger_ultimo_administrador(self, usuario: Usuario) -> None:
        if usuario.rol.codigo != CodigoRol.ADMINISTRADOR or usuario.estado != EstadoUsuario.ACTIVO:
            return
        self._usuarios.tomar_candado_administradores()
        if self._usuarios.otros_administradores_activos(usuario.id) == 0:
            raise ErrorApi(
                409, "ULTIMO_ADMINISTRADOR", "Debe existir al menos un administrador activo."
            )

    def _destino_valido(self, origen: Usuario, destino_id: UUID | None) -> Usuario:
        destino = self._usuarios.por_id(destino_id) if destino_id else None
        if (
            destino is None
            or destino.id == origen.id
            or destino.rol.codigo != CodigoRol.DOCTOR
            or destino.estado != EstadoUsuario.ACTIVO
        ):
            raise ErrorApi(
                422,
                "DESTINO_INVALIDO",
                "El destino debe ser otro doctor con la cuenta activa.",
                [{"campo": "destino_id", "mensaje": "Elige otro doctor activo."}],
            )
        return destino

    def _trasladar_si_hace_falta(
        self,
        usuario: Usuario,
        destino_id: UUID | None,
        tipo: TipoTraslado,
        actor: Usuario,
        ip: str | None,
    ) -> ResultadoTraslado | None:
        if usuario.rol.codigo != CodigoRol.DOCTOR:
            return None
        casos = self._traslados.casos_activos(usuario.id)
        if not casos:
            return None
        if destino_id is None:
            raise ErrorApi(
                409,
                "DESTINO_REQUERIDO",
                "Este doctor tiene casos activos: elige a qué doctor pasan.",
                [{"campo": "destino_id", "mensaje": "Elige a qué doctor pasan los casos."}],
                {"casos_activos": len(casos)},
            )
        return self._mover(
            usuario, self._destino_valido(usuario, destino_id), tipo, casos, actor, ip
        )

    def _mover(self, origen, destino, tipo, casos, actor, ip) -> ResultadoTraslado:
        traslado = self._traslados.trasladar(tipo, origen.id, destino.id, actor.id, casos)
        self._publicar(
            AccionBitacora.CASOS_REASIGNADOS,
            actor,
            origen,
            ip,
            {"tipo": tipo.value, "destino_id": str(destino.id), "casos": len(casos)},
        )
        return ResultadoTraslado(traslado, len(casos))

    def _publicar(
        self,
        accion: AccionBitacora,
        actor: Usuario,
        objetivo: Usuario,
        ip: str | None,
        detalle=None,
    ) -> None:
        self._publicador.publicar(
            EventoAuditoria(
                accion=accion,
                actor_id=actor.id,
                entidad="Usuario",
                entidad_id=str(objetivo.id),
                detalle=detalle,
                ip=ip,
            )
        )
