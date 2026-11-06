# Documento de Contexto Técnico — Gastro-AI

> Guía de referencia para que cualquier persona o IA pueda trabajar en el proyecto sin
> perderse: cómo se accede a cada componente, qué hace cada módulo y cómo están
> conectados. Complementa a `README.md` (orientado a GitHub) y `AGENTS.md` (resumen
> operativo para agentes). **La sección 3.5 es el contrato de la API que usa el frontend.**

---

## 1. Visión general

1. El **frontend** (React) inicia sesión en dos pasos (contraseña y código TOTP); la sesión
   queda en la cookie `gastro_sesion`.
2. El doctor sube una imagen con el tipo y número de documento del paciente. La **API**
   valida la imagen, calcula el seudónimo HMAC (el documento nunca se guarda), sube la
   imagen sin EXIF a MinIO, crea el análisis y responde **202** con su código `A-AAAA-NNNNNN`.
3. El **worker** (Celery) llama al Space privado de Hugging Face, guarda resultados y mapas
   de calor y, **después**, pide la explicación a Gemini enviándole solo el JSON de
   probabilidades y regiones.
4. El frontend consulta el estado por HTTP con `X-Actividad: pasiva` hasta que termina.

```
Navegador → nginx :80 →  /         → frontend (React estático)
                         /api/v1/* → api (FastAPI :8000)
api → encola → redis → worker (Celery) → Space HF / Gemini
api, worker → postgres (datos) + minio (archivos)
```

> Estado actual: están la base de datos completa (20 tablas), la autenticación y la sesión
> (sección 3.5). Los demás módulos se agregan en los siguientes pull requests.

---

## 2. Puesta en marcha y accesos

### 2.1 Comandos Docker

```bash
cp backend/.env.example backend/.env   # una vez
docker compose up -d --build           # construir y arrancar todo
docker compose ps
docker compose logs -f api
docker compose logs -f worker
docker compose restart nginx           # tras cambiar backend/docker/nginx/nginx.conf
docker compose down                    # agregar -v borra los volúmenes
```

El servicio `preparar` corre antes que la API: `alembic upgrade head`, crea el bucket y
hace la carga inicial. Termina con estado `Exited (0)`; eso es lo esperado.

### 2.2 URLs y puertos (host)

| Servicio | URL | Notas |
|---|---|---|
| Web (SPA + API) | `http://localhost` | Punto de entrada único (nginx) |
| Salud de la API | `http://localhost/api/v1/health` | `{"status","database"}` |
| Documentación de la API | `http://localhost:8000/docs` | Swagger de FastAPI; solo con `backend/docker-compose.yml` o con uvicorn local |
| MinIO (API S3) | `http://localhost:9000` | El navegador abre aquí las URL firmadas |
| MinIO (consola) | `http://localhost:9001` | Solo ver archivos (edición comunitaria) |
| PostgreSQL | `localhost:5432` | Para DBeaver o psql |

### 2.3 Credenciales de desarrollo

Todas salen de `backend/.env` (plantilla `backend/.env.example`):

| Recurso | Variables |
|---|---|
| Primer administrador | `ADMIN_CORREO` / `ADMIN_TEMPORAL` (temporal: se cambia en el primer ingreso) |
| PostgreSQL | `POSTGRES_USER` / `POSTGRES_PASSWORD` |
| MinIO | `S3_ACCESS_KEY` / `S3_SECRET_KEY` |

---

## 3. Backend (`backend/`)

### 3.1 Estructura (Controlador → Servicio → Repositorio)

```
backend/
├── Dockerfile               # imagen de api, worker y preparar
├── docker-compose.yml       # solo el backend, para trabajar sin el frontend
├── alembic/                 # migraciones (0001 tablas, 0002 restricciones) + sql/
├── docker/minio/            # MinIO compilado desde el código oficial
├── docker/nginx/nginx.conf  # puerta de entrada (la usan los dos compose)
├── scripts/init_storage.py  # crea el bucket
└── app/
    ├── main.py              # FastAPI, manejadores de error y routers
    ├── seed.py              # carga inicial (python -m app.seed)
    ├── api/routers/         # controladores: HTTP, cookie y validación. Sin SQL
    ├── api/deps.py          # inyección: sesión de BD, sesión de usuario, etapa y rol
    ├── schemas/             # JSON de entrada y salida (Pydantic)
    ├── services/            # reglas del negocio; no importan FastAPI ni escriben SQL
    ├── repositories/        # única capa que usa la sesión de SQLAlchemy
    ├── models/              # 20 tablas en 5 módulos + base.py
    ├── adapters/            # Gemini, MinIO (S3) y contraseñas filtradas (HIBP)
    ├── workers/             # Celery
    └── core/                # configuración, base de datos, errores y seguridad
```

### 3.2 Configuración (`app/core/config.py`)

