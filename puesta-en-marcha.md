# puesta en marcha

## Con Docker (recomendado)

Desde la raíz del repositorio:

```bash
cp backend/.env.example backend/.env    # una sola vez; luego completar las claves
docker compose up -d --build            # construye y arranca todo
docker compose ps                       # ver el estado de los servicios
```

La primera vez tarda unos minutos porque compila MinIO y el frontend. El servicio `preparar` corre antes que la API: aplica las migraciones, crea el bucket y hace la carga inicial. Termina con estado `Exited (0)`, que es lo esperado.

| Servicio                        | Dirección                                                            |
| ------------------------------- | -------------------------------------------------------------------- |
| Aplicación (frontend + API)     | `http://localhost`                                                   |
| Salud de la API                 | `http://localhost/api/v1/health` → `{"status":"ok","database":"ok"}` |
| Correos de desarrollo (Mailpit) | `http://localhost:8025`                                              |
| MinIO (consola)                 | `http://localhost:9001`                                              |
| PostgreSQL                      | `localhost:5432`                                                     |

**Primer ingreso:** con `ADMIN_CORREO` y `ADMIN_TEMPORAL` del `.env`. El sistema pide cambiar la contraseña y vincular una aplicación autenticadora (Google Authenticator u otra).

**Usuario doctor de prueba** (solo en desarrollo):

```bash
docker compose exec api python -m scripts.crear_usuario_prueba --correo doctor@gastroia.local --rol DOCTOR --nombre Ana --apellido Pérez
```

## Solo el backend, sin Docker para la API

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate                  # Windows · Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
docker compose up -d postgres redis minio
alembic upgrade head
python -m scripts.init_storage
python -m app.seed
uvicorn app.main:app --reload           # documentación interactiva en http://localhost:8000/docs
celery -A app.workers.celery_app worker --loglevel=info --pool=solo   # --pool=solo en Windows
```

## Variables de entorno

Todas están en `backend/.env.example` con un valor de ejemplo. Las claves se generan para cada entorno y **nunca se suben al repositorio**.

| Grupo                 | Variables                                                                                                                                        | Notas                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Entorno               | `ENVIRONMENT`                                                                                                                                    | `development` habilita las herramientas de prueba                                   |
| Base de datos         | `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                                                                              |                                                                                     |
| Cola                  | `REDIS_URL`                                                                                                                                      |                                                                                     |
| Archivos (MinIO)      | `S3_ENDPOINT_URL`, `S3_PUBLIC_ENDPOINT_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_URL_FIRMADA_SEGUNDOS`, `IMAGEN_TEMPORAL_MINUTOS` | URL firmadas de 5 min; imagen temporal de 30 min                                    |
| Seudónimo             | `HMAC_CLAVES`, `HMAC_VERSION_ACTUAL`                                                                                                             | JSON con todas las versiones de la clave; no borrar versiones viejas                |
| Segundo factor        | `TOTP_CLAVE_CIFRADO`                                                                                                                             | 32 bytes en Base64                                                                  |
| Modelo                | `HF_SPACE_URL`, `HF_TOKEN`, `HF_REPO`, `HF_REVISION`, `HF_SHA256`, `HTTP_TIMEOUT_SECONDS`, `HF_SIMULADO`                                         | `HF_REVISION` es un commit SHA, nunca `main`. `HF_SIMULADO=true` solo en desarrollo |
| Explicación           | `LLM_PROVEEDOR`, `LLM_MODELO`, `LLM_RAZONAMIENTO`, `LLM_API_KEY`, `LLM_TIMEOUT_SECONDS`                                                          | Gemini, `gemini-3.5-flash`, razonamiento `LOW`, 15 s                                |
| Primer administrador  | `ADMIN_CORREO`, `ADMIN_TEMPORAL`                                                                                                                 | La temporal vence a las 72 h                                                        |
| Correo                | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USUARIO`, `SMTP_CONTRASENA`, `SMTP_REMITENTE`, `SMTP_STARTTLS`, `SMTP_TIMEOUT_SECONDS`                           | En Docker de desarrollo se usa Mailpit                                              |
| Sesión y bloqueo      | `SESION_INACTIVIDAD_MINUTOS`, `BLOQUEO_INTENTOS`, `BLOQUEO_MINUTOS`                                                                              | 10 min, 5 intentos, 15 min (no aflojar)                                             |
| Contraseñas filtradas | `CONTRASENAS_FILTRADAS_ACTIVO`, `CONTRASENAS_FILTRADAS_URL`, `CONTRASENAS_FILTRADAS_TIMEOUT_SECONDS`                                             | Have I Been Pwned                                                                   |

Generar las claves:

```bash
python -c "import secrets; print(secrets.token_hex(32))"                                       # clave de HMAC_CLAVES
python -c "import base64, secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())"  # TOTP_CLAVE_CIFRADO
```

## Modo simulado del modelo

Mientras el equipo de ML publica el Space de Hugging Face, en desarrollo se puede usar `HF_SIMULADO=true`: el worker inventa resultados estables (la misma imagen siempre da el mismo resultado) y un mapa de calor de prueba. Fuera de `ENVIRONMENT=development` el worker se niega a arrancar con esa opción. Sin Space y sin simulación, los análisis terminan en `FALLIDO` con `ERR-1002`.
