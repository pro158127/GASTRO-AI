"""ConstructorReporte (patrón Builder): arma el PDF del reporte de resultados (RF-H02).

Sigue el diseño R-01 / R-02 de Figma:

- **Un análisis (R-01):** recuadro «Análisis experimental», Trazabilidad, Imagen y mapa de
  calor, Características frente al umbral, Explicación y Valoración profesional.
- **Varios (R-02):** una hoja de resumen (código, fecha, característica principal,
  probabilidad, valoración y la página donde empieza) y después cada análisis con el
  formato R-01, cada uno desde una página nueva.
- **En todas las páginas:** logo, título y «Generado el … por …» arriba; el aviso de
  herramienta experimental y «Página X de N» abajo (RF-R04 CA 4, RNF-22). El total de
  páginas y las páginas del resumen salen de una primera pasada de maquetación.

Nada que identifique al paciente: ni el documento ni el seudónimo (RNF-04). El servicio le
pasa los datos ya listos (`DatosAnalisisReporte`, sin ORM).
"""

import io
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas.analisis import AVISO_EXPERIMENTAL
from app.services.analisis import ZONA_COLOMBIA
from app.services.logo_pdf import isotipo, palabra

# ------------------------------------------------------------------ estilo (Figma R-01)

AZUL = colors.HexColor("#1A3757")
TEXTO = colors.HexColor("#1F2937")
GRIS = colors.HexColor("#4B5563")
LINEA = colors.HexColor("#E5E7EB")
FONDO_IMAGEN = colors.HexColor("#F3F4F6")
AMBAR_FONDO = colors.HexColor("#FEF3C7")
AMBAR_BORDE = colors.HexColor("#B45309")
AMBAR_TEXTO = colors.HexColor("#9A3412")

PIE = (
    "Gastro-AI · Herramienta académica y experimental. No es un dispositivo médico ni emite "
    "diagnósticos; requiere la interpretación de un profesional de la salud."
)
NOTA_MULTIETIQUETA = "Clasificación multietiqueta: las probabilidades no suman 100 %."
PACIENTE = "No se incluye: el sistema no guarda la cédula (RNF-04)"
VALORACIONES = {
    "COINCIDE": "Coincide",
    "NO_COINCIDE": "No coincide",
    "NO_CONCLUYENTE": "No concluyente",
}
EXPLICACION_LISTA = "GENERADA"
ALTO_ISOTIPO = 0.95 * cm
ALTO_PALABRA = 0.36 * cm
MARGEN = 1.6 * cm

_E = {
    "seccion": ParagraphStyle(
        "seccion",
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=14,
        textColor=AZUL,
        spaceBefore=14,
        spaceAfter=6,
    ),
    "normal": ParagraphStyle(
        "normal", fontName="Helvetica", fontSize=10, leading=14.5, textColor=TEXTO
    ),
    "clave": ParagraphStyle(
        "clave", fontName="Helvetica", fontSize=10, leading=14, textColor=TEXTO
    ),
    "cabecera": ParagraphStyle(
        "cabecera", fontName="Helvetica-Bold", fontSize=10, leading=14, textColor=TEXTO
    ),
    "nota": ParagraphStyle("nota", fontName="Helvetica", fontSize=8.5, leading=12, textColor=GRIS),
    "aviso_titulo": ParagraphStyle(
        "aviso_titulo",
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=15,
        textColor=AMBAR_TEXTO,
    ),
    "aviso": ParagraphStyle(
        "aviso", fontName="Helvetica", fontSize=10, leading=14, textColor=AMBAR_TEXTO
    ),
}


# ------------------------------------------------------------------ datos de entrada


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
    modelo: str  # «repositorio · revisión 3f9c2ab»
    caracteristicas: list[FilaCaracteristica]  # de la más probable a la menos
    regiones: list[FilaRegion] = field(default_factory=list)
    explicacion_estado: str | None = None
    explicacion_texto: str | None = None
    observaciones: list[FilaObservacion] = field(default_factory=list)
    imagen: bytes | None = None  # la endoscopia ya sin EXIF (anonimizada)
    mapa_calor: bytes | None = None  # el Grad-CAM de la característica más probable
    trasladado_de: str | None = None  # si llegó por traslado, quién lo hizo (RF-A07)


# ------------------------------------------------------------------ formatos


