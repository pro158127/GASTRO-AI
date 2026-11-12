"""Bandeja «Casos recibidos» del doctor (RF-A07, contrato §5, TRAS-03 a TRAS-05).

Un bloque por traslado (el más reciente primero) con el doctor de origen, si su cuenta fue
eliminada (RF-A07 CA 4), si es nuevo, sus casos y los análisis de esos casos. La búsqueda por
documento filtra los mismos bloques por paciente; si no hay nada, la respuesta es igual a «no
existe» (RF-H01 CA 5).
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from app.core.errores import ErrorApi
from app.core.seudonimo import Seudonimizador, Seudonimo
from app.models import Analisis, Traslado, Usuario
from app.repositories.casos_recibidos_repository import RepositorioCasosRecibidos, ResumenCaso
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.pacientes import documento_normalizado


@dataclass(frozen=True)
class BloqueTraslado:
    traslado: Traslado
    casos: list[ResumenCaso]
    analisis: list[Analisis]
    analisis_total: int


@dataclass(frozen=True)
class Bandeja:
    bloques: list[BloqueTraslado]
    nuevos: int
    doctores_origen: list[Usuario]
    analisis_propios_paciente: int | None  # solo en la búsqueda por paciente


class ServicioCasosRecibidos:
    def __init__(
        self,
        repositorio: RepositorioCasosRecibidos,
        seudonimizador: Seudonimizador,
        unidad: UnidadTrabajo,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repositorio
        self._seudonimizador = seudonimizador
        self._unidad = unidad
        self._reloj = reloj

    def bandeja(self, doctor_id: UUID, origen_id: UUID | None, limite: int | None) -> Bandeja:
        return Bandeja(
            bloques=self._bloques(doctor_id, origen_id, limite, None),
            nuevos=self._repo.nuevos(doctor_id),
            doctores_origen=self._repo.doctores_origen(doctor_id),
            analisis_propios_paciente=None,
        )

    def buscar(
        self, doctor_id: UUID, tipo: str, numero: str, origen_id: UUID | None, limite: int | None
    ) -> Bandeja:
        valor = documento_normalizado(tipo, numero)
        seudonimos = self._seudonimizador.todos(valor)
        return Bandeja(
            bloques=self._bloques(doctor_id, origen_id, limite, seudonimos),
            nuevos=self._repo.nuevos(doctor_id),
            doctores_origen=self._repo.doctores_origen(doctor_id),
            analisis_propios_paciente=self._repo.analisis_propios_del_paciente(
                doctor_id, seudonimos
            ),
        )

    def marcar_visto(self, doctor_id: UUID, traslado_id: UUID) -> None:
        """Deja de salir como «Nuevo». Repetirlo no cambia la fecha. Ajeno o inexistente: 404."""
        if not self._repo.marcar_visto(traslado_id, doctor_id, self._reloj()):
            raise ErrorApi(404, "NO_ENCONTRADO", "No encontramos este traslado.")
        self._unidad.confirmar()

    def _bloques(
        self,
        doctor_id: UUID,
        origen_id: UUID | None,
        limite: int | None,
        seudonimos: list[Seudonimo] | None,
    ) -> list[BloqueTraslado]:
        bloques = []
        for traslado in self._repo.traslados(doctor_id, origen_id, seudonimos):
            analisis, total = self._repo.analisis(traslado.id, doctor_id, limite, seudonimos)
            bloques.append(
                BloqueTraslado(
                    traslado=traslado,
                    casos=self._repo.casos(traslado.id, doctor_id, seudonimos),
                    analisis=analisis,
                    analisis_total=total,
                )
            )
        return bloques
