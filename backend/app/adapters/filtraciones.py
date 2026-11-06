"""¿Esta contraseña ya salió en alguna filtración? Have I Been Pwned por k-anonimato (RF-U02 CA 5).

Cómo funciona sin regalar la contraseña: se calcula el SHA-1, se mandan solo los primeros
5 caracteres y HIBP devuelve todos los sufijos que empiezan así (cientos). La comparación
se hace aquí. Con Add-Padding la respuesta trae relleno falso, pa que ni el tamaño delate.
"""

import hashlib
import logging
from typing import Protocol

import httpx

logger = logging.getLogger("gastroia")


class VerificadorFiltraciones(Protocol):
    def esta_filtrada(self, contrasena: str) -> bool: ...


class VerificadorHIBP:
    def __init__(self, cliente: httpx.Client, url_base: str) -> None:
        self._cliente = cliente
        self._url_base = url_base.rstrip("/") + "/"

    def esta_filtrada(self, contrasena: str) -> bool:
        sha1 = hashlib.sha1(contrasena.encode("utf-8")).hexdigest().upper()  # noqa: S324
        prefijo, sufijo = sha1[:5], sha1[5:]
        try:
            respuesta = self._cliente.get(self._url_base + prefijo, headers={"Add-Padding": "true"})
            respuesta.raise_for_status()
        except httpx.HTTPError:
            # Si HIBP se cae, no dejamos a nadie atascado en el cambio de contraseña:
            # se acepta y queda el aviso en el log. El resto de la política sí se aplica.
            logger.warning("HIBP no respondió; se omite la revisión de contraseña filtrada")
            return False
        for linea in respuesta.text.splitlines():
            candidato, _, veces = linea.strip().partition(":")
            if candidato == sufijo and veces.strip() not in ("", "0"):  # 0 = relleno
                return True
        return False


class SinRevision:
    """Pa cuando CONTRASENAS_FILTRADAS_ACTIVO=false (sin internet en el servidor)."""

    def esta_filtrada(self, contrasena: str) -> bool:
        return False


def crear_verificador(activo: bool, url: str, timeout: float) -> VerificadorFiltraciones:
    if not activo:
        return SinRevision()
    cliente = httpx.Client(timeout=timeout, headers={"User-Agent": "Gastro-AI"})
    return VerificadorHIBP(cliente, url)
