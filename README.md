# Gastro-AI

Sistema de análisis asistido de imágenes clínicas mediante inteligencia artificial.
La plataforma permite cargar una imagen médica, ejecutar un modelo de clasificación
(EfficientNet vía Hugging Face), generar mapas de calor **Grad-CAM** y producir una
explicación en lenguaje natural mediante un LLM, todo de forma **asíncrona** y con
actualización de resultados **en tiempo real**.

> **Aviso:** este es un *scaffold* funcional. Los adaptadores externos (Hugging Face
> y LLM) operan en modo *stub* hasta que se configuren sus URLs/tokens en `.env`.

---

## Arquitectura

```
  Navegador (Doctor / Admin)
          │  HTTP/WS  :80
          ▼
     ┌───────────┐
     │   Nginx   │  (gateway / proxy inverso)
     └─────┬─────┘
           ├───────────────┬──────────────────┐
       (SPA estática)   (/api/*)            (/ws/*)
           ▼               ▼                  ▼
    ┌───────────┐    ┌───────────┐      ┌───────────┐
    │ Frontend  │    │   API     │      │  API WS   │
    │ React/TS  │    │ FastAPI   │      │  (pub/sub)│
    └───────────┘    └─────┬─────┘      └─────▲─────┘
                           │ encola tareas     │ publica
                           ▼                   │
                     ┌───────────┐       ┌─────┴─────┐
                     │   Redis   │◄──────│  Worker   │
                     │ (broker)  │       │  Celery   │
                     └───────────┘       └─────┬─────┘
                                               ├──────────────┐
                                               ▼              ▼
                                        ┌───────────┐  ┌───────────┐
                                        │ PostgreSQL│  │   MinIO   │
                                        │    v16    │  │  (S3)     │
                                        └───────────┘  └───────────┘
```

| Contenedor | Imagen / build | Rol |
|---|---|---|
| `nginx` | `nginx:alpine` | Punto de entrada único. Sirve la SPA y enruta `/api` y `/ws`. |
| `frontend` | `frontend/Dockerfile.frontend` | SPA React + TypeScript compilada con Vite, servida por Nginx. |
| `api` | `backend/Dockerfile.backend` | API REST FastAPI, autenticación JWT, encola tareas. |
| `worker` | `backend/Dockerfile.backend` | Celery: inferencia, Grad-CAM, LLM y persistencia. |
| `redis` | `redis:7-alpine` | Broker de Celery y canal Pub/Sub para WebSocket. |
| `postgres` | `postgres:16-alpine` | Base de datos relacional (ORM SQLAlchemy). |
| `minio` | `bitnamilegacy/minio` | Almacenamiento de objetos (imágenes, Grad-CAM, PDFs). |

La API y el worker comparten la **misma imagen** (`Dockerfile.backend`) y solo cambian
el comando de arranque: `uvicorn` para la API y `celery worker` para el worker.

---

## Requisitos previos

- Docker Engine y Docker Compose v2 (`docker compose`).

---

## Puesta en marcha

```bash
cp .env.example .env      # ajusta secretos si lo deseas
docker compose up -d --build
docker compose ps         # verifica que todos los servicios estén "healthy"/"running"
```

La aplicación queda disponible en:

- **Web:** http://localhost
- **API / Health:** http://localhost/api/health
- **MinIO (API S3):** `localhost:9000`
- **PostgreSQL:** `localhost:5432`

> La edición comunitaria de MinIO ya no publica imágenes oficiales precompiladas,
> por lo que el scaffold usa `bitnamilegacy/minio`. La consola web de MinIO no está
> disponible en este build; el acceso se realiza vía API S3 (SDK `minio` de Python).

Credenciales por defecto (definidas en `.env`):

| Recurso | Usuario | Contraseña |
|---|---|---|
| Aplicación (superadmin) | `admin@gastroai.com` | `admin12345` |
| MinIO | `minioadmin` | `minioadmin` |
| PostgreSQL | `gastroai` | `gastroai` |

Ver logs / estado:

```bash
docker compose logs -f api
docker compose logs -f worker
```

---

## Variables de entorno

Todas se definen en `.env` (plantilla en `.env.example`). Las más relevantes:

| Variable | Descripción |
|---|---|
| `POSTGRES_*` | Credenciales y host de PostgreSQL. |
| `REDIS_HOST` / `REDIS_PORT` | Broker de Celery y Pub/Sub. |
| `MINIO_*` | Endpoint, claves y bucket de MinIO. |
| `SECRET_KEY` | Clave para firmar los JWT. |
| `SUPERADMIN_*` | Credenciales del usuario inicial. |
| `HUGGINGFACE_*`, `LLM_*` | Servicios de IA externos (vacíos = modo *stub*). |

---

## Comunicación Frontend ↔ Backend

- **Mismo dominio y puerto:** Nginx expone la web en `/` y redirige `/api/*` a la API,
  evitando problemas de CORS en producción.
- **Autenticación JWT:** `POST /api/auth/login` devuelve un `access_token`; el frontend
  lo envía en el header `Authorization: Bearer <token>`.
