from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "Gastro-AI API"
    debug: bool = False

    # PostgreSQL
    postgres_user: str = "gastroai"
    postgres_password: str = "gastroai"
    postgres_db: str = "gastroai"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    # Redis / Celery
    redis_host: str = "localhost"
    redis_port: int = 6379

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_public_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "gastroai"
    minio_secure: bool = False

    # Auth
    secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # External AI services
    huggingface_api_url: str = ""
    huggingface_token: str = ""
    llm_api_url: str = ""
    llm_api_key: str = ""

    # Seed
    superadmin_email: str = "admin@gastroai.com"
    superadmin_password: str = "admin12345"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    @property
    def celery_broker_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    @property
    def celery_result_backend(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/1"


settings = Settings()
