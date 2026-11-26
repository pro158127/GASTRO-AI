"""RF-H02 #111: consultas de reportes acotadas al doctor, sin base de datos real."""

from unittest.mock import Mock
from uuid import UUID

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.repositories.reportes_repository import RepositorioReportes

DOCTOR_ID = UUID(int=81)
CASO_ID = UUID(int=82)
ANALISIS_ID = UUID(int=83)
REPORTE_ID = UUID(int=84)


def _consulta(consulta):
    return consulta.compile(dialect=postgresql.dialect())


def test_seleccion_de_analisis_filtra_caso_asignado_y_ids():
    db = Mock(spec=Session)
    db.scalars.return_value = []
    repo = RepositorioReportes(db)

    assert repo.analisis(DOCTOR_ID, [ANALISIS_ID]) == []

    compilada = _consulta(db.scalars.call_args.args[0])
    assert '"CasoPaciente".doctor_asignado_id' in str(compilada)
    assert '"Analisis".id IN' in str(compilada)
    assert DOCTOR_ID in compilada.params.values()
    assert [ANALISIS_ID] in compilada.params.values()


def test_seleccion_de_caso_filtra_tambien_doctor_asignado():
    db = Mock(spec=Session)
    db.scalars.return_value = []
    repo = RepositorioReportes(db)

    assert repo.analisis_del_caso(DOCTOR_ID, CASO_ID) == []

    compilada = _consulta(db.scalars.call_args.args[0])
    assert '"CasoPaciente".doctor_asignado_id' in str(compilada)
    assert '"Analisis".caso_id' in str(compilada)
    assert DOCTOR_ID in compilada.params.values()
    assert CASO_ID in compilada.params.values()


def test_recuperacion_de_pdf_filtra_autor_y_reporte():
    db = Mock(spec=Session)
    repo = RepositorioReportes(db)

    repo.del_doctor(REPORTE_ID, DOCTOR_ID)

    compilada = _consulta(db.scalar.call_args.args[0])
    assert '"Reporte".doctor_id' in str(compilada)
    assert '"Reporte".id' in str(compilada)
    assert DOCTOR_ID in compilada.params.values()
    assert REPORTE_ID in compilada.params.values()
