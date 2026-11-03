# Documento de Contexto Técnico — Gastro-AI

> Guía de referencia para que cualquier persona o IA pueda trabajar en el
> proyecto sin perderse: cómo se accede a cada componente, qué hace cada
> módulo y cómo están conectados. Complementa a `README.md` (orientado a
> GitHub) y `AGENTS.md` (resumen operativo para agentes).

---

## 1. Visión general

Sistema de análisis de imágenes clínicas con IA. Flujo principal:

1. El **frontend** (React) sube una imagen + documento → `POST /api/analisis`.
2. La **API** (FastAPI) guarda la imagen en MinIO, crea un registro en
   PostgreSQL con estado `PROCESANDO` y encola una tarea en Redis.
3. El **worker** (Celery) procesa la tarea, genera el Grad-CAM y la
   explicación, actualiza el registro a `COMPLETADO` y publica un evento en
   Redis.
4. El **frontend** recibe la notificación por **WebSocket** y muestra el
   resultado sin recargar.

```
Navegador → Nginx :80 →  /      → frontend (React estático)
                        /api/* → api (FastAPI :8000)
                        /ws/*  → api (WebSocket)
api → encola → Redis → worker (Celery) → MinIO + PostgreSQL
worker → publish Redis "analisis:{id}" → api (WS) → Navegador
```

---

## 2. Puesta en marcha y accesos

### 2.1 Comandos Docker

```bash
docker compose up -d --build      # construir + arrancar todo
docker compose ps                 # estado (postgres y minio con healthcheck)
docker compose logs -f api        # logs API (la siembra corre al arrancar)
docker compose logs -f worker     # logs Celery
docker compose restart nginx      # recargar nginx tras cambiar nginx.conf
docker compose down               # detener (añadir -v para borrar volúmenes)
```

### 2.2 URLs y puertos (host)

| Servicio | URL | Puerto host | Notas |
|---|---|---|---|
| Web (SPA + API + WS) | `http://localhost` | 80 | Punto de entrada único (Nginx). |
| Health API | `http://localhost/api/health` | — | `{"status","database","minio"}`. |
| MinIO (S3 API) | `http://localhost:9000` | 9000 | Sin consola web en este build. |
| PostgreSQL | `localhost:5432` | 5432 | Para clientes como DBeaver/psql. |
| Redis | interno | 6379 | No expuesto al host; solo `api`/`worker`. |

### 2.3 Credenciales por defecto (definidas en `.env`)

| Recurso | Usuario | Contraseña |
|---|---|---|
| App (superadmin) | `admin@gastroai.com` | `admin12345` |
| MinIO | `minioadmin` | `minioadmin` |
| PostgreSQL | `gastroai` | `gastroai` |

---

## 3. Backend (`backend/`)

### 3.1 Estructura

```
backend/
├── Dockerfile.backend     # imagen compartida por API y worker
├── requirements.txt
├── alembic.ini            # configurado; NO usado al arrancar (ver §3.10)
├── migrations/            # migraciones Alembic (futuras)
└── app/
    ├── main.py            # instancia FastAPI + registro de routers
    ├── config.py          # Settings (Pydantic) leyendo variables de entorno
    ├── db.py              # engine, SessionLocal, Base, get_db()
    ├── security.py        # hash/verify password (bcrypt) + JWT (PyJWT)
    ├── deps.py            # dependencia get_current_user (Bearer JWT)
    ├── seed.py            # create_all + roles + superadmin + bucket MinIO
    ├── worker.py          # instancia Celery (broker/backend Redis)
    ├── tasks.py           # tareas asíncronas (procesar_analisis)
    ├── models/            # ORM: Role, User, Analisis
    ├── schemas/           # DTOs Pydantic: auth, analisis
    ├── routers/           # health, auth, analisis, ws
    ├── services/          # lógica de negocio (analisis_service)
    └── adapters/          # minio_adapter, llm_adapter (externos)
```

### 3.2 Configuración (`app/config.py`)

`Settings` extiende `pydantic_settings.BaseSettings` y lee variables de entorno
(case-insensitive). Los campos más importantes y sus *properties* derivadas:

| Campo (env var) | Default | Uso |
|---|---|---|
| `POSTGRES_USER/PASSWORD/DB/HOST/PORT` | gastroai / gastroai / gastroai / localhost / 5432 | `database_url` |
| `REDIS_HOST` / `REDIS_PORT` | localhost / 6379 | `redis_url`, `celery_broker_url` (db 0), `celery_result_backend` (db 1) |
| `MINIO_ENDPOINT` | `minio:9000` | operaciones internas (subir/leer) |
| `MINIO_PUBLIC_ENDPOINT` | `localhost:9000` | URLs firmadas que usa el navegador |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | minioadmin | credenciales S3 |
| `MINIO_BUCKET` | gastroai | bucket de objetos |
| `SECRET_KEY` / `JWT_ALGORITHM` / `ACCESS_TOKEN_EXPIRE_MINUTES` | — / HS256 / 60 | firma JWT |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | admin@gastroai.com / admin12345 | siembra inicial |
| `HUGGINGFACE_API_URL/TOKEN`, `LLM_API_URL/KEY` | vacío | modo *stub* si están vacíos |

