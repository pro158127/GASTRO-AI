"""ConstructorReporte (patrón Builder): arma el PDF del reporte de resultados (RF-H02).

El servicio le pasa los datos ya listos (`DatosAnalisisReporte`, sin ORM) y el constructor
los va agregando sección por sección. Reglas que el PDF cumple siempre:

- Solo PDF (RF-H02 CA 3).
- Etiqueta «Análisis experimental» arriba y el aviso completo abajo, en CADA página
  (RF-R04 CA 4, RNF-22).
- Nada que identifique al paciente: ni el documento ni el seudónimo. Los análisis se
  nombran por su código (A-AAAA-NNNNNN).
- Sin imágenes: el reporte lleva características, probabilidades y confianza (lo que pide
  RF-H02), no la endoscopia.
"""

import io
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import simpleSplit
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas.analisis import AVISO_EXPERIMENTAL
from app.services.analisis import ZONA_COLOMBIA

VALORACIONES = {
    "COINCIDE": "Coincide con el resultado",
    "NO_COINCIDE": "No coincide con el resultado",
    "NO_CONCLUYENTE": "No concluyente",
}
EXPLICACION_LISTA = "GENERADA"


@dataclass(frozen=True)
class FilaCaracteristica:
    nombre: str
    probabilidad: Decimal
    umbral: Decimal
    supera: bool


@dataclass(frozen=True)
class FilaRegion:
    orden: int
    caracteristica: str
    confianza: Decimal
    area_porcentaje: Decimal


@dataclass(frozen=True)
class FilaObservacion:
    valoracion: str
    texto: str | None
    autor: str
    registrada_en: datetime


@dataclass(frozen=True)
class DatosAnalisisReporte:
    codigo: str
    solicitado_en: datetime
    realizado_por: str
    modelo: str  # «repositorio @ revisión corta»
    caracteristicas: list[FilaCaracteristica]
    regiones: list[FilaRegion] = field(default_factory=list)
    explicacion_estado: str | None = None
    explicacion_texto: str | None = None
    observaciones: list[FilaObservacion] = field(default_factory=list)


def _fecha(valor: datetime) -> str:
    return valor.astimezone(ZONA_COLOMBIA).strftime("%d/%m/%Y %H:%M")


def _porcentaje(valor: Decimal) -> str:
    return f"{float(valor) * 100:.1f} %".replace(".", ",")


def _area(valor: Decimal) -> str:
    return f"{float(valor):.1f} %".replace(".", ",")


