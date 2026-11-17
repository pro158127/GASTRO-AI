"""RF-U03/RNF-01 y RF-U10: permisos y sesiones con repositorios en memoria."""
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.api.deps import requiere_rol
from app.core.errores import ErrorApi
from app.core.seguridad import hash_token
from app.models import CodigoRol, EstadoUsuario, EtapaSesion
from app.services.autenticacion import ServicioAutenticacion


@pytest.mark.parametrize("rol,permitido", [(CodigoRol.ADMINISTRADOR, True), (CodigoRol.DOCTOR, False)])
def test_solo_administrador_supera_control_de_rol(rol, permitido):
    sesion = SimpleNamespace(usuario=SimpleNamespace(rol=SimpleNamespace(codigo=rol)))
    control = requiere_rol(CodigoRol.ADMINISTRADOR)
    if permitido:
        assert control(sesion) is sesion
    else:
        with pytest.raises(ErrorApi) as error:
            control(sesion)
        assert (error.value.estado, error.value.codigo) == (403, "PERMISO_DENEGADO")


@pytest.fixture
def contexto():
    ahora = datetime(2026, 1, 1, 12, tzinfo=UTC)
    usuario = SimpleNamespace(id="usuario-ficticio", estado=EstadoUsuario.ACTIVO, bloqueado_hasta=None)
    sesion = SimpleNamespace(usuario=usuario, cerrada_en=None, ip=None,
                             etapa=EtapaSesion.ACTIVA, ultima_actividad_en=ahora - timedelta(minutes=2))
    repositorio = Mock(por_token_hash=Mock(return_value=sesion))
    unidad = Mock()
    servicio = ServicioAutenticacion(Mock(), repositorio, Mock(), unidad, Mock(), Mock(), reloj=lambda: ahora)
    return servicio, sesion, repositorio, unidad, ahora


@pytest.mark.parametrize("pasiva", [False, True])
def test_actividad_pasiva_no_renueva_sesion(contexto, pasiva):
    servicio, sesion, repositorio, unidad, ahora = contexto
    anterior = sesion.ultima_actividad_en
    assert servicio.validar_sesion("token-ficticio", (EtapaSesion.ACTIVA,), pasiva) is sesion
    repositorio.por_token_hash.assert_called_once_with(hash_token("token-ficticio"))
    assert sesion.ultima_actividad_en == (anterior if pasiva else ahora)
    assert unidad.confirmar.call_count == (0 if pasiva else 1)


def test_sesion_expira_por_inactividad(contexto):
    servicio, sesion, _, unidad, ahora = contexto
    sesion.ultima_actividad_en = ahora - timedelta(minutes=10, seconds=1)
    with pytest.raises(ErrorApi) as error:
        servicio.validar_sesion("token-ficticio", (EtapaSesion.ACTIVA,), False)
    assert (error.value.estado, error.value.codigo) == (401, "SESION_EXPIRADA")
    assert error.value.extra["motivo"] == "INACTIVIDAD"
    assert sesion.cerrada_en == ahora
    unidad.confirmar.assert_called_once_with()


def test_segundo_factor_pendiente_no_accede_a_sesion_activa(contexto):
    servicio, sesion, _, unidad, _ = contexto
    sesion.etapa = EtapaSesion.PENDIENTE_2FA
    with pytest.raises(ErrorApi) as error:
        servicio.validar_sesion("token-ficticio", (EtapaSesion.ACTIVA,), False)
    assert (error.value.estado, error.value.codigo) == (403, "ETAPA_INVALIDA")
    assert error.value.extra["etapa"] == EtapaSesion.PENDIENTE_2FA.value
    unidad.confirmar.assert_not_called()
