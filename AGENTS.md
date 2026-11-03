# AGENTS.md

Detailed access reference (endpoints, ORM, adapters, WebSocket flow,
infra endpoints): see `ARCHITECTURE.md`.

## Stack

Monorepo: `backend/` (Python 3.11 + FastAPI + SQLAlchemy 2.0 + Celery) and
`frontend/` (React 18 + TypeScript + Vite 5 + pnpm 9.15.4), orchestrated with
Docker Compose. Infrastructure: PostgreSQL 16, Redis 7, MinIO, Nginx gateway.

## Commands

```bash
docker compose up -d --build      # build + start all services
docker compose ps                 # status (postgres/minio have healthchecks)
docker compose logs -f api        # api logs (seed runs at startup)
docker compose logs -f worker     # celery logs
docker compose down               # stop (add -v to wipe volumes)
```

Local frontend build/typecheck: `cd frontend && pnpm install && pnpm build`
(`build` runs `tsc --noEmit && vite build`).

There is no test suite yet. Verify manually via `http://localhost/api/health`
and login `admin@gastroai.com` / `admin12345` (from `.env`).

## Architecture gotchas

- **API and worker share `backend/Dockerfile.backend`.** Only the compose
  `command` differs: `sh -c "python -m app.seed && uvicorn ..."` vs
  `celery -A app.worker.celery_app worker`.
- **Tables are created by `Base.metadata.create_all()` in `app/seed.py`** at API
  startup (roles + superadmin + MinIO bucket). Alembic is configured but not
  used at runtime; use `alembic revision --autogenerate` when the schema evolves.
- **MinIO image is `bitnamilegacy/minio`** (official `minio/minio` images are
  gone — community edition is source-only). No web console in this build; data
  dir is `/bitnami/minio/data`.
- **Two MinIO endpoints:** `MINIO_ENDPOINT=minio:9000` for internal ops,
  `MINIO_PUBLIC_ENDPOINT=localhost:9000` for presigned URLs the browser fetches.
  Region is hardcoded `us-east-1` to avoid a region-lookup network call.
- **`nginx.conf` uses `resolver 127.0.0.11`** so recreating api/frontend does not
  cause stale-IP 502s. If you edit `nginx.conf`, `docker compose restart nginx`.
- **Real-time flow:** worker publishes to Redis channel `analisis:{id}`; FastAPI
  bridges it to `WebSocket /ws/analisis/{id}` (`app/routers/ws.py`). Frontend
  client: `frontend/src/services/websocket.ts`.

## Conventions

- `pnpm install --frozen-lockfile` in the Dockerfile requires the committed
  `frontend/pnpm-lock.yaml` (generated with pnpm 9.15.4 — keep versions in sync).
- `.env` is gitignored; `.env.example` is the template.
- No git repository is initialized at the repo root.
