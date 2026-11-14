"""RF-U02: política real con consulta de filtraciones sustituida en memoria."""
from unittest.mock import Mock

import pytest

from app.core.errores import ErrorApi
from app.services.politica_contrasena import evaluar_requisitos, validar_contrasena


@pytest.mark.parametrize("longitud,aceptada", [(11, False), (12, True), (64, True), (65, False)])
def test_limites_de_longitud(longitud, aceptada):
    clave = ("luna bosque río " * 5)[:longitud]
    verificador = Mock(esta_filtrada=Mock(return_value=False))
    if aceptada:
        assert validar_contrasena(clave, correo=None, verificador=verificador) is None
    else:
        with pytest.raises(ErrorApi) as error:
            validar_contrasena(clave, correo=None, verificador=verificador)
        assert (error.value.estado, error.value.codigo) == (422, "CONTRASENA_NO_CUMPLE_POLITICA")
    verificador.esta_filtrada.assert_called_once_with(clave)


@pytest.mark.parametrize("clave,correo,filtrada,regla", [
    ("password1234", None, False, "NO_COMUN"),
    ("Gastro-AI bosque", None, False, "SIN_DATOS_PROPIOS"),
    ("tester bosque lunar", "tester@example.invalid", False, "SIN_DATOS_PROPIOS"),
    ("bosque de luna azul", None, True, "NO_FILTRADA"),
])
def test_rechazo_de_claves_inseguras(clave, correo, filtrada, regla):
    with pytest.raises(ErrorApi) as error:
        validar_contrasena(clave, correo=correo,
                           verificador=Mock(esta_filtrada=Mock(return_value=filtrada)))
    assert error.value.estado == 422
    reglas = {r["codigo"]: r["cumple"] for r in error.value.extra["requisitos"]}
    assert reglas[regla] is False


def test_confirmacion_y_reutilizacion_de_temporal():
    with pytest.raises(ErrorApi) as error:
        validar_contrasena("bosque de luna azul", confirmacion="otra contraseña",
                           correo=None, es_la_temporal=True,
                           verificador=Mock(esta_filtrada=Mock(return_value=False)))
    assert {c["campo"] for c in error.value.campos} == {"contrasena_nueva", "confirmacion"}
    assert {r["codigo"]: r["cumple"] for r in error.value.extra["requisitos"]}["DISTINTA_A_LA_TEMPORAL"] is False


def test_longitud_unicode_normalizada():
    # 12 puntos de código, pero 11 caracteres después de normalizar NFC.
    requisitos = evaluar_requisitos("a\u0301bcdefghijk", correo=None,
                                    verificador=Mock(esta_filtrada=Mock(return_value=False)))
    assert {r["codigo"]: r["cumple"] for r in requisitos}["LONGITUD_MINIMA"] is False
