"""Formato del reporte de evaluación del modelo (RM-06) que entrega el equipo de ML.

Es lo que lee `scripts/cargar_metricas` y lo que después muestran RF-A05 y RF-DB02:

    {
      "repositorio_hf": "ragnartech/gastro-ai",
      "revision_sha": "<commit de 40 caracteres, el mismo del modelo desplegado>",
      "fecha_reporte": "2026-11-10",
      "conjunto_prueba": "GastroHUN + EGID, partición de prueba por paciente (n = 412)",
      "macro": {"SENSIBILIDAD": 0.81, "ESPECIFICIDAD": 0.88, "F1": 0.79,
                "ROC_AUC": 0.90, "PR_AUC": 0.85, "BRIER": 0.12, "ECE": 0.05},
      "por_caracteristica": {
        "ATROFIA": {"SENSIBILIDAD": 0.83, "F1": 0.80},
        "GASTRITIS": {"...": 0.0},
        "HPYLORI": {"...": 0.0}
      }
    }

- Las métricas son las de `NombreMetrica`; la que no venga queda vacía (no se inventa).
- Todas van de 0 a 1 y se guardan con 4 decimales.
- Solo números agregados: nada de casos, imágenes ni pacientes (RF-A05 CA 2).
"""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import NombreMetrica

Metricas = dict[NombreMetrica, float]


class ReporteEvaluacion(BaseModel):
    model_config = ConfigDict(extra="forbid")  # un campo mal escrito no se ignora en silencio

    repositorio_hf: str = Field(min_length=1)
    revision_sha: str = Field(pattern=r"^[0-9a-fA-F]{40}$")
    fecha_reporte: date
    conjunto_prueba: str = Field(min_length=1, max_length=200)
    macro: Metricas = Field(min_length=1)
    por_caracteristica: dict[str, Metricas] = {}

    @field_validator("repositorio_hf", "conjunto_prueba")
    @classmethod
    def _sin_espacios_sobrantes(cls, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise ValueError("No puede estar vacío.")
        return valor

    @field_validator("revision_sha")
    @classmethod
    def _minusculas(cls, valor: str) -> str:
        return valor.lower()

    @field_validator("macro")
    @classmethod
    def _rango_macro(cls, valores: Metricas) -> Metricas:
        return _en_rango(valores)

    @field_validator("por_caracteristica")
    @classmethod
    def _rango_por_caracteristica(cls, valores: dict[str, Metricas]) -> dict[str, Metricas]:
        limpio = {}
        for codigo, metricas in valores.items():
            if not metricas:
                raise ValueError(f"{codigo}: no trae ninguna métrica.")
            limpio[codigo.strip().upper()] = _en_rango(metricas)
        return limpio


def _en_rango(valores: Metricas) -> Metricas:
    for nombre, valor in valores.items():
        if not 0 <= valor <= 1:
            raise ValueError(f"{nombre} debe estar entre 0 y 1.")
    return {nombre: round(valor, 4) for nombre, valor in valores.items()}
