"""El enchufe con Gemini (patrón Adaptador, RF-R05).

El resto del sistema solo conoce `ServicioExplicacion` y ni se entera de que existe Gemini.
Todas las mañas del SDK google-genai (campos raros, errores, timeouts) se quedan encerradas
aquí, así el día que cambiemos de proveedor solo se toca este archivo y ya, nada de andar
persiguiendo imports por todo el proyecto.
"""

import json
from typing import Any, Protocol

from google import genai
from google.genai import types
from pydantic import BaseModel

from app.core.config import Settings

# Lista negra: la imagen y los mapas de calor NUNCA salen pa'l LLM (RF-R05). Si alguien
# quita algo de aquí, que se lo explique al profe, porque yo no me hago responsable.
CLAVES_PROHIBIDAS = frozenset(
    {"imagen", "mapa_calor", "mapa_calor_base64", "mapa_calor_clave_objeto"}
)

INSTRUCCIONES = (
    "Eres un asistente que explica, en español claro y sin tecnicismos, el resultado de un "
    "modelo experimental de análisis de imágenes endoscópicas gástricas a un gastroenterólogo. "
    "Recibirás un JSON con las características evaluadas, su probabilidad (0 a 1) y las regiones "
    "de interés (coordenadas normalizadas y porcentaje del área analizada). "
    "Explica los porcentajes exactos, la región de interés y el nivel de confianza. "
    "Menciona solo las características y regiones que aparecen en el JSON: no inventes hallazgos "
    "ni sugieras diagnósticos ni tratamientos. Recuerda que es una valoración preventiva "
    "probabilística experimental que no sustituye el juicio profesional. "
    'Responde únicamente con un JSON de la forma {"texto": "..."}.'
)


class ErrorProveedorLLM(Exception):
    """Gemini se cayó, se tardó o contestó cualquier cosa.

    El mensaje es genérico a propósito (CWE-209): al usuario no le soltamos la traza ni de
    chiste. Si quieres el chisme completo de qué pasó, está en __cause__.
    """


class ServicioExplicacion(Protocol):
    """El contrato: me das el resumen, te devuelvo el textico. Con esto el resto vive feliz."""

    def explicar(self, resumen: dict[str, Any]) -> str: ...


class _RespuestaExplicacion(BaseModel):
    texto: str


def verificar_sin_imagen(dato: Any) -> None:
    """Le pasa el escáner al resumen, hasta lo más anidado, buscando imágenes colgadas.

    Si encuentra una clave prohibida o bytes sueltos, truena con ValueError antes de que
    algo salga del servidor. Es recursivo, así que no hay forma de esconderle nada.
    """
    if isinstance(dato, (bytes, bytearray, memoryview)):
        raise ValueError("El resumen para el LLM no puede contener datos binarios.")
    if isinstance(dato, dict):
        for clave, valor in dato.items():
            if clave in CLAVES_PROHIBIDAS:
                raise ValueError("La imagen o el mapa de calor no pueden enviarse al LLM.")
            verificar_sin_imagen(valor)
    elif isinstance(dato, (list, tuple)):
        for valor in dato:
            verificar_sin_imagen(valor)


class AdaptadorProveedorLLM:
    """Le pide a Gemini que explique el resultado, mandándole SOLO probabilidades y regiones.

    Le exigimos responder en JSON con esquema, porque si lo dejas libre te contesta con
    poemas y markdown. Temperatura baja pa que no se ponga creativo con datos clínicos.
    """

    def __init__(self, cliente: genai.Client, modelo: str) -> None:
        self._cliente = cliente
        self._modelo = modelo
        self._config = types.GenerateContentConfig(
            system_instruction=INSTRUCCIONES,
            response_mime_type="application/json",
            response_schema=_RespuestaExplicacion,
            temperature=0.2,
        )

    def explicar(self, resumen: dict[str, Any]) -> str:
        verificar_sin_imagen(resumen)
        contenido = json.dumps(resumen, ensure_ascii=False)
        try:
            respuesta = self._cliente.models.generate_content(
                model=self._modelo, contents=contenido, config=self._config
            )
            texto = _RespuestaExplicacion.model_validate_json(respuesta.text or "").texto.strip()
        except Exception as error:  # timeout, red, berrinche del SDK o JSON chueco: todo igual
            raise ErrorProveedorLLM("La explicación no está disponible.") from error
        if not texto:
            raise ErrorProveedorLLM("La explicación no está disponible.")
        return texto


def crear_adaptador_llm(settings: Settings) -> AdaptadorProveedorLLM:
    """Arma el adaptador de verdad con lo que diga el .env (modelo, llave y timeout)."""
    if settings.llm_proveedor.lower() != "gemini":
        raise ValueError(f"Proveedor de LLM no soportado: {settings.llm_proveedor}")
    cliente = genai.Client(
        api_key=settings.llm_api_key.get_secret_value(),
        http_options=types.HttpOptions(
            timeout=int(settings.llm_timeout_seconds * 1000),  # ojo: el SDK va en milisegundos
            # Cero reintentos automáticos: con 5 intentos nos volamos los 15 s sin darnos
            # cuenta. Si el doctor quiere reintentar, pa eso está ANA-04 (botón del front).
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )
    return AdaptadorProveedorLLM(cliente, settings.llm_modelo)
