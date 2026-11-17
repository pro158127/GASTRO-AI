"""Mi perfil (RF-U04): cada quien ve y edita lo suyo.

Se editan nombre, apellido y teléfono; el correo y el rol solo los cambia el
administrador (CA 2). Solo nombre y apellido son obligatorios y el teléfono es opcional,
por minimización de datos (CA 3, Ley 1581).
"""

from app.models import AccionBitacora, Usuario
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.auditoria import EventoAuditoria, PublicadorEventos
from app.services.usuarios import CambiosCuenta


class ServicioPerfil:
    def __init__(self, publicador: PublicadorEventos, unidad: UnidadTrabajo) -> None:
        self._publicador = publicador
        self._unidad = unidad

    def editar(self, usuario: Usuario, cambios: CambiosCuenta, ip: str | None) -> Usuario:
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
        if campos:
            self._publicador.publicar(
                EventoAuditoria(
                    accion=AccionBitacora.CUENTA_EDITADA,
                    actor_id=usuario.id,
                    entidad="Usuario",
                    entidad_id=str(usuario.id),
                    detalle={"campos": campos, "propio": True},
                    ip=ip,
                )
            )
            self._unidad.confirmar()
        return usuario
