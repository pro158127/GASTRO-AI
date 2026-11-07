# Gastro-AI · Backend

API en FastAPI, worker en Celery y migraciones en Alembic. El contrato de la API y la
arquitectura están en [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Opción 1 · Todo en Docker (lo más rápido)

Desde la raíz del repositorio:

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
```

## Opción 2 · Solo el backend en Docker

Desde esta carpeta. Levanta postgres, redis, minio, api, worker y nginx, sin el frontend;
la API queda también en `http://localhost:8000` (Swagger en `/docs`).

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec api python -m scripts.init_storage
docker compose exec api python -m app.seed
```

## Opción 3 · Código en el equipo, servicios en Docker (para desarrollar)

Requiere Python 3.12.

```bash
python -m venv .venv
.venv\Scripts\activate              # Windows (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
docker compose up -d postgres redis minio
alembic upgrade head
python -m scripts.init_storage
python -m app.seed
uvicorn app.main:app --reload       # http://localhost:8000/docs
celery -A app.workers.celery_app worker --loglevel=info --pool=solo   # --pool=solo en Windows
```

Si PowerShell bloquea `activate`: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Correo en desarrollo

Los dos compose traen **Mailpit**: atrapa todos los correos que manda el backend (por
ejemplo, las contraseñas temporales al crear una cuenta) y los muestra en
http://localhost:8025. En producción se quitan las líneas `SMTP_*` del compose y manda el
SMTP real configurado en `backend/.env`.

## Usuarios de prueba (solo desarrollo)

La carga inicial crea el primer administrador. Para probar con otros roles:

```bash
python -m scripts.crear_usuario_prueba --correo doctor@gastroia.local            # DOCTOR
python -m scripts.crear_usuario_prueba --correo admin2@gastroia.local --rol ADMINISTRADOR
docker compose exec api python -m scripts.crear_usuario_prueba --correo doctor@gastroia.local
```

Imprime una contraseña temporal (vence en 72 h). Solo corre con `ENVIRONMENT=development`.
Para probar una temporal vencida (W-01e):

```sql
UPDATE "Usuario" SET temporal_expira_en = now() - interval '1 minute' WHERE correo = 'doctor@gastroia.local';
```

## Variables de entorno

Todas están en `.env.example` con un valor de ejemplo y un comentario. Las que se generan
para cada entorno (nunca se suben al repositorio):

```bash
python -c "import secrets; print(secrets.token_hex(32))"                                       # clave de HMAC_CLAVES
python -c "import base64, secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())"  # TOTP_CLAVE_CIFRADO
```

- `HMAC_CLAVES` no se cambia nunca una vez en uso: para rotar se agrega una versión nueva
  (`{"1": "...", "2": "..."}`) y se sube `HMAC_VERSION_ACTUAL`; la anterior se conserva.
- Si se pierde `TOTP_CLAVE_CIFRADO`, todos los usuarios deben volver a vincular su app.
- `HF_REVISION` es un commit SHA de 40 caracteres, nunca una rama (RNF-29).

## Estilo

```bash
ruff check . && ruff format .
```

Código, comentarios y mensajes en español; nombres del dominio en español. Capas:
router → servicio → repositorio (ver `ARCHITECTURE.md` §3.1 y §3.11).