def _fecha(valor: datetime) -> str:
    return valor.astimezone(ZONA_COLOMBIA).strftime("%d/%m/%Y %H:%M")


def _dia(valor: datetime) -> str:
    return valor.astimezone(ZONA_COLOMBIA).strftime("%d/%m/%Y")


def _porcentaje(valor: Decimal) -> str:
    return f"{round(float(valor) * 100)} %"


def _area(valor: Decimal) -> str:
    return f"{float(valor):.1f} %".replace(".", ",")


def _texto(valor: str) -> str:
    """Escapa lo que reportlab interpretaría como etiquetas (<, >, &)."""
    return valor.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _p(texto: str, estilo: str = "normal") -> Paragraph:
    return Paragraph(texto, _E[estilo])


# ------------------------------------------------------------------ piezas del diseño


class _Matraz(Flowable):
    """El ícono del matraz del recuadro experimental."""

    def __init__(self, lado: float = 0.55 * cm) -> None:
        super().__init__()
        self.width = self.height = lado

    def draw(self) -> None:
        c, s = self.canv, self.width
        c.saveState()
        c.setStrokeColor(AMBAR_BORDE)
        c.setLineWidth(1.4)
        c.setLineJoin(1)
        camino = c.beginPath()
        camino.moveTo(s * 0.38, s * 0.95)
        camino.lineTo(s * 0.38, s * 0.62)
        camino.lineTo(s * 0.08, s * 0.1)
        camino.lineTo(s * 0.92, s * 0.1)
        camino.lineTo(s * 0.62, s * 0.62)
        camino.lineTo(s * 0.62, s * 0.95)
        c.drawPath(camino, stroke=1, fill=0)
        c.line(s * 0.28, s * 0.95, s * 0.72, s * 0.95)
        c.line(s * 0.22, s * 0.34, s * 0.78, s * 0.34)
        c.restoreState()


class _Imagen(Flowable):
    """Un recuadro gris redondeado con la imagen adentro (centrada y sin deformar)."""

    def __init__(self, datos: bytes | None, ancho: float, alto: float) -> None:
        super().__init__()
        self.width, self.height = ancho, alto
        try:
            self._imagen = ImageReader(io.BytesIO(datos)) if datos else None
            if self._imagen is not None:
                self._imagen.getSize()
        except Exception:  # noqa: BLE001  imagen dañada: va el recuadro vacío, no se cae el PDF
            self._imagen = None

    def draw(self) -> None:
        c = self.canv
        c.saveState()
        c.setFillColor(FONDO_IMAGEN)
        c.roundRect(0, 0, self.width, self.height, 6, stroke=0, fill=1)
        if self._imagen is not None:
            ancho, alto = self._imagen.getSize()
            escala = min((self.width - 8) / ancho, (self.height - 8) / alto)
            w, h = ancho * escala, alto * escala
            c.drawImage(
                self._imagen, (self.width - w) / 2, (self.height - h) / 2, w, h, mask="auto"
            )
        else:
            c.setFillColor(GRIS)
            c.setFont("Helvetica", 8.5)
            c.drawCentredString(self.width / 2, self.height / 2, "Imagen no disponible")
        c.restoreState()


class _Titulo(Flowable):
    """Marca invisible: desde aquí el encabezado usa este título (y anota la página)."""

    def __init__(self, titulo: str, clave: str | None = None) -> None:
        super().__init__()
        self.titulo, self.clave = titulo, clave
        self.width = self.height = 0

    def draw(self) -> None:
        self.canv.marcar_titulo(self.titulo, self.clave)


def _aviso_experimental(ancho: float) -> Table:
    texto = [
        _p(AVISO_EXPERIMENTAL["etiqueta"], "aviso_titulo"),
        _p(AVISO_EXPERIMENTAL["texto"], "aviso"),
    ]
    tabla = Table([[_Matraz(), texto]], colWidths=[1.1 * cm, ancho - 1.1 * cm])
    tabla.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), AMBAR_FONDO),
                ("BOX", (0, 0), (-1, -1), 0.8, AMBAR_BORDE),
                ("ROUNDEDCORNERS", [6, 6, 6, 6]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, 0), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return tabla


def _filas(filas: list[list], anchos: list[float], cabecera: bool = False) -> Table:
    """Tabla del diseño: sin bordes, con una línea gris entre filas."""
    tabla = Table(filas, colWidths=anchos)
    estilo = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -1), 0.6, LINEA),
    ]
    if not cabecera:
        estilo.append(("LINEABOVE", (0, 0), (-1, 0), 0.6, LINEA))
    tabla.setStyle(TableStyle(estilo))
    return tabla


