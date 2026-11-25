"""RF-R04 #108: el contrato backend del dashboard conserva el aviso en estado vacío."""

from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

from app.api.routers.dashboard import dashboard_doctor
from app.schemas.analisis import AVISO_EXPERIMENTAL
from app.services.dashboard import Concordancia, DatosDashboard

DOCTOR_ID = UUID(int=71)


def test_dashboard_sin_analisis_incluye_aviso_experimental_obligatorio():
    servicio = Mock()
    servicio.del_doctor.return_value = DatosDashboard(
        primer_uso=True,
        total=0,
        mes=0,
        ultimos_7_dias=0,
        sin_valoracion=0,
        recientes=[],
        frecuencia=[],
        concordancia=Concordancia(0, 0, 0),
        pacientes_con_seguimiento=0,
        traslados_sin_ver=[],
        casos_recibidos=0,
    )

    salida = dashboard_doctor(SimpleNamespace(usuario=SimpleNamespace(id=DOCTOR_ID)), servicio)

    assert salida.primer_uso is True
    assert salida.aviso.model_dump() == AVISO_EXPERIMENTAL
    servicio.del_doctor.assert_called_once_with(DOCTOR_ID)
