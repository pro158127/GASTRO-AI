"""Primitivas de seguridad compartidas: contraseñas, token de sesión, TOTP y su cifrado.

Aquí no hay reglas del negocio (cuántos intentos, qué etapa sigue): eso va en los servicios.
Esto es la caja de herramientas criptográfica, y por eso no toca la base ni FastAPI.
"""

import base64
import binascii
import hashlib
import hmac
import secrets
import time
from functools import cache

import bcrypt
import pyotp
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

RONDAS_BCRYPT = 12  # RNF-02: mínimo 12. Bajarlo pa que las pruebas corran más rápido = no

# ----------------------------------------------------------------- contraseñas (RNF-02)


def _preparar(contrasena: str) -> bytes:
    """SHA-256 + Base64 antes de bcrypt: siempre 44 bytes.

    bcrypt solo mira 72 bytes y la versión 5 truena si le pasas más. RF-U02 permite 64
    caracteres con tildes y emojis, y eso pasa de 72 bytes fácil (40 «ñ» = 80 bytes).
    Con esto ninguna contraseña válida se trunca ni revienta.
    """
    return base64.b64encode(hashlib.sha256(contrasena.encode("utf-8")).digest())


def hashear_contrasena(contrasena: str) -> str:
    """bcrypt con sal única por contraseña. Lo que se guarda es esto, jamás el texto plano."""
    return bcrypt.hashpw(_preparar(contrasena), bcrypt.gensalt(rounds=RONDAS_BCRYPT)).decode()


@cache
def _hash_ficticio() -> bytes:
    return bcrypt.hashpw(b"nadie-tiene-esta-clave", bcrypt.gensalt(rounds=RONDAS_BCRYPT))


def verificar_contrasena(contrasena: str, hash_guardado: str | None) -> bool:
    """Compara contra el hash guardado.

    Si no hay hash (correo que no existe, cuenta eliminada) igual se corre un bcrypt contra
    uno ficticio: así ambos casos tardan lo mismo y no se puede adivinar qué correos existen
    midiendo el tiempo de respuesta (CWE-208).
    """
    if not hash_guardado:
        bcrypt.checkpw(_preparar(contrasena), _hash_ficticio())
        return False
    try:
        return bcrypt.checkpw(_preparar(contrasena), hash_guardado.encode("utf-8"))
    except ValueError:  # hash corrupto en la base: se trata como contraseña incorrecta
        return False


def generar_contrasena_temporal() -> str:
    """Temporal aleatoria con CSPRNG, sin nada derivado del usuario (RF-U05 CA 3, RNF-02).

    16 caracteres URL-safe (~96 bits); se manda por correo y vence a las 72 h (RNF-27).
    """
    return secrets.token_urlsafe(12)


# ------------------------------------------------------------- token de sesión (cookie)


def generar_token_sesion() -> str:
    """Token opaco de 256 bits pa la cookie gastro_sesion: va al cliente; a la base, su hash."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 en hex. Basta sin sal ni bcrypt: el token ya es aleatorio de 256 bits."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------- TOTP (RF-U01)

EMISOR_TOTP = "Gastro-AI"
PASO_TOTP_SEGUNDOS = 30  # RF-U01 CA 7: el código vale 30 s


def generar_secreto_totp() -> str:
    return pyotp.random_base32()


def uri_aprovisionamiento(secreto: str, correo: str) -> str:
    """El otpauth:// que va en el QR; el secreto en texto es la alternativa accesible (CA 10)."""
    return pyotp.TOTP(secreto).provisioning_uri(name=correo, issuer_name=EMISOR_TOTP)


def verificar_codigo_totp(
    secreto: str, codigo: str, ultimo_paso: int | None, ahora: float | None = None
) -> int | None:
    """Devuelve el paso de tiempo del código si es válido y nuevo; si no, None.

    - Tolera una ventana de 30 s pa atrás y pa adelante (relojes de celular desfasados).
    - Rechaza un paso igual o anterior al último aceptado: el mismo código no entra dos
      veces (RF-U01 CA 7). Quien llama guarda el paso devuelto en Usuario.totp_ultimo_paso.
    """
    codigo = codigo.strip()
    # Solo 0-9 ASCII: isdigit() también acepta «１２３４５６» (ancho completo) y otros dígitos
    # Unicode, y con esos compare_digest truena con TypeError → 500 (defecto D-001 de QA)
    if len(codigo) != 6 or not codigo.isascii() or not codigo.isdigit():
        return None
    totp = pyotp.TOTP(secreto, interval=PASO_TOTP_SEGUNDOS)
    paso_actual = int((time.time() if ahora is None else ahora) // PASO_TOTP_SEGUNDOS)
    for paso in (paso_actual - 1, paso_actual, paso_actual + 1):
        esperado = totp.at(paso * PASO_TOTP_SEGUNDOS)
        if hmac.compare_digest(esperado, codigo):
            if ultimo_paso is not None and paso <= ultimo_paso:
                return None  # ya se usó (o uno más nuevo): repetición
            return paso
    return None


# ------------------------------------------------------- cifrado del secreto TOTP (AES-GCM)


class ErrorCifrado(Exception):
    """La llave está mal configurada o el dato cifrado no corresponde. Mensaje sin detalles."""


class CifradorTotp:
    """AES-256-GCM pa guardar el secreto TOTP en Usuario.totp_secreto_cifrado.

    Formato guardado: nonce (12 bytes) + texto cifrado + etiqueta (16 bytes).
    El id del usuario va como dato asociado: si alguien copia el secreto cifrado de una
    cuenta a otra en la base, el descifrado falla. La llave vive en TOTP_CLAVE_CIFRADO.
    """

    def __init__(self, clave_base64: str) -> None:
        try:
            clave = base64.b64decode(clave_base64, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ErrorCifrado("TOTP_CLAVE_CIFRADO no es Base64 válido.") from error
        if len(clave) != 32:
            raise ErrorCifrado("TOTP_CLAVE_CIFRADO debe tener 32 bytes (AES-256).")
        self._aes = AESGCM(clave)

    def cifrar(self, secreto: str, usuario_id: str) -> bytes:
        nonce = secrets.token_bytes(12)  # nuevo cada vez: repetir nonce en GCM es fatal
        return nonce + self._aes.encrypt(nonce, secreto.encode("utf-8"), usuario_id.encode())

    def descifrar(self, datos: bytes, usuario_id: str) -> str:
        if len(datos) < 12 + 16:
            raise ErrorCifrado("Secreto TOTP dañado.")
        try:
            claro = self._aes.decrypt(datos[:12], datos[12:], usuario_id.encode())
        except InvalidTag as error:
            raise ErrorCifrado("No se pudo descifrar el secreto TOTP.") from error
        return claro.decode("utf-8")
