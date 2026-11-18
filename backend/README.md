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
- Mientras no exista el Space de Hugging Face, `HF_SIMULADO=true` hace que el worker
  invente resultados estables (misma imagen, mismo resultado) y un mapa de calor de prueba.
  Solo funciona con `ENVIRONMENT=development`; sin eso y sin `HF_SPACE_URL`, los análisis
  quedan `FALLIDO` con `ERR-1002`. Tras cambiarla: `docker compose up -d worker`.

## Producción (un servidor, HTTPS)

`docker-compose.prod.yml` (en la raíz) se pone **encima** de `docker-compose.yml` y cambia
solo lo necesario. Nginx publica el 80, que redirige; el 443, que sirve la app; y el 9000,
que sirve las URL firmadas de MinIO. El resto de los servicios no publica puertos. Además,
no hay Mailpit (el correo sale por el SMTP real), los contenedores se reinician solos y el
backend arranca con `ENVIRONMENT=production`.

1. Copia los certificados (`fullchain.pem` y `privkey.pem`) a
   `backend/docker/nginx/certs/`, o indica su carpeta en `NGINX_CERTIFICADOS`. Esa carpeta
   no se sube al repositorio.
2. Llena `backend/.env` (desde `backend/.env.example`) con las claves reales y el `.env`
   de la raíz con la sección «Solo producción»: `POSTGRES_PASSWORD`, `S3_SECRET_KEY`,
   `S3_PUBLIC_ENDPOINT_URL` (`https://<dominio>:9000`) y `SMTP_HOST`. Con
   `ENVIRONMENT=production`, el backend **no arranca** si falta una clave (`HMAC_CLAVES`,
   `TOTP_CLAVE_CIFRADO`, `HF_TOKEN`, `HF_REVISION`…) y dice cuál.
3. Desde la raíz:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
   ```

   El servicio `preparar` aplica las migraciones, crea los buckets y hace la carga inicial
   (con el primer administrador de `ADMIN_CORREO` / `ADMIN_TEMPORAL`) antes de que arranquen
   la API y el worker.

En los comandos que siguen, `$COMPOSE` es
`docker compose -f docker-compose.yml -f docker-compose.prod.yml` en producción y
`docker compose` en desarrollo.

## Recuperar al único administrador (RF-U09 CA 10)

Si hay otro administrador activo, la contraseña se restablece desde la aplicación
(Gestión de usuarios → Restablecer contraseña). Este procedimiento es solo para cuando hay
**un único administrador** y perdió la contraseña o la app autenticadora, o quedó
bloqueado. Requiere acceso al servidor:

```bash
$COMPOSE exec api python -m scripts.recuperar_admin --correo admin@hospital.co
```

- Hace lo mismo que el restablecimiento de la app:
  - emite una contraseña temporal nueva, que **llega por correo** y vence en 72 h;
  - desvincula la app autenticadora;
  - quita el bloqueo;
  - cierra todas las sesiones de esa cuenta.

  Al entrar, el sistema pide cambiar la contraseña y vincular de nuevo la app.
- Si el correo no funciona, agrega `--mostrar`: la temporal se imprime **una sola vez** en
  la terminal y no se manda correo. Entrégasela a la persona en mano; no la copies en chats
  ni en archivos.
- Queda en la bitácora como `CONTRASENA_RESTABLECIDA` con `"origen": "SERVIDOR"` y por
  dónde se entregó la temporal (`CORREO` o `PANTALLA`).
- Se niega, sin cambiar nada, en estos casos:
  - hay otro administrador activo;
  - el correo no es de un administrador;
  - la cuenta está INACTIVO o ELIMINADO.

## Métricas del modelo (RM-06)

El reporte de evaluación que entrega el equipo de ML (un JSON con el formato de
`app/schemas/reporte_evaluacion.py`) se carga así; es lo que muestra el panel de
métricas del administrador:

```bash
$COMPOSE exec -T api python -m scripts.cargar_metricas - --revisar < reporte.json   # solo valida
$COMPOSE exec -T api python -m scripts.cargar_metricas - < reporte.json
```

Si algo no cuadra no se guarda nada. Volver a cargar el mismo modelo y conjunto de prueba
reemplaza el reporte anterior.

## Respaldos y restauración (RNF-26)

Desde la raíz, con el stack arriba:

```bash
COMPOSE="$COMPOSE" backend/scripts/respaldar.sh /srv/respaldos
```

- **Qué guarda:** la base (`pg_dump`), los archivos de MinIO, los pesos del modelo (si
  `HF_PESOS_ARCHIVO` está configurado) y un manifiesto con conteos y huellas SHA-256.
- `RESPALDOS_A_CONSERVAR=7` borra los más viejos.
- **El respaldo es dato personal protegido (Ley 1581):** queda legible solo por el dueño.
  Guárdalo cifrado y fuera del servidor.

Para restaurar, en un entorno **limpio** (sin tablas; nunca pisa una instalación en uso):

```bash
COMPOSE="$COMPOSE" backend/scripts/restaurar.sh /srv/respaldos/gastroai-20261117T030000Z
$COMPOSE up -d
```

Verifica las huellas, restaura, y al final compara conteos, bitácora y archivos con el
manifiesto. Debe terminar en «Restauración verificada».

## Estilo

```bash
ruff check . && ruff format .
```

Código, comentarios y mensajes en español; nombres del dominio en español. Capas:
router → servicio → repositorio (ver `ARCHITECTURE.md` §3.1 y §3.11).
