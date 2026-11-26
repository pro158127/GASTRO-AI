"""RF-R04 #108: el aviso contractual se dibuja en cada página de un PDF real sintético."""

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal

from reportlab.pdfgen.canvas import Canvas

from app.schemas.analisis import AVISO_EXPERIMENTAL
from app.services.constructor_reporte import (
    ConstructorReporte,
    DatosAnalisisReporte,
    FilaCaracteristica,
)

AHORA = datetime(2026, 11, 24, 12, tzinfo=UTC)


def _datos(codigo: str) -> DatosAnalisisReporte:
    return DatosAnalisisReporte(
        codigo=codigo,
        solicitado_en=AHORA,
        realizado_por="Doctora Sintética",
        modelo="modelo-sintetico · revisión abc1234",
        caracteristicas=[
            FilaCaracteristica("Atrofia", Decimal("0.81"), Decimal("0.70"), True)
        ],
    )


def test_pdf_real_de_varios_analisis_pinta_aviso_completo_en_todas_las_paginas(monkeypatch):
    trazos = defaultdict(lambda: defaultdict(list))
    original = Canvas.drawString

    def registrar(self, x, y, texto, *args, **kwargs):
        trazos[self][self.getPageNumber()].append(texto)
        return original(self, x, y, texto, *args, **kwargs)

    monkeypatch.setattr(Canvas, "drawString", registrar)
    pdf = (
        ConstructorReporte()
        .encabezado("Doctora Sintética", AHORA, 2)
        .analisis(_datos("A-2026-0041"))
        .analisis(_datos("A-2026-0042"))
        .construir()
    )

    assert pdf.startswith(b"%PDF-") and len(pdf) > 1000
    assert len(trazos) == 2  # primera pasada y PDF definitivo
    for paginas in trazos.values():
        assert len(paginas) >= 3  # resumen y dos análisis
        assert sorted(paginas) == list(range(1, len(paginas) + 1))
        for textos in paginas.values():
            assert AVISO_EXPERIMENTAL["etiqueta"] in textos
            contenido = " ".join(textos)
            assert AVISO_EXPERIMENTAL["texto"] in contenido
