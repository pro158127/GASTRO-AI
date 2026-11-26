"""Pruebas aisladas de la marca de recorrido de bienvenida."""
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.services.perfil import ServicioPerfil


@pytest.mark.parametrize("rol", ["DOCTOR", "ADMINISTRADOR"])
def test_marcar_recorrido_guarda_fecha_una_vez(rol):
    servicio = ServicioPerfil(Mock(), Mock())
    usuario = SimpleNamespace(rol=rol, recorrido_visto_en=None)

    assert servicio.marcar_recorrido_visto(usuario) is None
    primera_fecha = usuario.recorrido_visto_en
    assert isinstance(primera_fecha, datetime)
    assert primera_fecha.tzinfo is UTC
    servicio._unidad.confirmar.assert_called_once_with()
    servicio._publicador.publicar.assert_not_called()

    servicio._unidad.confirmar.reset_mock()
    servicio.marcar_recorrido_visto(usuario)
    assert usuario.recorrido_visto_en is primera_fecha
    servicio._unidad.confirmar.assert_not_called()