La URL de BD se construye como:
`postgresql+psycopg2://{user}:{pass}@{host}:{port}/{db}`.

### 3.3 Base de datos y ORM (`app/db.py`)

```python
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

def get_db():            # dependencia de FastAPI
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- Se usa **SQLAlchemy 2.0** con sesiones **síncronas** y `psycopg2-binary`.
- Inyecta la sesión en los endpoints con `db: Session = Depends(get_db)`.

### 3.4 Modelos (`app/models/`)

Todos heredan de `Base`. Se importan en `app/models/__init__.py` (necesario para
que `create_all` y Alembic los vean).

- **Role** — `id (int)`, `name (unique)`.
- **User** — `id (UUID)`, `email (unique)`, `full_name`, `password_hash`,
  `role_id (FK roles.id)`, `is_active`, `created_at`, `role (relationship)`.
- **Analisis** — `id (UUID)`, `documento`, `tipo_documento`, `estado`
  (`PROCESANDO|COMPLETADO|FALLIDO`), `imagen_key`, `grad_cam_key`,
  `resultado (JSONB)`, `explicacion (Text)`, `error`, `created_at`, `updated_at`.

> `imagen_key` / `grad_cam_key` guardan la *clave* del objeto en MinIO, no el
> binario. Las URLs firmadas se generan en tiempo de consulta.

### 3.5 Endpoints REST

Todos bajo `/api`. Los de `analisis` requieren `Authorization: Bearer <token>`.

| Método | Ruta | Auth | Body / Params | Respuesta |
|---|---|---|---|---|
| GET | `/api/health` | no | — | `{status, database, minio}` |
| POST | `/api/auth/login` | no | JSON `{email, password}` | `{access_token, token_type}` |
| POST | `/api/analisis` | sí | `multipart/form-data`: `file`, `documento`, `tipo_documento` (default `CC`) | `202` + `AnalisisOut` (estado `PROCESANDO`) |
| GET | `/api/analisis/{id}` | sí | `id` (UUID) | `AnalisisOut` |
| WS | `/ws/analisis/{id}` | no | `id` (UUID) | eventos JSON `{id, estado, explicacion}` |

**`AnalisisOut`** (schema en `app/schemas/analisis.py`):
`id, documento, tipo_documento, estado, resultado, explicacion, error,
imagen_url, grad_cam_url, created_at, updated_at`. `imagen_url`/`grad_cam_url`
son URLs firmadas de MinIO (expiran en 5 min) o `null`.

Ejemplos:

```bash
# Login → token
curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gastroai.com","password":"admin12345"}'

# Crear análisis (202)
curl -s -X POST http://localhost/api/analisis \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@imagen.png" -F "documento=12345678" -F "tipo_documento=CC"

# Consultar estado/resultado
curl -s http://localhost/api/analisis/$ID -H "Authorization: Bearer $TOKEN"
```

### 3.6 Capa de servicios (`app/services/`)

Los routers delegan la lógica a un servicio que recibe la sesión de BD:

```python
class AnalisisService:
    def __init__(self, db): self.db = db
    def crear_analisis(self, file, documento, tipo_documento) -> AnalisisOut: ...
    def obtener_analisis(self, analisis_id) -> AnalisisOut | None: ...
