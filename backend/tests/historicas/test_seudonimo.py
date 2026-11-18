"""RF-D01/RNF-28: documentos sintéticos y claves exclusivas de prueba."""
import hashlib
import hmac

import pytest

from app.core.seudonimo import ClavesMalConfiguradas, DocumentoInvalido, Seudonimizador, normalizar


def test_normaliza_tipo_y_separadores():
    assert normalizar(" cc ", "00.012-345") == "CC:00012345"


@pytest.mark.parametrize("tipo,numero,campo", [
    ("OTRO", "000123", "tipo_documento"),
    ("CE", "0001234", "numero_documento"),
    ("TI", "000000000001", "numero_documento"),
    ("CC", "１２３", "numero_documento"),
])
def test_rechaza_documento_invalido_sin_revelarlo(tipo, numero, campo):
    with pytest.raises(DocumentoInvalido) as error:
        normalizar(tipo, numero)
    assert error.value.campo == campo
    assert numero not in str(error.value)


def test_hmac_y_rotacion_conservan_busqueda_anterior():
    anterior, nueva = "clave-ficticia-anterior-" * 2, "clave-ficticia-nueva-" * 2
    viejo = Seudonimizador({1: anterior}, 1).actual("CC:000123")
    rotado = Seudonimizador({1: anterior, 2: nueva}, 2)
    actual = rotado.actual("CC:000123")
    assert actual.version_clave == 2
    assert actual.valor == hmac.new(nueva.encode(), b"CC:000123", hashlib.sha256).hexdigest()
    assert rotado.todos("CC:000123") == [actual, viejo]
    assert rotado.actual("TI:000123").valor != actual.valor


@pytest.mark.parametrize("claves,version", [({}, 1), ({1: "x" * 32}, 2), ({1: "corta"}, 1)])
def test_rechaza_configuracion_hmac_invalida(claves, version):
    with pytest.raises(ClavesMalConfiguradas):
        Seudonimizador(claves, version)
