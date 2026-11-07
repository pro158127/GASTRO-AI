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
4. El frontend sigue el avance con eventos SSE (`GET /api/v1/eventos`) y consulta el estado
   por HTTP con `X-Actividad-Pasiva: 1`, que no renueva la sesión.

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

Sigue el contrato del frontend (Figma), con dos ajustes del equipo sobre él: todo fallo de
credenciales responde el mismo 401 (no hay 423 ni 403 de «cuenta no disponible») y la etapa
equivocada responde `ETAPA_INVALIDA` con la etapa actual.

Base: **`/api/v1`**. Todo el intercambio es JSON (UTF-8), salvo la carga de imágenes
(multipart) y las descargas (PDF y CSV). Fechas ISO 8601 en UTC.

**Sesión.** El token viaja en la cookie `gastro_sesion` (HttpOnly, Secure, SameSite=Strict).
El frontend nunca lo lee ni lo guarda: no hay `access_token` ni header `Authorization`.
Basta con `fetch(ruta, { credentials: "same-origin" })` pasando por nginx. Cada petición
renueva la inactividad (10 min), salvo las que lleven **`X-Actividad-Pasiva: 1`**
(consultas automáticas).

**Errores.** Siempre con esta forma, sin trazas ni detalles técnicos:

```json
{ "error": { "codigo": "PERMISO_DENEGADO", "mensaje": "No tienes permiso para esta acción.",
             "campos": [{ "campo": "correo", "mensaje": "Este campo es obligatorio." }],
             "id_solicitud": "req_01JC5Z8X9Q2W3E4R5T6Y7U8I9O" } }
```

- `id_solicitud` identifica la petición; queda en el log junto con el detalle técnico.
- `campos` solo aparece cuando el error es de un campo concreto.
- En los **5xx**, `codigo` es un `ERR-xxxx` genérico (W-31: «informe al administrador este
  código»); el mismo `ERR-xxxx` queda en el log con la traza.
- Algunos errores traen datos propios: `motivo` en `SESION_EXPIRADA`, `etapa` en
  `ETAPA_INVALIDA` y `requisitos` en `CONTRASENA_NO_CUMPLE_POLITICA`.

