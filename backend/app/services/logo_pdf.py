"""El logo de Gastro-AI dibujado en el PDF, sin librerías de SVG.

Los SVG (`app/assets/`, copiados tal cual de `frontend/src/assets/`) solo usan trazos
absolutos M, L, H, V, C y Z con relleno par-impar (`fill-rule="evenodd"`). Con eso basta
un traductor chiquito al lienzo de reportlab: se dibuja en vectores, así se ve nítido a
cualquier zoom y el PDF casi no crece. Si el equipo de diseño cambia el logo por uno con
otros comandos, `Logo.cargar` lo rechaza en vez de dibujarlo mal.
"""

import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from reportlab.lib import colors

CARPETA = Path(__file__).resolve().parent.parent / "assets"
ISOTIPO = CARPETA / "logo-isotipo.svg"
PALABRA = CARPETA / "logo-palabra.svg"

_ETIQUETA_PATH = re.compile(r"<path\b[^>]*>", re.S)
_ATRIBUTO = re.compile(r'([\w-]+)="([^"]*)"')
# Cualquier letra cuenta como comando (pa poder rechazar los que no se soportan); la «e»
# de un número como 8.04e-07 no se confunde porque el número la consume antes
_TOKEN = re.compile(r"[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
COMANDOS = set("MLHVCZ")
# Cuántos números lleva cada comando
ARGUMENTOS = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "Z": 0}


@dataclass(frozen=True)
class Trazo:
    color: str
    comandos: tuple[tuple[str, tuple[float, ...]], ...]


@dataclass(frozen=True)
class Logo:
    ancho: float
    alto: float
    trazos: tuple[Trazo, ...]

    @classmethod
    def cargar(cls, ruta: Path) -> "Logo":
        svg = ruta.read_text(encoding="utf-8")
        caja = re.search(r'viewBox="([^"]+)"', svg)
        _, _, ancho, alto = (float(v) for v in caja.group(1).split())
        trazos = []
        for etiqueta in _ETIQUETA_PATH.findall(svg):
            atributos = dict(_ATRIBUTO.findall(etiqueta))
            if atributos.get("fill", "none") == "none":
                continue
            trazos.append(Trazo(atributos["fill"], _comandos(atributos["d"])))
        return cls(ancho, alto, tuple(trazos))

    def dibujar(self, lienzo, x: float, y: float, alto: float) -> float:
        """Dibuja el logo con la esquina inferior izquierda en (x, y). Devuelve el ancho."""
        escala = alto / self.alto
        lienzo.saveState()
        # El SVG tiene el eje Y hacia abajo y el PDF hacia arriba: se voltea
        lienzo.translate(x, y + alto)
        lienzo.scale(escala, -escala)
        for trazo in self.trazos:
            camino = lienzo.beginPath()
            for comando, numeros in trazo.comandos:
                if comando == "M":
                    camino.moveTo(*numeros)
                elif comando == "L":
                    camino.lineTo(*numeros)
                elif comando == "C":
                    camino.curveTo(*numeros)
                elif comando == "Z":
                    camino.close()
            lienzo.setFillColor(colors.HexColor(trazo.color))
            lienzo.drawPath(camino, stroke=0, fill=1, fillMode=0)  # 0 = par-impar
        lienzo.restoreState()
        return self.ancho * escala


def _comandos(d: str) -> tuple[tuple[str, tuple[float, ...]], ...]:
    """«M1 2L3 4H5Z» → (("M", (1, 2)), ("L", (3, 4)), ("L", (5, 4)), ("Z", ())).

    H y V se pasan a L (necesitan el punto anterior); un comando repetido sin letra
    (p. ej. varias curvas seguidas tras una sola «C») se respeta como en SVG.
    """
    tokens = _TOKEN.findall(d)
    salida, comando, actual, inicio, i = [], None, (0.0, 0.0), (0.0, 0.0), 0
    while i < len(tokens):
        if tokens[i].isalpha():
            comando = tokens[i]
            if comando not in COMANDOS:
                raise ValueError(f"El logo usa el comando SVG «{comando}», que no se sabe dibujar.")
            i += 1
            if comando == "Z":
                salida.append(("Z", ()))
                actual = inicio
                continue
        n = ARGUMENTOS[comando]
        numeros = tuple(float(t) for t in tokens[i : i + n])
        i += n
        if comando == "H":
            comando_real, numeros = "L", (numeros[0], actual[1])
        elif comando == "V":
            comando_real, numeros = "L", (actual[0], numeros[0])
        else:
            comando_real = comando
        salida.append((comando_real, numeros))
        actual = numeros[-2:]
        if comando == "M":
            inicio = actual
            comando = "L"  # en SVG, los pares que siguen a un M son líneas
    return tuple(salida)


@cache
def isotipo() -> Logo:
    return Logo.cargar(ISOTIPO)


@cache
def palabra() -> Logo:
    return Logo.cargar(PALABRA)
