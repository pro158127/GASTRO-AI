"""Datos extra de las cuentas que dibuja Figma en la administración de usuarios.

- Conteos por estado para el resumen de la lista (W-09).
- El último envío de la contraseña temporal en cada fila (W-20: «Correo no enviado»).
- Cuándo se bloqueó y cuándo se desactivó una cuenta, y su último traslado (W-11b, W-11c).
  Las fechas salen de la bitácora; la IP del bloqueo NO se expone aquí (dato personal, Ley
  1581): queda en la bitácora (W-21), filtrable por usuario.
- Los casos activos de un doctor con el código y la fecha de cada análisis (W-25, RF-A06 CA 2).
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from app.core.errores import ErrorApi
from app.models import AccionBitacora, EnvioCredencial, EstadoUsuario, Usuario
from app.repositories.resumen_cuentas_repository import (
    CasoActivo,
    Conteos,
    RepositorioResumenCuentas,
    UltimoTraslado,
)


@dataclass(frozen=True)
class ExtrasDetalle:
    bloqueado_en: datetime | None  # solo si el bloqueo sigue en curso
    desactivado_en: datetime | None  # solo si la cuenta está INACTIVO
    ultimo_traslado: UltimoTraslado | None


class ServicioResumenCuentas:
    def __init__(
        self,
        repositorio: RepositorioResumenCuentas,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repositorio
        self._reloj = reloj

    def conteos(self) -> Conteos:
        return self._repo.conteos(self._reloj())

    def ultimos_envios(self, usuarios: list[Usuario]) -> dict[UUID, EnvioCredencial]:
        return self._repo.ultimos_envios([u.id for u in usuarios])

    def extras(self, usuario: Usuario) -> ExtrasDetalle:
        bloqueada = bool(usuario.bloqueado_hasta and usuario.bloqueado_hasta > self._reloj())
        return ExtrasDetalle(
            bloqueado_en=self._repo.ultimo_evento(AccionBitacora.CUENTA_BLOQUEADA, usuario.id)
            if bloqueada
            else None,
            desactivado_en=self._repo.ultimo_evento(AccionBitacora.CUENTA_DESACTIVADA, usuario.id)
            if usuario.estado is EstadoUsuario.INACTIVO
            else None,
            ultimo_traslado=self._repo.ultimo_traslado_desde(usuario.id),
        )

    def casos_activos(self, usuario_id: UUID) -> list[CasoActivo]:
        """W-25: los casos que se pueden reasignar. 404 si la cuenta no existe."""
        if self._repo.usuario(usuario_id) is None:
            raise ErrorApi(404, "NO_ENCONTRADO", "No encontramos esta cuenta.")
        return self._repo.casos_activos(usuario_id)