```

`crear_analisis` hace: leer bytes → subir a MinIO (`original/{uuid}.{ext}`) →
crear registro `Analisis` → commit → `procesar_analisis.delay(str(id))` →
devolver `AnalisisOut`. El servicio es el **único** sitio que conoce MinIO y
Celery; los routers solo validan entrada y mapean a HTTP.

### 3.7 Adaptadores (`app/adapters/`)

- **`minio_adapter.py`** — singleton `minio_adapter` con dos clientes:
  - `client` → `MINIO_ENDPOINT` (`minio:9000`) para `ensure_bucket`, `put_bytes`,
    `ping`.
  - `public_client` → `MINIO_PUBLIC_ENDPOINT` (`localhost:9000`) para
    `presigned_get` (URLs que el navegador puede alcanzar).
  - Ambos usan `region="us-east-1"` (evita la llamada de descubrimiento de
    región).
- **`llm_adapter.py`** — `LLMAdapter.generar_explicacion(resultado)`. Hoy es un
  *stub*; la implementación real hará HTTPS a `settings.llm_api_url`. Regla:
  **nunca** enviar la imagen original al LLM, solo JSON (probabilidades + ROI).

### 3.8 Worker Celery (`app/worker.py` + `app/tasks.py`)

- Instancia: `celery_app = Celery("gastroai", broker=redis/0, backend=redis/1,
  include=["app.tasks"])`.
- Comando en compose: `celery -A app.worker.celery_app worker --loglevel=info`.
- Tarea `procesar_analisis(analisis_id)`:
  1. `time.sleep(3)` (simula inferencia; sustituir por llamada a Hugging Face).
  2. Genera `resultado` (clases/probabilidades/ROI).
  3. Sube un PNG placeholder a MinIO (`gradcam/{id}.png`).
  4. Genera `explicacion` con `llm_adapter`.
  5. Actualiza `Analisis` → `COMPLETADO` (o `FALLIDO` en excepción).
  6. Publica en Redis: `publish("analisis:{id}", json)`.

El worker abre su **propia** sesión con `SessionLocal()` (no comparte la de
FastAPI). Para añadir una tarea: definirla en `tasks.py` y llamarla con
`.delay(...)` desde un servicio.

### 3.9 Tiempo real (WebSocket + Pub/Sub)

Cadena: `worker` → `redis.publish("analisis:{id}")` → `api` (suscriptor) →
`WebSocket /ws/analisis/{id}` → navegador.

Implementación en `app/routers/ws.py`: usa `redis.asyncio` para suscribirse al
canal y reenvía cada mensaje al cliente. Alternativa sin WebSocket: **polling**
de `GET /api/analisis/{id}` cada 2s hasta que `estado != PROCESANDO`.

### 3.10 Migraciones Alembic

El esquema se crea en tiempo de arranque con `Base.metadata.create_all()` en
`app/seed.py` (NO con Alembic). Alembic queda listo para versionar cambios:

```bash
cd backend
alembic revision --autogenerate -m "descripcion"
alembic upgrade head
```

### 3.11 Cómo añadir una funcionalidad nueva (backend)

1. **Modelo** → crear en `app/models/`, importar en `app/models/__init__.py`.
2. **Schema** → crear en `app/schemas/`.
3. **Servicio** → encapsular lógica en `app/services/`.
4. **Router** → crear en `app/routers/` y registrar en `app/main.py`.
5. **Si es asíncrono** → añadir tarea en `app/tasks.py` y llamarla con `.delay`.

---

## 4. Frontend (`frontend/`)

### 4.1 Estructura

```
frontend/
├── Dockerfile.frontend   # multi-etapa: node build → nginx (sirve dist)
├── package.json          # pnpm 9.15.4, build = tsc --noEmit && vite build
├── vite.config.ts        # proxy dev de /api y /ws hacia api:8000
├── index.html
└── src/
    ├── main.tsx          # punto de entrada React
    ├── App.tsx           # enruta Login ↔ Dashboard según token
    ├── index.css
    ├── components/       # Spinner.tsx (UI reutilizable)
    ├── pages/            # Login.tsx, Dashboard.tsx
    ├── services/         # api.ts (HTTP), websocket.ts (WS)
    ├── types/            # index.ts (contratos TS)
    └── utils/            # validators.ts
```

### 4.2 Cliente HTTP (`src/services/api.ts`)

Toda llamada pasa por `request<T>()`, que inyecta el token JWT desde
`localStorage`:

```ts
async function request<T>(path, options) {
  const token = getToken();
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}
```

Funciones exportadas: `login`, `crearAnalisis`, `obtenerAnalisis`, `fetchHealth`
y helpers `getToken/setToken/clearToken` (clave `gastroai_token` en
`localStorage`).

> Las rutas son **relativas** (`/api/...`): en producción las sirve Nginx en el
> mismo origen (sin CORS); en desarrollo `vite.config.ts` hace proxy a
> `api:8000`.

### 4.3 WebSocket (`src/services/websocket.ts`)

```ts
export function subscribeAnalisis(id, onMessage): () => void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/analisis/${id}`);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  return () => ws.close();   // cleanup
}
```

### 4.4 Tipos (`src/types/index.ts`)

`Analisis`, `AnalisisEstado`, `TokenResponse`, `HealthResponse`,
`AnalisisEvent`. Espejo de los schemas Pydantic del backend; mantener en
sincronía.

### 4.5 Páginas

- **`Login.tsx`** — formulario → `login()` → `setToken()` → `onLoggedIn()`.
- **`Dashboard.tsx`** — sube imagen + documento → `crearAnalisis()` → se
  suscribe con `subscribeAnalisis()`; al recibir `COMPLETADO`/`FALLIDO` llama
  `obtenerAnalisis()` para cargar URLs firmadas y mostrarlas (`<img
  src={grad_cam_url}>`).

