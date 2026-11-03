from app.config import settings


class LLMAdapter:
    """Adapter for the external LLM provider (e.g. Gemini).

    The worker must NEVER send the original image to this service: only a
    JSON payload with the probabilities and the region of interest (ROI).
    """

    def generar_explicacion(self, resultado: dict) -> str:
        # Stub: real implementation performs an HTTPS call to settings.llm_api_url
        # using settings.llm_api_key, sending only the JSON payload.
        clases = ", ".join(resultado.get("clases", []))
        confianza = resultado.get("confianza_global", 0.0)
        return (
            f"Análisis completado. Se detectaron: {clases}. "
            f"Confianza global del {confianza:.2%}. "
            "Este resultado es experimental y no sustituye el diagnóstico clínico."
        )


llm_adapter = LLMAdapter()
