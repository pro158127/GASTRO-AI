"""Política de contraseñas de RF-U02, al estilo NIST SP 800-63B-4.

- De 12 a 64 caracteres (contados como letras, no como bytes: una «ñ» es uno).
- Se permite todo: espacios, tildes, emojis. Nada de «una mayúscula y un símbolo».
- Se rechazan las de diccionario, las obvias (1111…, 1234…, qwerty…), las que llevan el
  correo o el nombre de la app, y las que ya salieron en filtraciones.
El mensaje de error es uno solo a propósito: no le damos pistas a nadie de qué regla falló.
"""

import unicodedata

from app.adapters.filtraciones import VerificadorFiltraciones
from app.core.errores import ErrorApi

MINIMO, MAXIMO = 12, 64

MENSAJE = "Usa entre 12 y 64 caracteres y evita contraseñas comunes."

# Las más usadas de 12+ caracteres en español e inglés. No es exhaustiva: lo grueso lo
# atrapa HIBP; esta lista es pa cuando HIBP no responde o está apagado.
COMUNES = frozenset(
    {
        "contraseña123",
        "contrasena123",
        "contraseña1234",
        "contrasena1234",
        "micontraseña",
        "micontrasena",
        "password1234",
        "password12345",
        "passwordpassword",
        "iloveyou1234",
        "administrador",
        "administrador1",
        "administrador123",
        "bienvenido123",
        "bienvenido1234",
        "qwertyuiopasdf",
        "1q2w3e4r5t6y",
        "123456789abc",
        "abc123456789",
        "colombia1234",
        "colombia2026",
        "medicina1234",
        "doctor123456",
        "hospital1234",
    }
)

# Palabras del contexto que no pueden ser la contraseña (NIST: «context-specific words»)
PROPIAS_DEL_SISTEMA = ("gastroai", "gastro-ai", "gastro ai", "oncoai", "onco-ai")

SECUENCIAS = (
    "0123456789012345678901234567890123456789",
    "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz",
    "qwertyuiopasdfghjklzxcvbnmqwertyuiopasdfghjklzxcvbnm",
)


def _normalizar(texto: str) -> str:
    return unicodedata.normalize("NFC", texto).casefold()


def _es_obvia(normal: str) -> bool:
    compacta = normal.replace(" ", "")
    if len(set(compacta)) <= 2:  # «aaaaaaaaaaaa», «abababababab»
        return True
    for secuencia in SECUENCIAS:
        if compacta in secuencia or compacta in secuencia[::-1]:
            return True
    return False


def validar_contrasena(
    contrasena: str,
    *,
    correo: str | None,
    verificador: VerificadorFiltraciones,
) -> None:
    """Lanza ErrorApi 422 CONTRASENA_DEBIL si no cumple. No devuelve nada si sí."""
    largo = len(unicodedata.normalize("NFC", contrasena))
    if largo < MINIMO or largo > MAXIMO:
        raise ErrorApi(422, "CONTRASENA_DEBIL", MENSAJE)

    normal = _normalizar(contrasena)
    rechazada = (
        normal in COMUNES
        or normal.replace(" ", "") in COMUNES
        or _es_obvia(normal)
        or any(palabra in normal for palabra in PROPIAS_DEL_SISTEMA)
    )
    if correo:
        usuario = _normalizar(correo.split("@", 1)[0])
        if len(usuario) >= 4 and usuario in normal:
            rechazada = True
    # HIBP al final: solo se consulta si las reglas locales no la tumbaron ya
    if rechazada or verificador.esta_filtrada(contrasena):
        raise ErrorApi(422, "CONTRASENA_DEBIL", MENSAJE)
