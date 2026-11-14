"""RF-U01: TOTP y protección del secreto; datos exclusivamente sintéticos."""
import base64

import pyotp
import pytest

from app.core.seguridad import CifradorTotp, ErrorCifrado, verificar_codigo_totp
from app.schemas.auth import CodigoEntrada

SECRETO = "JBSWY3DPEHPK3PXP"
AHORA = 1800000000


@pytest.mark.parametrize("desfase,aceptado", [(-60, False), (-30, True), (0, True), (30, True), (60, False)])
def test_T70_S01_ventana_totp(desfase, aceptado):
    codigo = pyotp.TOTP(SECRETO).at(AHORA + desfase)
    resultado = verificar_codigo_totp(SECRETO, codigo, None, ahora=AHORA)
    assert resultado == ((AHORA + desfase) // 30 if aceptado else None)


@pytest.mark.parametrize("codigo", ["", "12345", "abcdef", "１２３４５６"],
                         ids=["vacio", "corto", "letras", "digitos-unicode"])
def test_T70_S02_codigo_malformado_se_rechaza(codigo):
    # La entrada API permite estos seis dígitos Unicode; el servicio debe rechazarlos.
    if codigo == "１２３４５６":
        assert CodigoEntrada(codigo=codigo).codigo == codigo
    assert verificar_codigo_totp(SECRETO, codigo, None, ahora=AHORA) is None


@pytest.mark.parametrize("caso", ["correcto", "otro-usuario", "alterado", "truncado"])
def test_T70_S03_cifrado_asociado_a_usuario(caso):
    cifrador = CifradorTotp(base64.b64encode(bytes(range(32))).decode())
    datos = cifrador.cifrar(SECRETO, "usuario-sintetico-1")
    if caso == "correcto":
        assert cifrador.descifrar(datos, "usuario-sintetico-1") == SECRETO
        return
    usuario = "usuario-sintetico-2" if caso == "otro-usuario" else "usuario-sintetico-1"
    if caso == "alterado":
        datos = datos[:-1] + bytes([datos[-1] ^ 1])
    elif caso == "truncado":
        datos = datos[:10]
    with pytest.raises(ErrorCifrado):
        cifrador.descifrar(datos, usuario)


@pytest.mark.parametrize("clave", ["no-es-base64!", base64.b64encode(b"corta").decode()])
def test_T70_S04_clave_de_cifrado_invalida(clave):
    with pytest.raises(ErrorCifrado):
        CifradorTotp(clave)