`Settings` (pydantic-settings) lee `backend/.env` o variables de entorno. Toda variable
nueva va en `config.py` **y** en `.env.example` con un valor de ejemplo. Grupos:

| Grupo | Variables |
|---|---|
| Base de datos y cola | `DATABASE_URL`, `REDIS_URL` |
| MinIO | `S3_ENDPOINT_URL` (interno), `S3_PUBLIC_ENDPOINT_URL` (URL firmadas), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_URL_FIRMADA_SEGUNDOS` |
| Seudónimo y TOTP | `HMAC_CLAVES` (JSON con todas las versiones), `HMAC_VERSION_ACTUAL`, `TOTP_CLAVE_CIFRADO` |
| Modelo | `HF_SPACE_URL`, `HF_TOKEN`, `HF_REPO`, `HF_REVISION` (SHA fijo), `HF_SHA256` |
| Explicación | `LLM_PROVEEDOR` (gemini), `LLM_MODELO`, `LLM_API_KEY`, `LLM_TIMEOUT_SECONDS` (15) |
| Sesión y bloqueo | `SESION_INACTIVIDAD_MINUTOS` (10), `BLOQUEO_INTENTOS` (5), `BLOQUEO_MINUTOS` (15) |
| Contraseñas filtradas | `CONTRASENAS_FILTRADAS_ACTIVO`, `..._URL`, `..._TIMEOUT_SECONDS` |
| Primer administrador | `ADMIN_CORREO`, `ADMIN_TEMPORAL` |
| Correo | `SMTP_*` |

### 3.3 Base de datos

PostgreSQL 16 con SQLAlchemy 2.0 (estilo `Mapped`) y psycopg 3. El esquema se crea **solo
con Alembic**:

- `0001_inicial`: las 20 tablas y los 17 tipos ENUM.
- `0002_restricciones`: ejecuta `alembic/sql/restricciones.sql` — CHECK de rangos, un solo
  modelo vigente, bitácora inmutable (solo INSERT y SELECT), seudónimo y caso de un
  análisis inmutables, y la secuencia `analisis_codigo_seq`.

### 3.4 Modelos (`app/models/`)

| Módulo | Archivo | Tablas |
|---|---|---|
| 1 · Usuarios y acceso | `usuarios.py` | Rol, Usuario, Sesion, EnvioCredencial |
| 2 · Casos y análisis | `analisis.py` | CasoPaciente, Analisis, ResultadoCaracteristica, RegionInteres, ExplicacionLlm, ObservacionProfesional |
| 3 · Modelo y configuración | `modelo.py` | Caracteristica, ModeloDesplegado, MetricaModelo, ConfiguracionInferencia |
| 4 · Reportes | `reportes.py` | Reporte, ReporteAnalisis |
| 5 · Auditoría y trazabilidad | `auditoria.py` | Bitacora, LogInferencia, Traslado, TrasladoCaso |

No existe ninguna columna con el documento del paciente: solo el seudónimo HMAC y la
versión de la clave con que se calculó.

### 3.5 Contrato de la API

Base: **`/api/v1`**. Todo el intercambio es JSON (UTF-8), salvo la carga de imágenes
(multipart) y las descargas (PDF y CSV).

**Sesión.** El token viaja en la cookie `gastro_sesion` (HttpOnly, Secure, SameSite=Strict).
El frontend nunca lo lee ni lo guarda: no hay `access_token` ni header `Authorization`.
Basta con `fetch(ruta, { credentials: "same-origin" })` pasando por nginx. Cada petición
renueva la inactividad (10 min), salvo las que lleven `X-Actividad: pasiva`.

**Errores.** Siempre con esta forma, sin trazas ni detalles técnicos:

```json
{ "error": { "codigo": "SIN_PERMISO", "mensaje": "No tienes permiso para esta acción.", "id_error": "ERR-7F3A" } }
```

`id_error` es el código que el usuario le dicta al administrador; el mismo queda en el log.

| HTTP | `codigo` | Qué hace el frontend |
|---|---|---|
| 401 | `SIN_SESION`, `SESION_VENCIDA` | Ir a «Iniciar sesión» |
| 401 | `CREDENCIALES_INVALIDAS` | Mensaje genérico de W-01 (mismo para correo, contraseña, cuenta inactiva o bloqueada) |
| 401 | `TEMPORAL_EXPIRADA` | W-01e: pedir una nueva al administrador |
| 401 | `CODIGO_INVALIDO` | Código TOTP incorrecto, vencido o ya usado |
| 403 | `ETAPA_INVALIDA` | Falta un paso del inicio de sesión (consultar `GET /auth/sesion`) |
| 403 | `SIN_PERMISO` | W-28 «Sin permisos» |
| 404 | `NO_ENCONTRADO` | No existe o no es del usuario |
| 422 | `DATOS_INVALIDOS`, `CONTRASENA_DEBIL` | Revisar los campos |
| 5xx | `ERROR_INTERNO` | W-31 con el `id_error` |

**Etapas del inicio de sesión.**

```
login ─┬─ contraseña temporal ──► CAMBIO_CONTRASENA ─► VINCULAR_TOTP (o PENDIENTE_2FA) ─► ACTIVA
       ├─ sin app vinculada ────► VINCULAR_TOTP ─────────────────────────────────────────► ACTIVA
       └─ con app vinculada ────► PENDIENTE_2FA ─────────────────────────────────────────► ACTIVA
