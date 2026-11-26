"""RF-H01 #110: búsqueda por paciente sin revelar casos ajenos y fechas Colombia."""

from datetime import UTC, date, datetime
from unittest.mock import Mock
from uuid import UUID

import pytest

from app.core.errores import ErrorApi
from app.repositories.historial_repository import FiltroHistorial
from app.services.historial import ServicioHistorial, limites_de_fechas

DOCTOR_ID = UUID(int=51)
CASO_ID = UUID(int=52)


def test_paciente_no_asignado_no_consulta_analisis_ni_revela_existencia():
    repo, seudonimizador = Mock(), Mock()
    seudonimizador.todos.return_value = ["seudonimo-sintetico"]
    repo.casos_del_paciente.return_value = []
    servicio = ServicioHistorial(repo, seudonimizador)

    resultado = servicio.de_paciente(DOCTOR_ID, "CC", "123456", FiltroHistorial())

    assert resultado.analisis == [] and resultado.total == 0 and resultado.casos == []
    repo.casos_del_paciente.assert_called_once_with(DOCTOR_ID, ["seudonimo-sintetico"])
    repo.listar.assert_not_called()


def test_paciente_asignado_lista_solo_con_filtro_seudonimizado():
    repo, seudonimizador = Mock(), Mock()
    seudonimizador.todos.return_value = ["version-a", "version-b"]
    repo.casos_del_paciente.return_value = [CASO_ID]
    fila = object()
    repo.listar.return_value = ([fila], 1)
    servicio = ServicioHistorial(repo, seudonimizador)

    resultado = servicio.de_paciente(DOCTOR_ID, "CC", "123456", FiltroHistorial())

    assert resultado.analisis == [fila] and resultado.total == 1
    assert resultado.casos == [CASO_ID]
    args = repo.listar.call_args.args
    assert args[0] == DOCTOR_ID and args[1].seudonimos == ("version-a", "version-b")


def test_dia_colombia_incluye_hasta_y_rechaza_rango_invertido():
    inicio, fin = limites_de_fechas(date(2026, 11, 24), date(2026, 11, 24))

    assert inicio.astimezone(UTC) == datetime(2026, 11, 24, 5, tzinfo=UTC)
    assert fin.astimezone(UTC) == datetime(2026, 11, 25, 5, tzinfo=UTC)
    with pytest.raises(ErrorApi) as error:
        limites_de_fechas(date(2026, 11, 25), date(2026, 11, 24))
    assert (error.value.estado, error.value.codigo) == (422, "RANGO_FECHAS_INVALIDO")
