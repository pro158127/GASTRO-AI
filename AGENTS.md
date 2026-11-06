# AGENTS.md

Referencia técnica detallada (contrato de la API, capas, flujo de sesión, infraestructura):
`ARCHITECTURE.md`.

## Stack

Monorepo: `backend/` (Python 3.12 + FastAPI + SQLAlchemy 2.0 + Alembic + Celery) y
`frontend/` (React 18 + TypeScript + Vite 5 + pnpm 9.15.4), con Docker Compose.
Infraestructura: PostgreSQL 16, Redis 7 (AOF), MinIO compilado desde la fuente, nginx.

## Comandos

```bash
cp backend/.env.example backend/.env    # una vez
docker compose up -d --build            # todo; «preparar» migra y siembra antes de la API
docker compose ps
docker compose logs -f api
docker compose logs -f worker
docker compose down                     # agregar -v borra los volúmenes (la base)
```

Backend sin Docker (desde `backend/`): ver `backend/README.md`.
Frontend: `cd frontend && pnpm install && pnpm build` (`tsc --noEmit && vite build`).

## Lo que conviene saber

- **API y worker comparten la imagen** `backend/Dockerfile`; solo cambia el comando.
- **El esquema se crea con Alembic**, nunca con `create_all`. El servicio `preparar` corre
  `alembic upgrade head`, crea el bucket y hace la carga inicial (`python -m app.seed`),
  que se puede repetir sin duplicar.
- **La sesión va en la cookie `gastro_sesion`** (HttpOnly, Secure, SameSite=Strict). No hay
  JWT ni header `Authorization`. El frontend usa `fetch` con `credentials: "same-origin"`.
- **Ruta base de la API:** `/api/v1`. Errores siempre como
  `{"error": {"codigo", "mensaje", "id_error"}}`.
- **MinIO tiene dos direcciones:** `S3_ENDPOINT_URL=http://minio:9000` para uso interno y
  `S3_PUBLIC_ENDPOINT_URL=http://localhost:9000` para las URL firmadas que abre el navegador.
- **nginx usa `resolver 127.0.0.11`** para no quedarse con IP viejas al recrear contenedores.
  Su configuración está en `backend/docker/nginx/nginx.conf`.
- **No hay WebSocket.** El resultado del análisis se consulta por HTTP con la cabecera
  `X-Actividad: pasiva`, que no renueva la sesión.

## Convenciones

- `.env` y `backend/.env` están en `.gitignore`; las plantillas son los `.env.example`.
- Código, comentarios y commits en español; nombres del dominio en español.
- `pnpm install --frozen-lockfile` exige el `frontend/pnpm-lock.yaml` versionado.