| HTTP | `codigo` | Cuándo · qué hace el frontend |
|---|---|---|
| 400 | `PETICION_INVALIDA` | Petición mal formada |
| 401 | `SESION_EXPIRADA` | Sin cookie, sesión cerrada o vencida → W-01. Con `motivo: "INACTIVIDAD"` → W-01d |
| 401 | `AUTH_CREDENCIALES_INVALIDAS` | Login: correo o contraseña incorrectos, cuenta bloqueada, inactiva o eliminada (siempre el mismo) → W-01b |
| 401 | `TOTP_CODIGO_INVALIDO` | `/auth/totp/verificar`: código incorrecto, vencido o ya usado → W-04b |
| 403 | `AUTH_TEMPORAL_EXPIRADA` | Login con la temporal correcta pero vencida (72 h) → W-01e |
| 403 | `ETAPA_INVALIDA` | Falta un paso del inicio de sesión; trae `etapa` para redirigir |
| 403 | `PERMISO_DENEGADO` | El rol no permite la acción → W-28 (la sesión sigue abierta) |
| 404 | `NO_ENCONTRADO` | No existe o no es del usuario |
| 405 | `METODO_NO_PERMITIDO` | Método HTTP equivocado |
| 409 | `TOTP_NO_INICIADO` | `/auth/totp/vincular` sin haber llamado `/auth/totp/iniciar` |
| 413 | `ARCHIVO_DEMASIADO_GRANDE` | Más de lo permitido |
| 422 | `DATOS_INVALIDOS` | Falta un campo o tiene mal formato (ver `campos`) |
| 422 | `CONTRASENA_NO_CUMPLE_POLITICA` | W-02b: trae `campos` y `requisitos` |
| 422 | `TOTP_CODIGO_INVALIDO` | `/auth/totp/vincular`: el primer código no corresponde → W-03b |
| 429 | `DEMASIADOS_INTENTOS` | Límite por IP en login y códigos (10/min); trae `Retry-After` |
| 5xx | `ERR-xxxx` | W-31 con ese código |

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
| GET | `/health` | Público | — | `{status: "ok"\|"degraded", database: "ok"\|"error"}` |
| POST | `/auth/login` | Público | `{correo, contrasena}` | `200 {etapa}` + cookie |
| POST | `/auth/contrasena/cambiar` | `CAMBIO_CONTRASENA` | `{contrasena_nueva, confirmacion}` | `{etapa}` |
| POST | `/auth/totp/iniciar` | `VINCULAR_TOTP` | — | `{otpauth_uri, secreto_manual, qr_png_base64}` |
| POST | `/auth/totp/vincular` | `VINCULAR_TOTP` | `{codigo}` | `{etapa: "ACTIVA", usuario, ruta_inicial}` |
| POST | `/auth/totp/verificar` | `PENDIENTE_2FA` | `{codigo}` | `{etapa: "ACTIVA", usuario, ruta_inicial}` |
| GET | `/auth/sesion` | Cualquier etapa | — | `{etapa, usuario, inactividad}` |
| POST | `/auth/sesion/continuar` | `ACTIVA` | — | `{ultima_actividad_en}` |
| POST | `/auth/logout` | Cualquiera (o ninguna) | — | `204`, borra la cookie |
| GET | `/perfil` | Cualquier rol | — | `{id, nombre, apellido, correo, telefono, rol: {codigo, nombre}, estado, creado_en, totp_vinculado}` |
| PATCH | `/perfil` | Cualquier rol | `{nombre?, apellido?, telefono?}` | el perfil (correo y rol se ignoran) |
| GET | `/admin/usuarios` | `ADMINISTRADOR` | `?q&rol&estado&excluir&pagina&por_pagina` | `{items, paginacion}` |
| POST | `/admin/usuarios` | `ADMINISTRADOR` | `{nombre, apellido, correo, telefono?, rol}` | `201 {usuario, credencial}` |
| GET | `/admin/usuarios/{id}` | `ADMINISTRADOR` | — | usuario + `casos_activos, totp_vinculado, intentos_fallidos, bloqueado_hasta, envios_credencial` |
| PATCH | `/admin/usuarios/{id}` | `ADMINISTRADOR` | `{nombre?, apellido?, telefono?, correo?}` | `{usuario, credencial?}` |
| POST | `/admin/usuarios/{id}/rol` | `ADMINISTRADOR` | `{rol}` | `{usuario}` |
| POST | `/admin/usuarios/{id}/activar` | `ADMINISTRADOR` | — | `{usuario}` |
| POST | `/admin/usuarios/{id}/desactivar` | `ADMINISTRADOR` | `{destino_id?}` | `{usuario, traslado}` |
| POST | `/admin/usuarios/{id}/eliminar` | `ADMINISTRADOR` | `{destino_id?}` | `{usuario, traslado}` |
| POST | `/admin/usuarios/{id}/reasignar-casos` | `ADMINISTRADOR` | `{destino_id, caso_ids?}` | `{traslado}` |
| POST | `/admin/usuarios/{id}/restablecer-contrasena` | `ADMINISTRADOR` | — | `{usuario, credencial}` |
| POST | `/admin/usuarios/{id}/reenviar-credencial` | `ADMINISTRADOR` | — | `{usuario, credencial}` |
| POST | `/admin/usuarios/{id}/desbloquear` | `ADMINISTRADOR` | — | `{usuario}` |
| GET | `/catalogos/tipos-documento` | Cualquier rol | — | `{items: [{codigo, nombre, longitud_maxima}]}` |
| GET | `/caracteristicas` | Cualquier rol | — | `{items: [{id, codigo, nombre}]}` (solo las activas) |
| POST | `/pacientes/consulta` | `DOCTOR` | `{tipo_documento, numero_documento}` | `{tiene_historial, caso_id, total_analisis, ultimo_analisis_en}` |
| GET | `/admin/configuracion-inferencia` | `ADMINISTRADOR` | — | `{usar_umbral_por_caracteristica, umbral_global, rango, caracteristicas, actualizado_por, actualizado_en}` |
| PUT | `/admin/configuracion-inferencia` | `ADMINISTRADOR` | `{usar_umbral_por_caracteristica, umbral_global, umbrales: [{caracteristica_id, umbral}]}` | igual que el GET |

- `usuario` = `{id, nombre, apellido, rol}`, con `rol` = `DOCTOR` o `ADMINISTRADOR`.
- `ruta_inicial` = `/doctor/dashboard` o `/admin/dashboard`.
- `qr_png_base64` es el PNG en Base64 **sin** el prefijo `data:`; `secreto_manual` es el
  secreto en grupos de 4 para «¿No puede escanear?». Llamar otra vez a `/totp/iniciar`
  genera un secreto nuevo mientras no esté vinculado.
- `inactividad` = `{aviso_en_s: 540, cierre_en_s: 600, ultima_actividad_en}`: segundos
  contados desde `ultima_actividad_en` para el aviso del minuto 9 y el cierre.
- `CONTRASENA_NO_CUMPLE_POLITICA` trae `requisitos`: `[{codigo, cumple}]` con
  `LONGITUD_MINIMA`, `LONGITUD_MAXIMA`, `NO_COMUN`, `SIN_DATOS_PROPIOS`, `NO_FILTRADA` y
  `DISTINTA_A_LA_TEMPORAL`, en ese orden. Si la `confirmacion` no coincide, `campos` lo dice.
- `/auth/logout` responde 204 aunque la sesión ya hubiera vencido.