### 4.6 Cómo añadir una página/servicio (frontend)

1. Añadir tipo en `src/types/`.
2. Añadir función en `src/services/api.ts` (usa `request<T>`).
3. Crear la página en `src/pages/` y enlazarla desde `App.tsx`.

---

## 5. Acceso a cada componente de infraestructura

### 5.1 PostgreSQL

- Host (dentro de la red docker): `postgres:5432`; desde el host: `localhost:5432`.
- BD/usuario/clave: `gastroai` / `gastroai` / `gastroai`.
- Desde el host:
  ```bash
  docker compose exec postgres psql -U gastroai -d gastroai
  ```
- En el código: **solo** a través del ORM (`app/db.py`), no SQL crudo (salvo
  el `SELECT 1` del healthcheck).

### 5.2 MinIO

- Endpoint interno: `minio:9000`; público (host): `localhost:9000`.
- Bucket: `gastroai` (se crea automáticamente en `seed.py`).
- Objetos: `original/{uuid}.{ext}` y `gradcam/{id}.png`.
- Acceso programático: `minio_adapter` (`app/adapters/minio_adapter.py`).
- URLs firmadas: `presigned_get(key)` devuelve URL pública con vigencia 5 min.
- **No hay consola web** (build `bitnamilegacy/minio`); usar el SDK o `mc`.

### 5.3 Redis

- Solo interno (`redis:6379`), no expuesto.
- Base de datos 0 → broker Celery y canal pub/sub; base de datos 1 → backend de
  resultados Celery.
- Canal de tiempo real: `analisis:{id}` (JSON con `id`, `estado`, `explicacion`).

### 5.4 Nginx (`nginx.conf`) — tabla de rutas

| Ruta | Destino | Notas |
|---|---|---|
| `/api/` | `api:8000` | headers `Host`, `X-Forwarded-*`. |
| `/ws/` | `api:8000` | `Upgrade`/`Connection` para WebSocket; timeouts 300s. |
| `/` | `frontend:80` | SPA compilada. |

Usa `resolver 127.0.0.11 valid=10s ipv6=off` para re-resolver los nombres de
servicio (evita 502 por IP obsoleta al recrear contenedores). Si editas
`nginx.conf`, `docker compose restart nginx`.

---

## 6. Flujo de datos de ejemplo (end-to-end)

```
1. Login
   POST /api/auth/login {email, password}
   → 200 {access_token}

2. Subida
   POST /api/analisis  (multipart: file, documento, tipo_documento)
   → API: guarda imagen en MinIO "original/{uuid}.png"
   → DB: INSERT analisis (estado=PROCESANDO)
   → Redis: encola tarea procesar_analisis
   → 202 {id, estado:"PROCESANDO", imagen_url}

3. Procesamiento (worker)
   → simula inferencia (3s)
   → MinIO: sube "gradcam/{id}.png"
   → LLM: genera explicación (stub)
   → DB: UPDATE estado=COMPLETADO, resultado, explicacion
   → Redis: publish "analisis:{id}"

4. Notificación (tiempo real)
   → api (suscrita a "analisis:{id}") reenvía al WebSocket
   → frontend recibe {estado:"COMPLETADO"} y hace GET /api/analisis/{id}
   → muestra explicación + <img grad_cam_url> + JSON resultado
```

---

## 7. Notas / gotchas operativos

- **Imagen compartida:** `api` y `worker` usan el mismo `Dockerfile.backend`;
  solo cambia el `command` en `docker-compose.yml`.
- **Siembra al arrancar:** `api` ejecuta `python -m app.seed` (crea tablas con
  `create_all`, roles, superadmin y bucket MinIO). Reintenta conexión a BD y
  MinIO hasta ~60s antes de fallar.
- **MinIO:** las imágenes oficiales `minio/minio` ya no existen (edición
  comunitaria solo por código). Se usa `bitnamilegacy/minio`; el directorio de
  datos es `/bitnami/minio/data` (no `/data`).
- **URLs firmadas:** usan `MINIO_PUBLIC_ENDPOINT`; si cambias el host/dominio,
  ajusta esta variable. No edites la región `us-east-1`.
- **Frontend:** `pnpm install --frozen-lockfile` exige `pnpm-lock.yaml`
  versionado (generado con pnpm 9.15.4). Build = `tsc --noEmit && vite build`.
- **Sin suite de tests:** verificar manualmente con `/api/health`, el login y el
  flujo de análisis descrito arriba.
- **JWT:** guardado en `localStorage` del navegador (clave `gastroai_token`);
  `get_current_user` en `app/deps.py` lo valida por email.
