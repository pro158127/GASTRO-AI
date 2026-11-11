# Gastro-AI

Aplicación web que ayuda al gastroenterólogo a revisar imágenes endoscópicas gástricas.
Un modelo (EfficientNet + Grad-CAM, publicado en un Space privado de Hugging Face)
entrega la probabilidad de cada característica (atrofia, gastritis, *H. pylori*) y un
mapa de calor; un LLM (Gemini) redacta la explicación a partir de esos números.

> **Análisis experimental.** Valoración preventiva probabilística experimental. No
> sustituye el juicio profesional. No constituye un diagnóstico clínico.

Proyecto académico ONCO-AI_USC 2026B · equipo Ragnar Tech · Universidad Santiago de Cali.

---

## Arquitectura

```
Navegador (Doctor / Administrador)
        │ HTTP :80
        ▼
   ┌─────────┐   /       ┌──────────┐
   │  nginx  │──────────►│ frontend │  React + TS + Vite
   └────┬────┘           └──────────┘
        │ /api/v1/
        ▼
   ┌─────────┐  encola  ┌───────┐  consume  ┌────────┐ HTTPS ┌──────────────────┐
   │   api   │─────────►│ redis │──────────►│ worker │──────►│ Space HF / Gemini│
   │ FastAPI │          └───────┘           │ Celery │       └──────────────────┘
   └────┬────┘                              └───┬────┘
        ├──────────────┬────────────────────────┘
        ▼              ▼
   ┌──────────┐   ┌─────────┐
   │ postgres │   │  minio  │  imágenes, mapas de calor y PDF (API S3)
   │    16    │   └─────────┘
   └──────────┘
```

| Servicio | Imagen | Rol |
|---|---|---|
| `nginx` | `nginx:1.28-alpine` | Puerta de entrada única: `/` al frontend y `/api/` a la API |
| `frontend` | `frontend/Dockerfile.frontend` | SPA en React servida por nginx |
| `preparar` | `gastroia/backend:dev` | Corre una vez: migraciones, bucket y carga inicial |
| `api` | `gastroia/backend:dev` | API REST en FastAPI |
| `worker` | `gastroia/backend:dev` | Celery: inferencia y explicación en segundo plano |
| `redis` | `redis:7-alpine` | Cola de Celery, con AOF |
| `postgres` | `postgres:16-alpine` | Base de datos |
| `minio` | `gastroia/minio` (compilado) | Archivos por la API S3 |

`api`, `worker` y `preparar` usan la misma imagen (`backend/Dockerfile`); solo cambia el
comando.

---

## Puesta en marcha

Requisitos: Docker Desktop (o Docker Engine) con Docker Compose v2.

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
docker compose ps
```

- La primera vez tarda unos minutos: MinIO se compila desde el código fuente (la edición
  comunitaria ya no publica imágenes ni binarios).
- **Web:** http://localhost · **API:** http://localhost/api/v1/health
- **MinIO:** API en `localhost:9000`, consola en http://localhost:9001
- **Primer administrador:** el correo y la contraseña temporal son `ADMIN_CORREO` y
  `ADMIN_TEMPORAL` de `backend/.env`. En el primer ingreso se cambia la contraseña y se
  vincula una app autenticadora (TOTP).
- `backend/.env` trae valores de desarrollo. Las claves marcadas «cambia-esto» se generan
  para cada entorno; los comandos están en el mismo archivo.

Solo el backend, sin el frontend: ver [`backend/README.md`](backend/README.md).

---

## Estructura

```
├── docker-compose.yml      # todo el sistema
├── .env.example            # opcional: credenciales de Postgres/MinIO del compose
├── backend/                # API, worker, migraciones (ver backend/README.md)
└── frontend/               # SPA en React
```

El contrato de la API y el detalle técnico están en [`ARCHITECTURE.md`](ARCHITECTURE.md).