# ------------------------------------------------------------------ lienzo con «Página X de N»


def _lienzo(generado_por: str, generado_en: datetime) -> type[Canvas]:
    """Lienzo que guarda cada página y al final pinta encabezado y pie, ya con el total."""

    class _Lienzo(Canvas):
        paginas_de: dict[str, int] = {}  # código de análisis → página donde empieza

        def __init__(self, *args, **kwargs) -> None:
            super().__init__(*args, **kwargs)
            self._paginas: list[dict] = []
            self._titulo, self._nuevo = "", False

        def marcar_titulo(self, titulo: str, clave: str | None) -> None:
            self._titulo, self._nuevo = titulo, True
            if clave:
                type(self).paginas_de[clave] = self.getPageNumber()

        def showPage(self) -> None:  # noqa: N802  (nombre de reportlab)
            titulo = self._titulo if self._nuevo else f"{self._titulo} (continuación)"
            self._paginas.append({**self.__dict__, "_titulo_pagina": titulo})
            self._nuevo = False
            self._startPage()

        def save(self) -> None:
            total = len(self._paginas)
            for estado in self._paginas:
                titulo = estado.pop("_titulo_pagina")
                self.__dict__.update(estado)
                _marco(self, titulo, generado_por, generado_en, total)
                super().showPage()
            super().save()

    return _Lienzo


def _marco(c: Canvas, titulo: str, generado_por: str, generado_en: datetime, total: int) -> None:
    ancho, alto = A4
    c.saveState()
    # Encabezado: logo a la izquierda, título y «Generado el…» a la derecha
    base = alto - 1.2 * cm - ALTO_ISOTIPO
    ancho_isotipo = isotipo().dibujar(c, MARGEN, base, ALTO_ISOTIPO)
    palabra().dibujar(
        c,
        MARGEN + ancho_isotipo + 0.2 * cm,
        base + (ALTO_ISOTIPO - ALTO_PALABRA) / 2,
        ALTO_PALABRA,
    )
    c.setFillColor(TEXTO)
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(ancho - MARGEN, base + 0.45 * cm, titulo)
    c.setFillColor(GRIS)
    c.setFont("Helvetica", 8.5)
    c.drawRightString(
        ancho - MARGEN, base - 0.1 * cm, f"Generado el {_fecha(generado_en)} por {generado_por}"
    )
    # Pie: línea, aviso de herramienta experimental y número de página
    c.setStrokeColor(LINEA)
    c.setLineWidth(0.6)
    c.line(MARGEN, 2.0 * cm, ancho - MARGEN, 2.0 * cm)
    c.setFont("Helvetica", 8)
    c.setFillColor(GRIS)
    for i, renglon in enumerate(simpleSplit(PIE, "Helvetica", 8, ancho - 2 * MARGEN - 3 * cm)):
        c.drawString(MARGEN, 1.5 * cm - i * 10.5, renglon)
    c.drawRightString(ancho - MARGEN, 1.5 * cm, f"Página {c.getPageNumber()} de {total}")
    c.restoreState()


# ------------------------------------------------------------------ el constructor


