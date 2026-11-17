"""Patrón Estrategia pa el umbral de decisión (RF-A01, RF-R01 CA 3).

Dos políticas con la misma cara: umbral global o uno por característica. El worker pide
`umbral_para(codigo)` y no le importa cuál está activa. El umbral que salga se COPIA en
cada resultado (umbral_aplicado), así cambiar la configuración no reescribe análisis
viejos (RF-A01 CA 2).
"""

from decimal import Decimal
from typing import Protocol

MINIMO, MAXIMO = Decimal("0.10"), Decimal("0.90")  # RF-A01: del 10 % al 90 %


def en_rango(valor: Decimal) -> bool:
    return MINIMO <= valor <= MAXIMO


class PoliticaUmbral(Protocol):
    def umbral_para(self, codigo_caracteristica: str) -> Decimal: ...


class UmbralGlobal:
    def __init__(self, valor: Decimal) -> None:
        if not en_rango(valor):
            raise ValueError("El umbral debe estar entre 10 % y 90 %.")
        self._valor = valor

    def umbral_para(self, codigo_caracteristica: str) -> Decimal:
        return self._valor


class UmbralPorCaracteristica:
    """Cada característica con el suyo; si alguna no tiene, cae al global."""

    def __init__(self, valores: dict[str, Decimal | None], respaldo: Decimal) -> None:
        for valor in [*valores.values(), respaldo]:
            if valor is not None and not en_rango(valor):
                raise ValueError("El umbral debe estar entre 10 % y 90 %.")
        self._valores = dict(valores)
        self._respaldo = respaldo

    def umbral_para(self, codigo_caracteristica: str) -> Decimal:
        valor = self._valores.get(codigo_caracteristica)
        return self._respaldo if valor is None else valor


def politica_desde(
    usar_por_caracteristica: bool,
    umbral_global: Decimal,
    por_caracteristica: dict[str, Decimal | None],
) -> PoliticaUmbral:
    if usar_por_caracteristica:
        return UmbralPorCaracteristica(por_caracteristica, umbral_global)
    return UmbralGlobal(umbral_global)


def supera(probabilidad: Decimal, umbral: Decimal) -> bool:
    """«Supera» incluye el igual: 0.50 con umbral 0.50 sí cuenta (diseño de PROC-01)."""
    return probabilidad >= umbral
