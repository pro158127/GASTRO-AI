# tecnologias

## Backend

| Para qué                        | Tecnología                                                             |
| ------------------------------- | ---------------------------------------------------------------------- |
| Lenguaje                        | Python 3.12                                                            |
| API REST                        | FastAPI, servida con Uvicorn                                           |
| Validación y configuración      | Pydantic v2 y pydantic-settings                                        |
| Base de datos                   | PostgreSQL 16                                                          |
| ORM                             | SQLAlchemy 2.0 (estilo `Mapped`) con psycopg 3                         |
| Migraciones                     | Alembic                                                                |
| Tareas en segundo plano         | Celery con Redis como intermediario                                    |
| Almacenamiento de archivos      | MinIO (API compatible con S3) con boto3                                |
| Inferencia del modelo           | Space privado de Hugging Face, llamado con httpx                       |
| Explicación en lenguaje natural | Google Gemini (`gemini-3.5-flash`) con google-genai                    |
| Procesamiento de imagen         | Pillow (formato y metadatos), OpenCV y NumPy (calidad)                 |
| Seguridad                       | bcrypt (contraseñas), pyotp (TOTP), cryptography (AES-256-GCM), qrcode |
| Reportes                        | ReportLab (_planeado_)                                                 |

## Infraestructura

| Para qué                  | Tecnología                                                           |
| ------------------------- | -------------------------------------------------------------------- |
| Contenedores              | Docker y Docker Compose                                              |
| Proxy y puerta de entrada | nginx 1.28                                                           |
| Correo en desarrollo      | Mailpit (bandeja web en `http://localhost:8025`)                     |
| Almacenamiento            | MinIO compilado desde el código oficial (ya no se publican imágenes) |

## Calidad y trabajo en equipo

| Para qué                 | Tecnología                                                        |
| ------------------------ | ----------------------------------------------------------------- |
| Pruebas                  | pytest, pytest-cov (cobertura mínima 70 %), TestClient de FastAPI |
| Estilo y errores comunes | Ruff                                                              |
| Control de versiones     | Git y GitHub (una rama por issue, revisión por pull request)      |

## Servicios externos

| Servicio                     | Uso                             | Cómo se protege                                                      |
| ---------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Hugging Face (Space privado) | Clasificación y Grad-CAM        | HTTPS con token, revisión fija, el Space no guarda imágenes          |
| Google Gemini                | Explicación del resultado       | Solo recibe JSON con porcentajes y regiones descritas en palabras    |
| Have I Been Pwned            | Detectar contraseñas filtradas  | k-anonimato: solo sale el inicio del hash SHA-1, nunca la contraseña |
| Servidor SMTP                | Envío de contraseñas temporales | TLS; el contenido del correo no se escribe en los logs               |
