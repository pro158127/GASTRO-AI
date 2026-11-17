"""Política de contraseñas de RF-U02, al estilo NIST SP 800-63B-4.

- De 12 a 64 caracteres (contados como letras, no como bytes: una «ñ» es uno).
- Se permite todo: espacios, tildes, emojis. Nada de «una mayúscula y un símbolo».
- Se rechazan las de diccionario, las obvias (1111…, 1234…, qwerty…), las que llevan el
  correo o el nombre de la app, las que ya salieron en filtraciones y la misma temporal.

El error trae la lista `requisitos` con cada regla y si se cumple: es lo que pinta la
lista de chulitos de W-02b (ARCHITECTURE.md §3.5). Ojo: solo se le muestra a alguien que
ya pasó la contraseña temporal, así que no le regala pistas a un atacante.
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

# Palabras del contexto que no pueden ir en la contraseña (NIST: «context-specific words»)
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
    return any(compacta in s or compacta in s[::-1] for s in SECUENCIAS)


def _es_comun(normal: str) -> bool:
    return normal in COMUNES or normal.replace(" ", "") in COMUNES or _es_obvia(normal)


def _lleva_datos_propios(normal: str, correo: str | None) -> bool:
    if any(palabra in normal for palabra in PROPIAS_DEL_SISTEMA):
        return True
    if correo:
        usuario = _normalizar(correo.split("@", 1)[0])
        if len(usuario) >= 4 and usuario in normal:
            return True
    return False


def evaluar_requisitos(
    contrasena: str, *, correo: str | None, verificador: VerificadorFiltraciones
) -> list[dict[str, object]]:
    """Cada regla con su código y si se cumple, en el orden en que las muestra W-02."""
    largo = len(unicodedata.normalize("NFC", contrasena))
    normal = _normalizar(contrasena)
    return [
        {"codigo": "LONGITUD_MINIMA", "cumple": largo >= MINIMO},
        {"codigo": "LONGITUD_MAXIMA", "cumple": largo <= MAXIMO},
        {"codigo": "NO_COMUN", "cumple": not _es_comun(normal)},
        {"codigo": "SIN_DATOS_PROPIOS", "cumple": not _lleva_datos_propios(normal, correo)},
        {"codigo": "NO_FILTRADA", "cumple": not verificador.esta_filtrada(contrasena)},
    ]


def validar_contrasena(
    contrasena: str,
    *,
    confirmacion: str | None = None,
    correo: str | None,
    verificador: VerificadorFiltraciones,
    es_la_temporal: bool = False,
) -> None:
    """Lanza 422 CONTRASENA_NO_CUMPLE_POLITICA con `campos` y `requisitos` si algo falla.

    `confirmacion=None` no la revisa (pa cuando no hay campo de confirmación).
    `es_la_temporal` la calcula el servicio, que es quien tiene el hash guardado.
    """
    requisitos = evaluar_requisitos(contrasena, correo=correo, verificador=verificador)
    requisitos.append({"codigo": "DISTINTA_A_LA_TEMPORAL", "cumple": not es_la_temporal})
    campos = []
    if not all(r["cumple"] for r in requisitos):
        campos.append({"campo": "contrasena_nueva", "mensaje": MENSAJE})
    if confirmacion is not None and confirmacion != contrasena:
        campos.append({"campo": "confirmacion", "mensaje": "No coincide con la contraseña nueva."})
    if campos:
        raise ErrorApi(
            422, "CONTRASENA_NO_CUMPLE_POLITICA", MENSAJE, campos, {"requisitos": requisitos}
        )
