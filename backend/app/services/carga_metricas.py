"""Carga del reporte de evaluación del modelo (RM-06) a la base, pa RF-A05 y RF-DB02.

Revisa todo antes de escribir y no carga nada si algo no cuadra:

- El modelo (repositorio + revisión) tiene que estar registrado en la base: unas métricas
  de otra revisión no describen el modelo que corre (RNF-29).
- Cada característica tiene que existir en el catálogo.
- La fecha del reporte no puede ser futura.

Si el modelo no es el vigente igual se carga (puede ser el siguiente en desplegarse), pero
se avisa: la pantalla solo muestra las del vigente.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from app.repositories.carga_metricas_repository import RepositorioCargaMetricas
from app.schemas.reporte_evaluacion import ReporteEvaluacion
from app.services.analisis import ZONA_COLOMBIA


class ErrorCargaMetricas(Exception):
    def __init__(self, errores: list[str]) -> None:
        super().__init__("; ".join(errores))
        self.errores = errores


@dataclass(frozen=True)
class ResultadoCarga:
    metricas: int
    reemplazadas: int
    avisos: list[str] = field(default_factory=list)


def _hoy() -> date:
    return datetime.now(UTC).astimezone(ZONA_COLOMBIA).date()


class ServicioCargaMetricas:
    def __init__(
        self, repositorio: RepositorioCargaMetricas, hoy: Callable[[], date] = _hoy
    ) -> None:
        self._repo = repositorio
        self._hoy = hoy

    def cargar(self, reporte: ReporteEvaluacion) -> ResultadoCarga:
        """Valida y deja las filas listas en la sesión. El commit lo hace quien llama."""
        errores: list[str] = []
        modelo = self._repo.modelo(reporte.repositorio_hf, reporte.revision_sha)
        if modelo is None:
            errores.append(
                f"No hay un modelo registrado con repositorio {reporte.repositorio_hf} y "
                f"revisión {reporte.revision_sha}. Primero se despliega (carga inicial)."
            )
        catalogo = self._repo.caracteristicas()
        desconocidas = sorted(set(reporte.por_caracteristica) - set(catalogo))
        if desconocidas:
            errores.append(
                "Estas características no están en el catálogo: " + ", ".join(desconocidas)
            )
        if reporte.fecha_reporte > self._hoy():
            errores.append("La fecha del reporte no puede ser futura.")
        if errores:
            raise ErrorCargaMetricas(errores)

        filas = [(None, nombre, valor) for nombre, valor in reporte.macro.items()]
        for codigo, metricas in reporte.por_caracteristica.items():
            filas += [(catalogo[codigo], nombre, valor) for nombre, valor in metricas.items()]
        reemplazadas = self._repo.reemplazar(
            modelo.id, reporte.conjunto_prueba, reporte.fecha_reporte, filas
        )
        avisos = []
        if not modelo.es_vigente:
            avisos.append(
                "Ese modelo no es el vigente: las métricas quedan guardadas, pero la pantalla "
                "solo muestra las del modelo vigente."
            )
        return ResultadoCarga(len(filas), reemplazadas, avisos)
