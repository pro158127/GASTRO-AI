"""Documento del paciente → seudónimo HMAC (RF-D01, RNF-04, RNF-28).

Reglas que no se negocian:
- El número de documento NUNCA se guarda, ni se registra en logs, ni se devuelve. Vive en
  memoria lo justo pa calcular el seudónimo.
- seudónimo = HMAC-SHA256(clave, "TIPO:NUMERO"). El tipo va adentro pa que la CC 123 y la
  TI 123 no choquen (el separador «:» es el del diseño de la BD; no se cambia con datos).
- Las claves viven en HMAC_CLAVES (variables de entorno), con versión. Los casos nuevos se
  firman con HMAC_VERSION_ACTUAL; pa BUSCAR se prueban TODAS las versiones, así una
  rotación no pierde los casos viejos (RNF-28).

Longitud por tipo, ya sin puntos, espacios ni guiones: CC hasta 10, TI hasta 11, CE hasta 6.
La TI es de menores de edad: protección reforzada (RNF-04, Ley 1581 art. 7).
"""

import hashlib
import hmac
import re
from dataclasses import dataclass
from enum import StrEnum


class TipoDocumento(StrEnum):
    CC = "CC"
    TI = "TI"
    CE = "CE"


NOMBRES_TIPO = {
    TipoDocumento.CC: "Cédula de ciudadanía",
    TipoDocumento.TI: "Tarjeta de identidad",
    TipoDocumento.CE: "Cédula de extranjería",
}

# Decisión del equipo sobre RF-D01 CA 9 (ver la tabla de contradicciones resueltas)
LONGITUD_MAXIMA = {TipoDocumento.CC: 10, TipoDocumento.TI: 11, TipoDocumento.CE: 6}

_SEPARADORES = re.compile(r"[.\s\-]")


class DocumentoInvalido(ValueError):
    """Tipo desconocido o número con formato o longitud que no cuadran.

    `campo` dice cuál de los dos falló. El mensaje nunca incluye el número que mandaron.
    """

    def __init__(self, campo: str, mensaje: str) -> None:
        super().__init__(mensaje)
        self.campo = campo


class ClavesMalConfiguradas(RuntimeError):
    """HMAC_CLAVES o HMAC_VERSION_ACTUAL no sirven: es un error de despliegue, no del usuario."""


def normalizar(tipo: str, numero: str) -> str:
    """«CC», «1.234.567-890» → «CC:1234567890». Lanza DocumentoInvalido si no cuadra."""
    try:
        tipo_doc = TipoDocumento(tipo.strip().upper())
    except ValueError:
        raise DocumentoInvalido("tipo_documento", "Selecciona el tipo de documento.") from None
    digitos = _SEPARADORES.sub("", numero)
    maximo = LONGITUD_MAXIMA[tipo_doc]
    if not digitos.isdigit() or not digitos.isascii() or not 1 <= len(digitos) <= maximo:
        raise DocumentoInvalido(
            "numero_documento",
            f"Escribe solo números, hasta {maximo} dígitos para este tipo de documento.",
        )
    return f"{tipo_doc.value}:{digitos}"


@dataclass(frozen=True)
class Seudonimo:
    version_clave: int
    valor: str  # 64 caracteres hex


class Seudonimizador:
    def __init__(self, claves: dict[int, str], version_actual: int) -> None:
        if not claves or version_actual not in claves:
            raise ClavesMalConfiguradas("HMAC_VERSION_ACTUAL no está en HMAC_CLAVES.")
        if any(len(clave) < 32 or clave.startswith("cambia-esto") for clave in claves.values()):
            raise ClavesMalConfiguradas("HMAC_CLAVES tiene claves de ejemplo o muy cortas.")
        self._claves = {version: clave.encode("utf-8") for version, clave in claves.items()}
        self._actual = version_actual

    def _calcular(self, valor_normalizado: str, version: int) -> Seudonimo:
        digesto = hmac.new(self._claves[version], valor_normalizado.encode("utf-8"), hashlib.sha256)
        return Seudonimo(version, digesto.hexdigest())

    def actual(self, valor_normalizado: str) -> Seudonimo:
        """Pa crear un caso nuevo: siempre con la versión vigente."""
        return self._calcular(valor_normalizado, self._actual)

    def todos(self, valor_normalizado: str) -> list[Seudonimo]:
        """Pa buscar: uno por cada versión de clave, la vigente primero."""
        versiones = [self._actual, *sorted(v for v in self._claves if v != self._actual)]
        return [self._calcular(valor_normalizado, v) for v in versiones]