**Paciente y documento.**

- El documento solo viaja en el cuerpo de un `POST`; nunca en la URL, en la respuesta ni en
  los logs. Se normaliza (sin puntos, espacios ni guiones) y se valida por tipo: **CC hasta
  10 dígitos, TI hasta 11, CE hasta 6**. Mal escrito: `422 DOCUMENTO_INVALIDO` con `campos`
  (`tipo_documento` o `numero_documento`) → W-06e.
- La consulta solo cuenta los casos del doctor que pregunta (propios o recibidos por
  traslado): no revela si el paciente tiene análisis con otros doctores (RF-H01 CA 5).
- nginx limita `/pacientes/consulta` por IP (30/min) para que no se use para adivinar documentos.

**Configuración de inferencia.**

- Todo umbral va de 0.10 a 0.90; fuera de rango: `422 UMBRAL_FUERA_DE_RANGO` con `campos`
  (`umbral_global`, `umbrales[i].umbral`) y `rango`.
- En modo por característica deben venir todas las activas con su umbral, o
  `422 UMBRALES_INCOMPLETOS`. `umbral: null` quita el umbral propio (usa el global).
- Solo afecta análisis futuros: cada resultado guarda el umbral con que se evaluó.

**Usuarios (administrador).**

- `usuario` = `{id, nombre, apellido, correo, telefono, rol, estado, bloqueado, creado_en,
  activado_en, estado_activacion, temporal_expira_en}`. Los dos últimos solo vienen en las
  cuentas `PENDIENTE` (`estado_activacion` = `PENDIENTE` o `EXPIRADA`, RF-U06).
- `credencial` = `{motivo, estado, intentado_en, codigo_error}`; con el correo caído:
  `estado: "FALLIDO"`, `codigo_error: "CORREO_NO_ENVIADO"` → la UI ofrece reenviar. **La
  contraseña temporal nunca viaja en la respuesta**, solo por correo.
- `traslado` = `{id, tipo, casos_trasladados}` o `null`.
- Paginación: `?pagina=1&por_pagina=20` (máximo 100) → `{items, paginacion: {pagina, por_pagina, total}}`.
- Las cuentas eliminadas no salen en la lista salvo `estado=ELIMINADO`. Se pueden consultar,
  pero cualquier cambio sobre ellas responde 404.
- Desactivar, eliminar, restablecer y cambiar el correo cierran las sesiones abiertas de esa
  cuenta. Restablecer, además, desvincula la app autenticadora (RF-U09 CA 9).
- Para elegir el doctor de destino: `GET /admin/usuarios?rol=DOCTOR&estado=ACTIVO&excluir={id}`.

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 409 | `CORREO_YA_REGISTRADO` | Crear o cambiar el correo a uno que ya usa otra cuenta (trae `campos`) |
| 409 | `ULTIMO_ADMINISTRADOR` | Desactivar, eliminar o quitarle el rol al último administrador activo |
| 409 | `DESTINO_REQUERIDO` | Desactivar o eliminar a un doctor con casos activos sin `destino_id` (trae `casos_activos`) |
| 409 | `CASOS_SIN_REASIGNAR` | Pasar a administrador a un doctor que tiene casos activos |
| 409 | `TRANSICION_INVALIDA` | La acción no aplica al estado de la cuenta (p. ej. activar una ACTIVO) |
| 409 | `SIN_CASOS_ACTIVOS` | Reasignar casos de un doctor que no tiene |
| 422 | `DESTINO_INVALIDO` | El destino no es otro doctor ACTIVO |
| 422 | `CASOS_INVALIDOS` | Algún `caso_id` no es un caso activo de ese doctor |

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

### 3.9 Tiempo real (SSE) y seguimiento del análisis

No hay WebSocket. El tiempo real será con **SSE** en `GET /api/v1/eventos` (planeado, llega
con el módulo de análisis): los eventos llevan **solo IDs**, se publican después del commit
y el worker los emite por Redis pub/sub. Además, mientras el análisis está `PROCESANDO`, el
frontend puede consultar `GET /analisis/{id}/estado` con `X-Actividad-Pasiva: 1`, que no
renueva la sesión; así el cierre
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
  lleva al inicio de sesión; un `403 PERMISO_DENEGADO`, a W-28.
- **4.3 Tiempo real:** el WebSocket se retira; llega SSE (ver 3.9).
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
POST /api/v1/auth/contrasena/cambiar {contrasena_nueva, confirmacion} → 200 {etapa: "VINCULAR_TOTP"}
POST /api/v1/auth/totp/iniciar                         → 200 {otpauth_uri, secreto_manual, qr_png_base64}
POST /api/v1/auth/totp/vincular {codigo}               → 200 {etapa: "ACTIVA", usuario, ruta_inicial}
GET  /api/v1/auth/sesion                               → 200 {etapa, usuario, inactividad}
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
