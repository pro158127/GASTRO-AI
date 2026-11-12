"""Dashboard clínico: la pantalla inicial del doctor (RF-DB01, contrato §5, DASH-01).

Resume solo su propia actividad (RF-DB01): lo que recibió por traslado se informa aparte y no
cambia su concordancia (RF-A07 CA 2). Nada de seudónimos ni datos del paciente: los análisis
se identifican por su código (RF-DB01 CA 2).
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.models import Analisis, Caracteristica, Traslado, Valoracion
from app.repositories.dashboard_repository import RepositorioDashboard
from app.services.analisis import ZONA_COLOMBIA

# RF-DB01 CA 4: así se rotula la gráfica; nunca «prevalencia» ni «distribución de pacientes»
ROTULO_FRECUENCIA = "Frecuencia de características señaladas por el modelo"


@dataclass(frozen=True)
class Concordancia:
    """Coincide / (Coincide + No coincide). Los no concluyentes se informan aparte."""

    coincide: int
    no_coincide: int
    no_concluyente: int

    @property
    def porcentaje(self) -> float | None:
        evaluados = self.coincide + self.no_coincide
        return round(100 * self.coincide / evaluados, 1) if evaluados else None


@dataclass(frozen=True)
class DatosDashboard:
    primer_uso: bool
    total: int
    mes: int
    ultimos_7_dias: int
    sin_valoracion: int
    recientes: list[Analisis]
    frecuencia: list[tuple[Caracteristica, int]]
    concordancia: Concordancia
    pacientes_con_seguimiento: int
    traslados_sin_ver: list[tuple[Traslado, int]]
    casos_recibidos: int


def inicio_de_mes(ahora: datetime) -> datetime:
    """El día 1 a las 00:00 en Colombia (el mes que ve el doctor, no el de UTC)."""
    local = ahora.astimezone(ZONA_COLOMBIA)
    return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


class ServicioDashboard:
    def __init__(
        self,
        repositorio: RepositorioDashboard,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repositorio
        self._reloj = reloj

    def del_doctor(self, doctor_id: UUID) -> DatosDashboard:
        ahora = self._reloj()
        valoraciones = self._repo.valoraciones(doctor_id)
        return DatosDashboard(
            # RF-DB01 CA 10: sin ningún análisis, el front muestra «Realizar el primer análisis»
            primer_uso=not self._repo.tiene_analisis(doctor_id),
            total=self._repo.contar_completados(doctor_id),
            mes=self._repo.contar_completados(doctor_id, inicio_de_mes(ahora)),
            ultimos_7_dias=self._repo.contar_completados(doctor_id, ahora - timedelta(days=7)),
            sin_valoracion=self._repo.sin_valoracion(doctor_id),
            recientes=self._repo.recientes(doctor_id),
            frecuencia=self._repo.frecuencia(doctor_id),
            concordancia=Concordancia(
                coincide=valoraciones.get(Valoracion.COINCIDE, 0),
                no_coincide=valoraciones.get(Valoracion.NO_COINCIDE, 0),
                no_concluyente=valoraciones.get(Valoracion.NO_CONCLUYENTE, 0),
            ),
            pacientes_con_seguimiento=self._repo.pacientes_con_seguimiento(doctor_id),
            traslados_sin_ver=self._repo.traslados_sin_ver(doctor_id),
            casos_recibidos=self._repo.casos_recibidos(doctor_id),
        )
