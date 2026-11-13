"""Los chequeos del panel de supervisión (RF-A04 CA 1 y 4).

Cada chequeo es una función sin argumentos que termina bien si el servicio responde y lanza
cualquier excepción si no. Todos tienen su propio tiempo máximo (MONITOREO_TIMEOUT_SECONDS),
así que ninguno deja colgado al panel. El servicio que los corre no sabe de httpx, boto3,
smtplib ni Gemini: solo de la lista de `Chequeo`.
"""

from collections.abc import Callable
from dataclasses import dataclass

import httpx
from sqlalchemy import text

from app.adapters.almacen import Almacen
from app.adapters.correo import EnviadorCorreo
from app.adapters.inferencia import crear_inferencia
from app.adapters.llm import crear_adaptador_llm
from app.core.config import Settings
from app.core.database import engine

# Códigos del contrato (§7.4), en el orden en que los pinta W-22
APP_WEB = "APP_WEB"
INFERENCIA_VISION = "INFERENCIA_VISION"
EXPLICACION_LLM = "EXPLICACION_LLM"
BASE_DATOS = "BASE_DATOS"
CORREO = "CORREO"
ALMACENAMIENTO = "ALMACENAMIENTO"


@dataclass(frozen=True)
class Chequeo:
    codigo: str
    nombre: str
    # Lo que devuelva se guarda como dato extra (la inferencia devuelve la revisión del Space)
    probar: Callable[[], object]


def _app_web(url: str, timeout: float) -> Callable[[], None]:
    def probar() -> None:
        # Sin seguir redirecciones; cualquier respuesta que no sea 5xx es que la SPA está en pie
        respuesta = httpx.get(url, timeout=timeout, follow_redirects=False)
        if respuesta.status_code >= 500:
            raise RuntimeError(f"La aplicación web respondió {respuesta.status_code}")

    return probar


def _base_datos(timeout: float) -> None:
    # Conexión propia del pool, no la de la petición: así un chequeo colgado no la estorba
    with engine.connect() as conexion:
        # SET no acepta parámetros enlazados; el valor es un entero nuestro, no del usuario
        conexion.execute(text(f"SET LOCAL statement_timeout = {int(timeout * 1000)}"))
        conexion.execute(text("SELECT 1"))


def _almacen(almacen: Almacen) -> None:
    disponible = getattr(almacen, "disponible", None)
    if disponible is None or not disponible():
        raise RuntimeError("El almacenamiento no responde o falta el bucket")


def armar_chequeos(ajustes: Settings, almacen: Almacen, enviador: EnviadorCorreo) -> list[Chequeo]:
    """Los seis servicios de W-22: los cuatro de RF-A04 CA 4, la app web y el almacenamiento."""
    limite = ajustes.monitoreo_timeout_seconds
    inferencia = crear_inferencia(ajustes, ())  # pa la salud no hacen falta los códigos
    llm = crear_adaptador_llm(ajustes)
    return [
        Chequeo(APP_WEB, "Aplicación web", _app_web(ajustes.monitoreo_app_web_url, limite)),
        Chequeo(
            INFERENCIA_VISION,
            "Servicio de inferencia (modelo de visión)",
            lambda: inferencia.salud(limite),
        ),
        Chequeo(
            EXPLICACION_LLM,
            "Servicio de explicación (modelo de lenguaje)",
            lambda: llm.salud(limite),
        ),
        Chequeo(BASE_DATOS, "Base de datos", lambda: _base_datos(limite)),
        Chequeo(CORREO, "Envío de correo (credenciales)", lambda: enviador.salud(limite)),
        Chequeo(ALMACENAMIENTO, "Almacenamiento de imágenes", lambda: _almacen(almacen)),
    ]