- **Subida de análisis:** `POST /api/analisis` con `multipart/form-data`
  (`file` + `documento` + `tipo_documento`).
- **Descarga segura:** la API genera **URLs firmadas** de MinIO (expiran en 5 min)
  para descargar imágenes y mapas Grad-CAM.

---

## Flujo asíncrono y tiempo real

1. El frontend envía la imagen → la API responde **`202 Accepted`** con el `id` del
   análisis y estado `PROCESANDO`.
2. La API guarda la imagen limpia en MinIO, crea el registro en PostgreSQL y encola la
   tarea en Redis.
3. El **worker (Celery)** procesa: llama al modelo (stub), decodifica el Grad-CAM, lo
   guarda en MinIO, actualiza el registro a `COMPLETADO` y publica un evento en Redis.
4. El frontend recibe la notificación por **WebSocket** (`/ws/analisis/{id}`) y carga
   el resultado final sin recargar la página.

### WebSocket (push)

El worker publica en el canal Redis `analisis:{id}` y la API reenvía ese mensaje al
cliente conectado (`backend/app/routers/ws.py`). El cliente lo usa en
`frontend/src/services/websocket.ts`.

### Polling (alternativa)

Si no se desea usar WebSocket, basta con consultar `GET /api/analisis/{id}` cada 2
segundos hasta que el estado deje de ser `PROCESANDO`.

---

## Estructura del proyecto

```
├── docker-compose.yml       # Orquestador principal
├── nginx.conf               # Proxy inverso / gateway
├── .env.example             # Plantilla de variables
├── backend/
│   ├── Dockerfile.backend
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── migrations/          # Migraciones Alembic
│   └── app/
│       ├── main.py          # Entrada FastAPI
│       ├── config.py        # Carga de entorno (Pydantic Settings)
│       ├── db.py            # Engine/sesión SQLAlchemy (ORM)
│       ├── seed.py          # Roles + superadmin + bucket
│       ├── worker.py        # Instancia Celery
│       ├── tasks.py         # Tareas asíncronas
│       ├── models/          # ORM (Role, User, Analisis)
│       ├── schemas/         # DTOs Pydantic
│       ├── routers/         # health, auth, analisis, ws
│       ├── services/        # Reglas de negocio
│       └── adapters/        # MinIO, LLM (y futuros: Hugging Face, SMTP)
└── frontend/
    ├── Dockerfile.frontend  # Multi-etapa (Node build + Nginx)
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── components/      # UI reutilizable
        ├── pages/           # Login, Dashboard
        ├── services/        # api.ts (HTTP), websocket.ts
        ├── types/           # Contratos TypeScript
        └── utils/           # Validadores
```

---

## Backend: ORM, rutas y servicios

### Conexión a la base de datos (ORM)

`backend/app/db.py` crea el `engine` de SQLAlchemy y expone la sesión:

```python
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()

def get_db():                     # dependencia de FastAPI
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

La URL se construye en `backend/app/config.py` a partir de las variables de entorno:

```python
@property
def database_url(self) -> str:
    return (f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}")
```

### Modelos (ejemplo)

```python
class Analisis(Base):
    __tablename__ = "analisis"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    documento: Mapped[str] = mapped_column(String(50), nullable=False)
    estado: Mapped[str] = mapped_column(String(20), default="PROCESANDO")
    resultado: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    ...
```

### Capa de servicios

`backend/app/services/analisis_service.py` encapsula la lógica de negocio
(guardar imagen, crear registro, encolar tarea, obtener resultado con URLs firmadas).

### Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado de DB y MinIO. |
| `POST` | `/api/auth/login` | Login → JWT. |
| `POST` | `/api/analisis` | Crea análisis (202, asíncrono). |
| `GET` | `/api/analisis/{id}` | Estado/resultado del análisis. |
| `WS` | `/ws/analisis/{id}` | Notificaciones en tiempo real. |

---

## Frontend

- `src/services/api.ts` — cliente HTTP con `fetch`, inyecta el token JWT.
- `src/services/websocket.ts` — suscripción WebSocket al análisis.
- `src/types/index.ts` — contratos TypeScript compartidos con el backend.
- `src/pages/Login.tsx` y `Dashboard.tsx` — vistas de autenticación y carga de análisis.

Para desarrollo local (fuera de Docker):

```bash
cd frontend && pnpm install && pnpm dev   # http://localhost:5173
```

`vite.config.ts` ya incluye proxy de `/api` y `/ws` hacia `api:8000`.

---

## Migraciones (Alembic)

El scaffold crea las tablas automáticamente en el arranque (`python -m app.seed`).
Alembic queda configurado para evolucionar el esquema de forma versionada:

```bash
cd backend
alembic revision --autogenerate -m "descripcion"   # genera migración
alembic upgrade head                                # aplica
```

---

## Notas de seguridad y privacidad

- El worker **nunca** envía la imagen original al LLM: solo un JSON con probabilidades
  y región de interés (`ROI`).
- Las URLs firmadas de MinIO expiran en 5 minutos.
- `SECRET_KEY` y credenciales deben cambiarse en producción (`.env` está gitignored).
