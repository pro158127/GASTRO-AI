"""Métricas del modelo desplegado (RF-A05) y logs técnicos de inferencia (RF-M03).

Las métricas son las del reporte de evaluación (RM-06) sobre el conjunto de prueba, NO el
desempeño en producción, y se rotulan así siempre (RF-DB02 CA 5). Si no hay reporte no se
inventan cifras: `disponible = false` y la pantalla muestra su estado vacío (W-23b).
"""

from dataclasses import dataclass
from datetime import date

from app.models import MetricaModelo, ModeloDesplegado, NombreMetrica
from app.repositories.monitoreo_repository import FilaLog, FiltroLogs, RepositorioMonitoreo

ROTULO_METRICAS = "Evaluación del modelo desplegado sobre el conjunto de prueba"


@dataclass(frozen=True)
class MetricasDe:
    """Una fila de la tabla: el valor de cada métrica, o None si el reporte no la trae."""

    valores: dict[NombreMetrica, float | None]


@dataclass(frozen=True)
class MetricaCaracteristica:
    caracteristica_id: int
    nombre: str
    metricas: MetricasDe


@dataclass(frozen=True)
class ReporteMetricas:
    modelo: ModeloDesplegado | None
    disponible: bool
    conjunto_prueba: str | None = None
    fecha_reporte: date | None = None
    macro: MetricasDe | None = None
    por_caracteristica: tuple[MetricaCaracteristica, ...] = ()


def _vacias() -> dict[NombreMetrica, float | None]:
    return dict.fromkeys(NombreMetrica)


class ServicioMonitoreo:
    def __init__(self, repositorio: RepositorioMonitoreo) -> None:
        self._repo = repositorio

    def metricas(self) -> ReporteMetricas:
        """El reporte más reciente del modelo vigente, macro y por característica."""
        modelo = self._repo.modelo_vigente()
        if modelo is None:
            return ReporteMetricas(None, False)
        filas = self._repo.metricas(modelo.id)
        if not filas:
            return ReporteMetricas(modelo, False)
        # Si hay varios reportes, solo cuenta el último: mezclar conjuntos daría cifras falsas
        ultimo: MetricaModelo = filas[0]
        del_reporte = [
            f
            for f in filas
            if f.fecha_reporte == ultimo.fecha_reporte
            and f.conjunto_prueba == ultimo.conjunto_prueba
        ]
        macro = _vacias()
        por_id: dict[int, dict[NombreMetrica, float | None]] = {}
        nombres: dict[int, str] = {}
        for c in self._repo.caracteristicas_activas():  # todas, aunque falten sus métricas
            por_id[c.id] = _vacias()
            nombres[c.id] = c.nombre
        for f in del_reporte:
            if f.caracteristica_id is None:
                macro[f.metrica] = float(f.valor)
            else:
                por_id.setdefault(f.caracteristica_id, _vacias())[f.metrica] = float(f.valor)
                if f.caracteristica is not None:
                    nombres.setdefault(f.caracteristica_id, f.caracteristica.nombre)
        return ReporteMetricas(
            modelo,
            True,
            ultimo.conjunto_prueba,
            ultimo.fecha_reporte,
            MetricasDe(macro),
            tuple(
                MetricaCaracteristica(i, nombres.get(i, ""), MetricasDe(v))
                for i, v in sorted(por_id.items())
            ),
        )

    def logs(self, filtro: FiltroLogs) -> tuple[list[FilaLog], int]:
        return self._repo.logs(filtro)
