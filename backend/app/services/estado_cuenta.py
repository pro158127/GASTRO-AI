"""Patrón Estado de la cuenta (docs/patrones_codigo/estado_cuenta.py), con los 4 estados
que guarda la base: PENDIENTE, ACTIVO, INACTIVO y ELIMINADO.

Cada estado dice qué acciones admite y a qué estado queda la cuenta. Lo que no admite
lanza TransicionNoPermitida, y el servicio la convierte en 409 TRANSICION_INVALIDA.

Diferencias con el ejemplo de diseño, a propósito:
- El bloqueo por intentos no es un estado: vive en `bloqueado_hasta` (así lo diseñó la
  base) y se levanta solo a los 15 min o con «desbloquear».
- «Expirada» y «correo no enviado» tampoco: se calculan de `temporal_expira_en` y del
  último envío, y siguen siendo PENDIENTE.
- Restablecer la contraseña de una cuenta ACTIVO la deja ACTIVO (con temporal y sin app
  vinculada): ya hizo su primer ingreso, así que no vuelve a «Cuentas pendientes».
"""

from app.models import EstadoUsuario


class TransicionNoPermitida(Exception):
    def __init__(self, accion: str, estado: EstadoUsuario) -> None:
        super().__init__(f"No se puede {accion} una cuenta en estado {estado.value}.")


class EstadoCuenta:
    valor: EstadoUsuario

    def _no(self, accion: str):
        raise TransicionNoPermitida(accion, self.valor)

    def activar(self, ya_activada_antes: bool) -> EstadoUsuario:
        self._no("activar")

    def desactivar(self) -> EstadoUsuario:
        self._no("desactivar")

    def eliminar(self) -> EstadoUsuario:
        self._no("eliminar")

    def restablecer_contrasena(self) -> EstadoUsuario:
        self._no("restablecer la contraseña de")

    def reenviar_credencial(self) -> EstadoUsuario:
        self._no("reenviar la contraseña temporal de")

    def editar(self) -> None:
        self._no("editar")


class Pendiente(EstadoCuenta):
    """Creada, sin primer ingreso completo (RF-U05, RF-U06)."""

    valor = EstadoUsuario.PENDIENTE

    def desactivar(self):  # p. ej. se creó por error
        return EstadoUsuario.INACTIVO

    def eliminar(self):
        return EstadoUsuario.ELIMINADO

    def restablecer_contrasena(self):  # temporal nueva: sigue pendiente (RF-U06 CA 3)
        return EstadoUsuario.PENDIENTE

    def reenviar_credencial(self):  # el correo falló o la temporal venció (RF-U05 CA 9)
        return EstadoUsuario.PENDIENTE

    def editar(self):
        return None


class Activo(EstadoCuenta):
    valor = EstadoUsuario.ACTIVO

    def desactivar(self):
        return EstadoUsuario.INACTIVO

    def eliminar(self):
        return EstadoUsuario.ELIMINADO

    def restablecer_contrasena(self):
        return EstadoUsuario.ACTIVO

    def editar(self):
        return None


class Inactivo(EstadoCuenta):
    valor = EstadoUsuario.INACTIVO

    def activar(self, ya_activada_antes: bool):
        # Si la desactivaron antes de su primer ingreso, vuelve a pendiente, no a activa
        return EstadoUsuario.ACTIVO if ya_activada_antes else EstadoUsuario.PENDIENTE

    def eliminar(self):
        return EstadoUsuario.ELIMINADO

    def editar(self):
        return None


class Eliminado(EstadoCuenta):
    """Fin del camino: solo queda el nombre y los registros (RF-U11)."""

    valor = EstadoUsuario.ELIMINADO


ESTADOS: dict[EstadoUsuario, EstadoCuenta] = {
    EstadoUsuario.PENDIENTE: Pendiente(),
    EstadoUsuario.ACTIVO: Activo(),
    EstadoUsuario.INACTIVO: Inactivo(),
    EstadoUsuario.ELIMINADO: Eliminado(),
}


def estado_de(valor: EstadoUsuario) -> EstadoCuenta:
    return ESTADOS[valor]