```

Cada etapa solo abre sus endpoints; el resto del sistema exige `ACTIVA`. Roles: `DOCTOR` y
`ADMINISTRADOR`, leídos de la base en cada petición.

**Endpoints disponibles.**

| Método | Ruta | Etapa o rol | Cuerpo | Respuesta |
|---|---|---|---|---|
| GET | `/health` | Público | — | `{status, database}` |
| POST | `/auth/login` | Público | `{correo, contrasena}` | `200 {etapa}` + cookie |
| POST | `/auth/2fa` | `PENDIENTE_2FA` | `{codigo}` | `{etapa: "ACTIVA", usuario}` |
| POST | `/auth/contrasena-temporal` | `CAMBIO_CONTRASENA` | `{nueva_contrasena}` (12 a 64) | `{etapa}` |
| POST | `/auth/totp/vinculacion` | `VINCULAR_TOTP` | — | `{otpauth_uri, qr_png, clave_texto}` |
| POST | `/auth/totp/confirmacion` | `VINCULAR_TOTP` | `{codigo}` | `{etapa: "ACTIVA", usuario}` |
| GET | `/auth/sesion` | Cualquier etapa | — | `{etapa, vence_en, usuario}` |
| POST | `/auth/sesion/actividad` | `ACTIVA` | — | `{vence_en}` |
| POST | `/auth/logout` | Cualquiera (o ninguna) | `{motivo: "manual" \| "inactividad"}` opcional | `204`, borra la cookie |

`usuario` = `{id, nombre, apellido, rol}`. `qr_png` es un `data:image/png;base64,…`;
`clave_texto` es la clave en grupos de 4, como alternativa accesible al QR. `vence_en`
sirve para mostrar la advertencia del minuto 9.

**Planeados** (detalle en la especificación del equipo): perfil, gestión de usuarios,
traslados, pacientes y análisis (`POST /analisis` → 202), explicación, observaciones,
historial, reportes PDF, dashboards, configuración de inferencia, bitácora y monitoreo.

### 3.6 Capa de servicios (`app/services/`)

Las reglas del negocio viven aquí y reciben sus dependencias por el constructor, para
probarlas sin base de datos (RNF-19).

- `autenticacion.py`: login, segundo factor, cambio de temporal, vinculación TOTP, control
  de la sesión e inactividad, bloqueo tras 5 fallos (15 min).
- `politica_contrasena.py`: 12 a 64 caracteres, sin reglas de composición; rechaza las
  comunes, las obvias, las que llevan el correo o el nombre de la app, y las filtradas.
- `auditoria.py`: bitácora con patrón Observador. El evento rechaza en `detalle` cualquier
  dato del paciente, resultado clínico o secreto.

Cuando un fallo debe quedar guardado antes de responder error (intentos fallidos), el
servicio confirma con la unidad de trabajo (`repositories/unidad_trabajo.py`).

### 3.7 Adaptadores (`app/adapters/`)

- `almacen.py`: MinIO por boto3, con dos clientes: el interno (`minio:9000`) sube y lee; el
  público firma URL con el host que alcanza el navegador (5 min de vigencia).
- `llm.py`: Gemini (`google-genai`) con salida JSON, timeout de 15 s y sin reintentos
  automáticos. Rechaza cualquier imagen o mapa de calor en lo que se le envía.
- `filtraciones.py`: Have I Been Pwned por k-anonimato (solo sale el inicio del SHA-1). Si
  no responde, el cambio de contraseña no se bloquea.

### 3.8 Worker (`app/workers/celery_app.py`)

Celery con Redis como intermediario. Comando en compose:
`celery -A app.workers.celery_app worker --loglevel=info` (en Windows, `--pool=solo`).
Las tareas de inferencia y explicación llegan con el módulo de análisis.

### 3.9 Seguimiento del análisis (sin WebSocket)

No hay WebSocket. Mientras el análisis está `PROCESANDO`, el frontend consulta su estado y
la explicación por HTTP con `X-Actividad: pasiva`, que no renueva la sesión; así el cierre
por inactividad sigue funcionando aunque la pantalla esté esperando.

### 3.10 Migraciones y carga inicial

```bash
cd backend
alembic upgrade head          # aplica 0001 y 0002
python -m app.seed            # roles, características, umbral 50 %, modelo vigente, primer admin
alembic revision --autogenerate -m "descripcion"   # cuando cambie un modelo
```

Nunca `create_all`. Un modelo nuevo se importa en `app/models/__init__.py` para que Alembic
lo vea.

### 3.11 Cómo añadir una funcionalidad nueva (backend)

1. Modelo en `app/models/` (si hace falta) y migración con Alembic.
2. Repositorio en `app/repositories/` (la única capa con SQL).
3. Servicio en `app/services/`, con dependencias por el constructor.
4. Esquemas en `app/schemas/`.
5. Router en `app/api/routers/`, registrado en `app/main.py`, con `SesionDoctor`,
   `SesionAdmin` o `SesionActiva` de `app/api/deps.py`.
6. Errores con `ErrorApi(estado, codigo, mensaje)`; acciones críticas a la bitácora con
   `EventoAuditoria`.

---

## 4. Frontend (`frontend/`)

La estructura y las convenciones del frontend las mantiene su equipo (`frontend/CLAUDE.md`).
Lo que cambia del lado del backend:

- **4.2 Cliente HTTP:** las rutas pasan a `/api/v1/...`. Sin token en `localStorage` ni
  header `Authorization`: la cookie viaja sola con `credentials: "same-origin"`. Un `401`
  lleva al inicio de sesión; un `403 SIN_PERMISO`, a W-28.
- **4.3 Tiempo real:** el WebSocket se retira; ver 3.9.
- **4.4 Tipos:** los campos del usuario son `nombre`, `apellido` y `rol` (`DOCTOR` |
  `ADMINISTRADOR`).
- **Desarrollo con `pnpm dev`:** apuntar el proxy de `/api` a `http://localhost` (nginx) y
  entrar por `http://localhost:5173`. Los navegadores aceptan la cookie `Secure` en
  `localhost`.

