"""RNF-02 y RF-U01: bcrypt real y rechazo de reutilización TOTP."""
import pyotp
import pytest

from app.core.seguridad import hashear_contrasena, verificar_codigo_totp, verificar_contrasena


def test_bcrypt_unicode_sin_truncamiento():
    clave = "árbol🌳" * 10
    guardado = hashear_contrasena(clave)
    assert guardado.split("$")[2] == "12"
    assert verificar_contrasena(clave, guardado) is True
    assert verificar_contrasena(clave[:-1] + "X", guardado) is False


@pytest.mark.parametrize("guardado", [None, "hash-corrupto"])
def test_hash_ausente_o_corrupto_rechaza_acceso(guardado):
    assert verificar_contrasena("clave exclusivamente ficticia", guardado) is False


def test_totp_valido_no_se_puede_reutilizar():
    secreto = "JBSWY3DPEHPK3PXP"  # Dato público de prueba; ninguna cuenta real.
    ahora = 1800000000
    codigo = pyotp.TOTP(secreto).at(ahora)
    paso = verificar_codigo_totp(secreto, codigo, None, ahora=ahora)
    assert paso == ahora // 30
    assert verificar_codigo_totp(secreto, codigo, paso, ahora=ahora) is None
    assert verificar_codigo_totp(secreto, codigo, None, ahora=ahora + 90) is None