def _texto(valor: str) -> str:
    """Escapa lo que reportlab interpretaría como etiquetas (<, >, &)."""
    return valor.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class ConstructorReporte:
    def __init__(self) -> None:
        estilos = getSampleStyleSheet()
        self._titulo = ParagraphStyle("titulo", parent=estilos["Title"], fontSize=18)
        self._seccion = ParagraphStyle("seccion", parent=estilos["Heading2"], spaceBefore=12)
        self._subtitulo = ParagraphStyle("subtitulo", parent=estilos["Heading4"])
        self._normal = ParagraphStyle("normal", parent=estilos["BodyText"], fontSize=9.5)
        self._etiqueta = ParagraphStyle(
            "etiqueta",
            parent=estilos["BodyText"],
            alignment=TA_CENTER,
            textColor=colors.HexColor("#8a4b00"),
            backColor=colors.HexColor("#fff4e0"),
            borderPadding=6,
        )
        self._bloques: list = []
        self._analisis = 0

    def encabezado(
        self, generado_por: str, generado_en: datetime, cantidad: int
    ) -> "ConstructorReporte":
        self._bloques += [
            Paragraph("Reporte de resultados · Gastro-AI", self._titulo),
            Paragraph(
                f"<b>{AVISO_EXPERIMENTAL['etiqueta']}.</b> {AVISO_EXPERIMENTAL['texto']}",
                self._etiqueta,
            ),
            Spacer(1, 10),
            Paragraph(
                f"Generado el {_fecha(generado_en)} (hora de Colombia) por "
                f"{_texto(generado_por)}. Análisis incluidos: {cantidad}.",
                self._normal,
            ),
        ]
        return self

    def analisis(self, datos: DatosAnalisisReporte) -> "ConstructorReporte":
        self._analisis += 1
        bloque = [
            Paragraph(f"Análisis {datos.codigo}", self._seccion),
            Paragraph(
                f"Solicitado el {_fecha(datos.solicitado_en)} · Realizado por "
                f"{_texto(datos.realizado_por)} · Modelo {_texto(datos.modelo)}",
                self._normal,
            ),
            Spacer(1, 6),
            self._tabla_caracteristicas(datos.caracteristicas),
        ]
        if datos.caracteristicas and not any(c.supera for c in datos.caracteristicas):
            bloque.append(
                Paragraph("Ninguna característica supera el umbral configurado.", self._normal)
            )
        self._bloques.append(KeepTogether(bloque))
        if datos.regiones:
            self._bloques.append(Paragraph("Regiones de interés", self._subtitulo))
            for r in datos.regiones:
                self._bloques.append(
                    Paragraph(
                        f"Región {r.orden} ({_texto(r.caracteristica)}): confianza del modelo "
                        f"{_porcentaje(r.confianza)}, área analizada {_area(r.area_porcentaje)} "
                        "de la imagen.",
                        self._normal,
                    )
                )
        if datos.explicacion_estado == EXPLICACION_LISTA and datos.explicacion_texto:
            self._bloques += [
                Paragraph("Explicación generada por IA (experimental)", self._subtitulo),
                Paragraph(_texto(datos.explicacion_texto), self._normal),
            ]
        if datos.observaciones:
            self._bloques.append(Paragraph("Observaciones profesionales", self._subtitulo))
            for o in datos.observaciones:
                comentario = f": {_texto(o.texto)}" if o.texto else ""
                self._bloques.append(
                    Paragraph(
                        f"<b>{VALORACIONES.get(o.valoracion, o.valoracion)}</b>{comentario} "
                        f"<i>({_texto(o.autor)}, {_fecha(o.registrada_en)})</i>",
                        self._normal,
                    )
                )
        return self

    def construir(self) -> bytes:
        if not self._analisis:
            raise ValueError("Un reporte necesita al menos un análisis.")
        salida = io.BytesIO()
        documento = SimpleDocTemplate(
            salida,
            pagesize=LETTER,
            topMargin=2.2 * cm,
            bottomMargin=2.4 * cm,
            title="Reporte de resultados · Gastro-AI",
            author="Gastro-AI",
            subject=AVISO_EXPERIMENTAL["etiqueta"],
        )
        documento.build(self._bloques, onFirstPage=_marco, onLaterPages=_marco)
        return salida.getvalue()

    def _tabla_caracteristicas(self, filas: list[FilaCaracteristica]) -> Table:
        datos = [["Característica", "Probabilidad", "Umbral aplicado", "¿Supera el umbral?"]]
        datos += [
            [
                c.nombre,
                _porcentaje(c.probabilidad),
                _porcentaje(c.umbral),
                "Sí" if c.supera else "No",
            ]
            for c in filas
        ] or [["Sin resultados", "—", "—", "—"]]
        tabla = Table(datos, colWidths=[6 * cm, 3.2 * cm, 3.4 * cm, 3.8 * cm])
        tabla.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef5")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#b8c4d0")),
                    ("ALIGN", (1, 1), (-1, -1), "CENTER"),
                ]
            )
        )
        return tabla


def _marco(lienzo, documento) -> None:
    """Etiqueta arriba y aviso completo abajo en todas las páginas (RF-R04 CA 4)."""
    ancho, alto = documento.pagesize
    lienzo.saveState()
    lienzo.setFont("Helvetica-Bold", 9)
    lienzo.setFillColor(colors.HexColor("#8a4b00"))
    lienzo.drawString(documento.leftMargin, alto - 1.3 * cm, AVISO_EXPERIMENTAL["etiqueta"].upper())
    lienzo.setFont("Helvetica", 7.5)
    lienzo.setFillColor(colors.HexColor("#444444"))
    renglones = simpleSplit(AVISO_EXPERIMENTAL["texto"], "Helvetica", 7.5, documento.width)
    for i, renglon in enumerate(renglones):
        lienzo.drawString(documento.leftMargin, 1.6 * cm - i * 9, renglon)
    lienzo.drawRightString(ancho - documento.rightMargin, 0.8 * cm, f"Página {documento.page}")
    lienzo.restoreState()
