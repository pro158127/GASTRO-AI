"""Historial del doctor (RF-H01, HIS-01, HIS-02, contrato §4).

- «Mis análisis»: todos los análisis de los casos asignados al doctor, propios y recibidos
  por traslado (RF-A07 CA 5), con filtros y paginación.
- «Buscar por paciente»: lo mismo, pero solo de un paciente. El documento llega en el cuerpo
  de un POST, se convierte en seudónimos (todas las versiones de la clave) y se olvida. Si el
  paciente no es del doctor, la respuesta es igual a «no existe»: lista vacía (RF-H01 CA 5).
"""

from dataclasses import dataclass, replace
from datetime import date, datetime, time, timedelta
from uuid import UUID

from app.core.errores import ErrorApi
from app.core.seudonimo import Seudonimizador
from app.models import Analisis
from app.repositories.historial_repository import FiltroHistorial, RepositorioHistorial
from app.services.analisis import ZONA_COLOMBIA
from app.services.pacientes import documento_normalizado


@dataclass(frozen=True)
class PaginaHistorial:
    analisis: list[Analisis]
    total: int
    casos: list[UUID]  # solo en «Buscar por paciente»


def limites_de_fechas(
    desde: date | None, hasta: date | None
) -> tuple[datetime | None, datetime | None]:
    """Días de Colombia → instantes: `desde` a las 00:00 y `hasta` incluido todo el día."""
    if desde and hasta and desde > hasta:
        raise ErrorApi(
            422,
            "RANGO_FECHAS_INVALIDO",
            "La fecha inicial no puede ser posterior a la final.",
            [{"campo": "desde", "mensaje": "Debe ser anterior o igual a «hasta»."}],
        )
    inicio = datetime.combine(desde, time.min, ZONA_COLOMBIA) if desde else None
    fin = datetime.combine(hasta + timedelta(days=1), time.min, ZONA_COLOMBIA) if hasta else None
    return inicio, fin


class ServicioHistorial:
    def __init__(self, repositorio: RepositorioHistorial, seudonimizador: Seudonimizador) -> None:
        self._repo = repositorio
        self._seudonimizador = seudonimizador

    def mis_analisis(self, doctor_id: UUID, filtro: FiltroHistorial) -> PaginaHistorial:
        filas, total = self._repo.listar(doctor_id, filtro)
        return PaginaHistorial(filas, total, [])

    def de_paciente(
        self, doctor_id: UUID, tipo: str, numero: str, filtro: FiltroHistorial
    ) -> PaginaHistorial:
        valor = documento_normalizado(tipo, numero)
        seudonimos = self._seudonimizador.todos(valor)
        casos = self._repo.casos_del_paciente(doctor_id, seudonimos)
        if not casos:  # paciente ajeno o inexistente: misma respuesta, sin pistas
            return PaginaHistorial([], 0, [])
        filas, total = self._repo.listar(doctor_id, replace(filtro, seudonimos=tuple(seudonimos)))
        return PaginaHistorial(filas, total, casos)