class ConstructorReporte:
    def __init__(self) -> None:
        self._analisis: list[DatosAnalisisReporte] = []
        self._generado_por = ""
        self._generado_en = datetime.now(ZONA_COLOMBIA)
        self._de_paciente = False

    def encabezado(
        self, generado_por: str, generado_en: datetime, cantidad: int, de_paciente: bool = False
    ) -> "ConstructorReporte":
        """`de_paciente`: el reporte salió de «Descargar reporte de este paciente» (R-02)."""
        self._generado_por = generado_por
        self._generado_en = generado_en
        self._de_paciente = de_paciente
        return self

    def analisis(self, datos: DatosAnalisisReporte) -> "ConstructorReporte":
        self._analisis.append(datos)
        return self

    def construir(self) -> bytes:
        if not self._analisis:
            raise ValueError("Un reporte necesita al menos un análisis.")
        # Primera pasada solo pa saber en qué página empieza cada análisis (tabla del resumen)
        paginas = self._maquetar({})
        return self._maquetar(paginas, final=True)

    # -------------------------------------------------------------- internos

    def _maquetar(self, paginas: dict[str, int], final: bool = False):
        salida = io.BytesIO()
        documento = SimpleDocTemplate(
            salida,
            pagesize=A4,
            leftMargin=MARGEN,
            rightMargin=MARGEN,
            topMargin=3.0 * cm,
            bottomMargin=2.5 * cm,
            title="Reporte de resultados · Gastro-AI",
            author="Gastro-AI",
            subject=AVISO_EXPERIMENTAL["etiqueta"],
        )
        lienzo = _lienzo(self._generado_por, self._generado_en)
        lienzo.paginas_de = {}
        documento.build(self._bloques(documento.width, paginas), canvasmaker=lienzo)
        return salida.getvalue() if final else dict(lienzo.paginas_de)

    def _bloques(self, ancho: float, paginas: dict[str, int]) -> list:
        varios = len(self._analisis) > 1
        bloques: list = []
        if varios:
            bloques.append(_Titulo(f"Reporte de {len(self._analisis)} análisis"))
            bloques.append(_aviso_experimental(ancho))
            bloques += self._resumen(ancho, paginas)
        for datos in self._analisis:
            if varios:
                bloques.append(PageBreak())
            bloques.append(_Titulo(f"Reporte de análisis {datos.codigo}", datos.codigo))
            bloques.append(_aviso_experimental(ancho))
            bloques += self._detalle(datos, ancho)
        return bloques

    def _resumen(self, ancho: float, paginas: dict[str, int]) -> list:
        if self._de_paciente:
            titulo = "Resumen de los análisis de este paciente"
            explicacion = (
                "Todos los análisis de este paciente que usted puede ver (propios o recibidos "
                "por traslado), generado con «Descargar reporte de este paciente» en Historial. "
            )
        else:
            titulo = "Resumen de los análisis seleccionados"
            explicacion = "Los análisis que usted eligió. "
        explicacion += "El detalle de cada análisis sigue en las páginas siguientes."
        nombres = (
            "ID de análisis",
            "Fecha",
            "Característica principal",
            "Prob.",
            "Valoración",
            "Pág.",
        )
        filas = [[_p(t, "cabecera") for t in nombres]]
        for d in self._analisis:
            principal = d.caracteristicas[0] if d.caracteristicas else None
            nombre = _texto(principal.nombre) if principal else "—"
            if d.trasladado_de:
                nombre += f" · trasladado de {_texto(d.trasladado_de)}"
            ultima = d.observaciones[-1].valoracion if d.observaciones else None
            filas.append(
                [
                    _p(d.codigo, "clave"),
                    _p(_dia(d.solicitado_en), "clave"),
                    _p(nombre, "clave"),
                    _p(_porcentaje(principal.probabilidad) if principal else "—", "clave"),
                    _p(VALORACIONES.get(ultima, "—"), "clave"),
                    _p(str(paginas.get(d.codigo, "")), "clave"),
                ]
            )
        modelos = {d.modelo for d in self._analisis}
        nota = (
            f"Modelo usado en los {len(self._analisis)} análisis: {_texto(modelos.pop())}."
            if len(modelos) == 1
            else "Los análisis usaron distintas revisiones del modelo; cada página indica la suya."
        )
        fijas = [3.4 * cm, 2.3 * cm, 1.6 * cm, 2.5 * cm, 1.1 * cm]
        anchos = fijas[:2] + [ancho - sum(fijas)] + fijas[2:]
        return [
            _p(titulo, "seccion"),
            _p(explicacion),
            Spacer(1, 8),
            _filas(filas, anchos, cabecera=True),
            Spacer(1, 6),
            _p(nota, "nota"),
        ]

    def _detalle(self, d: DatosAnalisisReporte, ancho: float) -> list:
        clave, valor = 5.2 * cm, ancho - 5.2 * cm
        bloques: list = [
            _p("Trazabilidad (RNF-24, RNF-25)", "seccion"),
            _filas(
                [
                    [_p("ID de análisis", "clave"), _p(d.codigo, "clave")],
                    [_p("Fecha del análisis", "clave"), _p(_fecha(d.solicitado_en), "clave")],
                    [_p("Realizado por", "clave"), _p(_texto(d.realizado_por), "clave")],
                    [_p("Modelo", "clave"), _p(_texto(d.modelo), "clave")],
                    [_p("Paciente", "clave"), _p(PACIENTE, "clave")],
                ],
                [clave, valor],
            ),
        ]
        bloques.append(KeepTogether(self._visual(d, ancho)))
        bloques.append(KeepTogether(self._caracteristicas(d, ancho)))

        bloques.append(_p("Explicación en lenguaje natural (RF-R05)", "seccion"))
        if d.explicacion_estado == EXPLICACION_LISTA and d.explicacion_texto:
            bloques.append(_p(_texto(d.explicacion_texto)))
        else:
            bloques.append(_p("La explicación no está disponible para este análisis.", "nota"))

        bloques.append(_p("Valoración profesional (RF-D04)", "seccion"))
        if not d.observaciones:
            bloques.append(_p("Sin valoración registrada.", "nota"))
        for o in d.observaciones:
            filas = [
                [
                    _p("Valoración", "clave"),
                    _p(VALORACIONES.get(o.valoracion, o.valoracion), "clave"),
                ]
            ]
            if o.texto:
                filas.append([_p("Observación", "clave"), _p(f"«{_texto(o.texto)}»", "clave")])
            registro = f"{_texto(o.autor)} · {_fecha(o.registrada_en)}"
            filas.append([_p("Registrada por", "clave"), _p(registro, "clave")])
            bloques += [_filas(filas, [clave, valor]), Spacer(1, 8)]
        return bloques

    def _visual(self, d: DatosAnalisisReporte, ancho: float) -> list:
        """Imagen y mapa de calor lado a lado, y la línea de cada región (formato RF-P04)."""
        mitad = (ancho - 0.5 * cm) / 2
        imagenes = Table(
            [
                [_Imagen(d.imagen, mitad, 5.6 * cm), _Imagen(d.mapa_calor, mitad, 5.6 * cm)],
                [
                    _p("Imagen analizada (anonimizada)", "nota"),
                    _p("Mapa de calor Grad-CAM", "nota"),
                ],
            ],
            colWidths=[mitad + 0.25 * cm, mitad + 0.25 * cm],
        )
        imagenes.setStyle(
            TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 1), (-1, 1), 3)])
        )
        bloques = [_p("Imagen y explicación visual (RF-R03, RF-P04)", "seccion"), imagenes]
        bloques.append(Spacer(1, 4))
        for r in d.regiones:
            bloques.append(
                _p(
                    f"Región de interés: Región {r.orden} ({_texto(r.caracteristica)}) · "
                    f"Confianza del modelo: {_porcentaje(r.confianza)} · Área analizada: "
                    f"{_area(r.area_porcentaje)} de la imagen."
                )
            )
        if not d.regiones:
            bloques.append(_p("El modelo no señaló regiones de interés en esta imagen."))
        return bloques

    def _caracteristicas(self, d: DatosAnalisisReporte, ancho: float) -> list:
        umbrales = {c.umbral for c in d.caracteristicas}
        un_umbral = len(umbrales) == 1
        cabecera = (
            f"Frente al umbral ({_porcentaje(umbrales.pop())})" if un_umbral else "Frente al umbral"
        )
        filas = [
            [
                _p("Característica", "cabecera"),
                _p("Probabilidad", "cabecera"),
                _p(cabecera, "cabecera"),
            ]
        ]
        for c in d.caracteristicas:
            estado = "Supera el umbral" if c.supera else "Bajo el umbral"
            if not un_umbral:  # cada característica con su propio umbral (RF-A01)
                estado += f" ({_porcentaje(c.umbral)})"
            filas.append(
                [
                    _p(_texto(c.nombre), "clave"),
                    _p(_porcentaje(c.probabilidad), "clave"),
                    _p(estado, "clave"),
                ]
            )
        if not d.caracteristicas:
            filas.append([_p("Sin resultados", "clave"), _p("—", "clave"), _p("—", "clave")])
        notas = [NOTA_MULTIETIQUETA]
        if d.caracteristicas and not any(c.supera for c in d.caracteristicas):
            notas.insert(0, "Ninguna característica supera el umbral configurado.")
        return [
            _p("Características identificadas (RF-R01, RF-R02)", "seccion"),
            _filas(filas, [ancho - 3.0 * cm - 4.6 * cm, 3.0 * cm, 4.6 * cm], cabecera=True),
            Spacer(1, 5),
            _p(" ".join(notas), "nota"),
        ]
