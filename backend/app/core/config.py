"""Todas las perillas del backend, leídas del .env o de las variables de entorno.

Si algo no arranca, primero revisa que la variable exista; después ya puedes llorar.
Variable nueva = va aquí Y en .env.example, o el siguiente que clone el repo te odia.
"""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Gastro-AI API"
    environment: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:5173"]

    # PostgreSQL: aquí vive todo, trátalo con cariño
    database_url: str = "postgresql+psycopg://gastroia:gastroia_dev@localhost:5432/gastroia"

    # Redis: el mandadero de Celery, por aquí pasan las tareas y sus resultados
    redis_url: str = "redis://localhost:6379/0"

    # MinIO, nuestro S3 hecho en casa. Dentro de Docker el host es «minio», no localhost
    s3_endpoint_url: str = "http://localhost:9000"
    # El que va dentro de las URL firmadas, o sea el que abre el navegador. Vacío = el de arriba.
    # Truco copiado del repo del equipo: sin esto las URL salen con minio:9000 y no abren.
    s3_public_endpoint_url: str = ""
    s3_access_key: str = "gastroia"
    s3_secret_key: str = "gastroia_dev_secret"
    s3_bucket: str = "gastroia-imagenes"
    s3_url_firmada_segundos: int = 300  # 5 min y la URL se vuelve calabaza
    # Cuánto aguanta la imagen en el área temporal (tmp/) entre POST /imagenes y POST /analisis.
    # Además MinIO borra lo de tmp/ al día con una regla de ciclo de vida (init_storage).
    imagen_temporal_minutos: int = 30

    # Llaves del seudónimo (RF-D01, RNF-28). Es un JSON {"versión": "clave"} con TODAS las
    # versiones: si rotas la llave y botas la vieja, los casos viejos se pierden. No, parce.
    hmac_claves: dict[int, SecretStr] = {}
    hmac_version_actual: int = 1

    # Llave AES-256-GCM (32 bytes en Base64) del secreto TOTP (RF-U01). Si la pierdes,
    # todo mundo vuelve a vincular su autenticador y te van a querer muchísimo.
    totp_clave_cifrado: SecretStr = SecretStr("")

    # Space privado de Hugging Face (RF-M01, RNF-29, RNF-30). Todavía nadie nos pasa
    # estos datos, así que por ahora andan vacíos y el worker usa un adaptador falso.
    hf_space_url: str = ""
    hf_token: SecretStr = SecretStr("")
    hf_repo: str = ""
    hf_revision: str = ""  # SHA fijo, nunca «main»: luego cambian el modelo y nadie sabe qué pasó
    hf_sha256: str = ""  # huella de los pesos, pa que no nos den gato por liebre
    http_timeout_seconds: float = 30.0

    # El primer admin, lo crea la carga inicial (RF-U07 CA 6). Sin él no entra ni Dios
    admin_correo: str = ""
    admin_temporal: SecretStr = SecretStr("")

    # Correo pa mandar las contraseñas temporales (RF-U05, RF-U09). Si el SMTP se cae,
    # la cuenta queda PENDIENTE y se reintenta; nada de entrar en pánico.
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_usuario: str = ""
    smtp_contrasena: SecretStr = SecretStr("")
    smtp_remitente: str = "Gastro-AI <no-responder@gastroia.local>"
    smtp_starttls: bool = True
    smtp_timeout_seconds: float = 10.0

    # Gemini, el que redacta la explicación bonita (RF-R05)
    llm_proveedor: str = "gemini"
    # 3.5-flash: en las pruebas del 2026-11-07 respondió en ~2 s; 3.7 y 3.8 se pasaban de 15 s
    llm_modelo: str = "gemini-3.5-flash"
    # Cuánto «piensa» el modelo antes de contestar: LOW, MEDIUM o HIGH; vacío = lo que traiga
    # el modelo. Los 3.x piensan harto por defecto y eso los vuelve lentos (RF-R05 CA 3: ≤ 10 s)
    llm_razonamiento: str = "LOW"
    llm_api_key: SecretStr = SecretStr("")
    llm_timeout_seconds: float = 15.0  # RF-R05 CA 4: si pasa de 15 s, lo soltamos

    # Sesión y bloqueo (RF-U10, RF-U12, RNF-03). Los valores salen de los requisitos;
    # se dejan aquí pa las pruebas, no pa que alguien los afloje en producción.
    sesion_inactividad_minutos: int = 10
    bloqueo_intentos: int = 5
    bloqueo_minutos: int = 15

    # Contraseñas filtradas (RF-U02 CA 5) con Have I Been Pwned por k-anonimato: solo sale
    # el inicio del SHA-1, nunca la contraseña. Si el servicio no responde, no se bloquea
    # el cambio (se registra en el log) pa que una caída ajena no deje a nadie por fuera.
    contrasenas_filtradas_activo: bool = True
    contrasenas_filtradas_url: str = "https://api.pwnedpasswords.com/range/"
    contrasenas_filtradas_timeout_seconds: float = 3.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