---

## 5. Acceso a cada componente de infraestructura

### 5.1 PostgreSQL

- Dentro de Docker: `postgres:5432`; desde el host: `localhost:5432`.
- `docker compose exec postgres psql -U gastroia -d gastroia`
- En el código, solo a través de los repositorios.

### 5.2 MinIO

- Interno `minio:9000`; público `localhost:9000`; consola `localhost:9001`.
- Bucket `gastroia-imagenes`, creado por `preparar` (`python -m scripts.init_storage`).
- Se compila desde el código oficial (`backend/docker/minio/Dockerfile`, versión
  RELEASE.2025-10-15T17-29-55Z) porque ya no hay imágenes ni binarios publicados.

### 5.3 Redis

- Solo interno (`redis:6379`), con AOF para no perder tareas en cola.

### 5.4 nginx (`backend/docker/nginx/nginx.conf`)

| Ruta | Destino | Notas |
|---|---|---|
| `/api/` | `api:8000` | `X-Forwarded-For` para la IP de la bitácora |
| `/` | `frontend:80` | SPA compilada |

`client_max_body_size 12m` (la API rechaza por encima de 10 MB con su propio 413 en JSON).
`resolver 127.0.0.11` evita los 502 al recrear contenedores.

---

## 6. Flujo de ejemplo (primer ingreso)

```
POST /api/v1/auth/login {correo, contrasena}          → 200 {etapa: "CAMBIO_CONTRASENA"} + cookie
POST /api/v1/auth/contrasena-temporal {nueva_contrasena} → 200 {etapa: "VINCULAR_TOTP"}
POST /api/v1/auth/totp/vinculacion                     → 200 {otpauth_uri, qr_png, clave_texto}
POST /api/v1/auth/totp/confirmacion {codigo}           → 200 {etapa: "ACTIVA", usuario}
GET  /api/v1/auth/sesion                               → 200 {etapa, vence_en, usuario}
POST /api/v1/auth/logout {motivo: "manual"}            → 204 (la sesión queda cerrada en el servidor)
```

---

## 7. Notas operativas

- **Imagen compartida:** `api`, `worker` y `preparar` usan `backend/Dockerfile`.
- **Dos compose:** el de la raíz levanta todo; `backend/docker-compose.yml` levanta solo el
  backend (con la API también en `localhost:8000`). No se corren los dos a la vez: comparten
  puertos.
- **URL firmadas:** usan `S3_PUBLIC_ENDPOINT_URL`; si cambia el dominio, se ajusta esa
  variable. La región es `us-east-1` y no se toca.
- **Datos reales pendientes:** los `HF_*` llegan cuando el equipo de ML publique el modelo;
  hasta entonces la carga inicial usa valores de ejemplo.
- **Pruebas:** las construye el equipo de calidad (RNF-20 pide cobertura ≥ 70 % y CI).
