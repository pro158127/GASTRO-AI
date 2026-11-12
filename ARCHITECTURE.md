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

> Estado actual: base de datos (20 tablas), autenticación y sesión, perfil y gestión de
> usuarios, umbrales, carga de imagen, análisis con calidad, clasificación y Grad-CAM,
> explicación con Gemini, observaciones e historial (sección 3.5). Faltan reportes PDF,
> casos recibidos, bitácora y monitoreo, dashboards y SSE.

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
| MinIO | `S3_ENDPOINT_URL` (interno), `S3_PUBLIC_ENDPOINT_URL` (URL firmadas), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_URL_FIRMADA_SEGUNDOS`, `IMAGEN_TEMPORAL_MINUTOS` (30) |
| Seudónimo y TOTP | `HMAC_CLAVES` (JSON con todas las versiones), `HMAC_VERSION_ACTUAL`, `TOTP_CLAVE_CIFRADO` |
| Modelo | `HF_SPACE_URL` (https), `HF_TOKEN`, `HF_REPO`, `HF_REVISION` (SHA fijo), `HF_SHA256`, `HTTP_TIMEOUT_SECONDS` (30), `HF_SIMULADO` (solo desarrollo) |
| Explicación | `LLM_PROVEEDOR` (gemini), `LLM_MODELO` (gemini-3.5-flash), `LLM_RAZONAMIENTO` (LOW), `LLM_API_KEY`, `LLM_TIMEOUT_SECONDS` (15) |
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
  `ETAPA_INVALIDA`, `requisitos` en `CONTRASENA_NO_CUMPLE_POLITICA`, `permitidos` en
  `IMAGEN_FORMATO_NO_PERMITIDO` y `max_bytes` en `IMAGEN_DEMASIADO_PESADA`.

| HTTP | `codigo` | Cuándo · qué hace el frontend |
|---|---|---|
| 400 | `PETICION_INVALIDA` | Petición mal formada |
| 401 | `SESION_EXPIRADA` | Sin cookie, sesión cerrada o vencida → W-01. Con `motivo: "INACTIVIDAD"` → W-01d; con `motivo: "DEMASIADOS_INTENTOS"`, la cuenta quedó bloqueada 15 min (p. ej. al 5.º código TOTP fallido) |
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
| 429 | `DEMASIADOS_INTENTOS` | Límite por IP (10/min) en login, cambio de contraseña y los tres de TOTP; trae `Retry-After` |
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
| GET | `/admin/bitacora` | `ADMINISTRADOR` | `?accion&resultado&actor_id&actor&desde&hasta&pagina&por_pagina` | `{items, paginacion}` |
| GET | `/admin/bitacora/filtros` | `ADMINISTRADOR` | — | `{acciones: [{codigo, texto}], usuarios: [{id, nombre, cuenta_eliminada}]}` |
| GET | `/admin/auditoria/exportar` | `ADMINISTRADOR` | `?desde&hasta` | CSV (`text/csv`) |
| GET | `/catalogos/tipos-documento` | Cualquier rol | — | `{items: [{codigo, nombre, longitud_maxima}]}` |
| GET | `/caracteristicas` | Cualquier rol | — | `{items: [{id, codigo, nombre}]}` (solo las activas) |
| POST | `/pacientes/consulta` | `DOCTOR` | `{tipo_documento, numero_documento}` | `{tiene_historial, caso_id, total_analisis, ultimo_analisis_en}` |
| GET | `/admin/configuracion-inferencia` | `ADMINISTRADOR` | — | `{usar_umbral_por_caracteristica, umbral_global, rango, caracteristicas, actualizado_por, actualizado_en}` |
| PUT | `/admin/configuracion-inferencia` | `ADMINISTRADOR` | `{usar_umbral_por_caracteristica, umbral_global, umbrales: [{caracteristica_id, umbral}]}` | igual que el GET |
| POST | `/imagenes` | `DOCTOR` | multipart, campo `archivo` | `201 {imagen_id, nombre, formato, ancho, alto, peso_bytes, sha256, expira_en}` |
| POST | `/analisis` | `DOCTOR` | `{imagen_id, tipo_documento, numero_documento, confirmacion_documento?}` | `202 {analisis: {id, codigo, estado, solicitado_en}}` |
| GET | `/analisis/{id}/estado` | `DOCTOR` | — | `{estado, etapas, codigo_error?, calidad?, resultado_url?}` |
| GET | `/analisis/{id}` | `DOCTOR` | — | resultado completo (ver «Imagen y análisis») |
| POST | `/analisis/{id}/reintento` | `DOCTOR` | — | `202 {analisis: {id, codigo, estado, solicitado_en}}` |
| GET | `/analisis/{id}/explicacion` | `DOCTOR` | — | `{estado, texto?, generada_en?, codigo_error?, mensaje?, intentos, puede_reintentar}` |
| POST | `/analisis/{id}/explicacion/reintentar` | `DOCTOR` | — | `202 {estado: "PENDIENTE", intentos}` |
| POST | `/analisis/{id}/observaciones` | `DOCTOR` | `{valoracion, texto?}` | `201 {observacion: {id, valoracion, texto, autor, registrada_en}}` |
| GET | `/analisis` | `DOCTOR` | `?pagina&por_pagina&origen&estado&codigo&caracteristica&desde&hasta&orden` | `{items, paginacion}` («Mis análisis») |
| POST | `/pacientes/analisis/buscar` | `DOCTOR` | `{tipo_documento, numero_documento, pagina?, por_pagina?, estado?, orden?}` | `{items, paginacion, caso_id, caso_ids}` |

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

**Imagen y análisis.**

- Dos pasos: `POST /imagenes` valida y guarda la imagen en el área temporal de MinIO
  (`tmp/`, vence a los `IMAGEN_TEMPORAL_MINUTOS`); `POST /analisis` con el `imagen_id` crea
  el análisis y lo encola. Un `imagen_id` sirve una sola vez.
- La imagen se valida por sus bytes, no por el nombre ni el content-type: JPEG o PNG, hasta
  10 MB, al menos 224 × 224 px. Se le quitan EXIF, ICC y textos incrustados, y se gira según
  la orientación EXIF. El `nombre` solo vuelve en la respuesta; no se guarda.
- `confirmacion_documento` solo hace falta si `/pacientes/consulta` dijo
  `tiene_historial=false`: el doctor escribe el número dos veces (RF-D01 CA 12).
- Código del análisis: `A-AAAA-NNNNNN` (año de Colombia, secuencia que no se repite).
- `etapas` = `[{codigo, estado}]` con `ANONIMIZAR`, `CALIDAD`, `CLASIFICAR`, `GRAD_CAM` y
  `estado` ∈ `LISTO | EN_CURSO | PENDIENTE | ERROR`. El polling va con `X-Actividad-Pasiva: 1`.
- Calidad (etapa `CALIDAD`): nitidez (varianza del Laplaciano) ≥ 85, brillo 50–180 y menos
  de 5 % de píxeles saturados. Si no cumple: `FALLIDO`, `codigo_error: "ERR-1001"` y
  `calidad = {suficiente: false, causas, nitidez, brillo, saturados_pct}`, con `causas`
  entre `BORROSA`, `OSCURA` y `MUY_CLARA_O_REFLEJOS` → W-07b.
- `codigo_error` de un análisis fallido: `ERR-1001` calidad insuficiente, `ERR-1002`
  servicio de inferencia no disponible (W-07c), `ERR-1003` cola no disponible, `ERR-1004`
  error interno.
- `GET /analisis/{id}`: `{id, codigo, estado, solicitado_en, completado_en, codigo_error,
  modelo: {repositorio_hf, revision_sha, revision_corta}, imagen: {url, formato, ancho, alto},
  mapa_calor: {url} | null, calidad, caracteristicas: [{id, codigo, nombre, probabilidad,
  umbral_aplicado, supera_umbral}], ninguna_supera_umbral, regiones: [{orden,
  caracteristica_id, caja: {x, y, ancho, alto}, area_porcentaje, confianza, mapa_calor_url}],
  explicacion: {estado, texto, generada_en, intentos} | null, observaciones: [{id, es_mia,
  valoracion, texto, autor, registrada_en}], realizado_por: {nombre, apellido,
  cuenta_eliminada, es_propio}, trasladado: {desde, cuenta_eliminada, fecha} | null, aviso}`.
  Características ordenadas por probabilidad; URL firmadas de 5 min.
- Solo el doctor al que está asignado el caso (propio o recibido por traslado) ve el
  análisis; para cualquier otro es `404`. El administrador recibe `403`.

| HTTP | `codigo` | Cuándo · pantalla |
|---|---|---|
| 404 | `NO_ENCONTRADO` | `imagen_id` de otro doctor, o análisis ajeno o inexistente |
| 410 | `IMAGEN_EXPIRADA` | La imagen temporal venció o ya se usó → cargarla de nuevo |
| 413 | `IMAGEN_DEMASIADO_PESADA` | Más de 10 MB; trae `max_bytes` → W-06d |
| 415 | `IMAGEN_FORMATO_NO_PERMITIDO` | No es JPEG ni PNG (DICOM incluido); trae `permitidos` → W-06c |
| 422 | `IMAGEN_ILEGIBLE` | Archivo dañado o imagen desmesurada |
| 422 | `IMAGEN_RESOLUCION_INSUFICIENTE` | Menos de 224 × 224; trae `minimo` |
| 422 | `DOCUMENTO_INVALIDO` | Tipo o número mal escrito (`campos`) → W-06e |
| 422 | `DOCUMENTO_NO_COINCIDE` | Paciente nuevo sin confirmación o con otro número → W-06k |
| 503 | `SERVICIO_NO_DISPONIBLE` | No hay modelo vigente o la cola no responde |
| 409 | `NO_REINTENTABLE` | `/reintento` de un análisis que no está `FALLIDO`, o que falló por calidad (`ERR-1001`: cargar otra imagen) |

**Explicación (Gemini).**

- Llega después del resultado y no lo bloquea (RF-R05 CA 3): el análisis queda `COMPLETADO`
  aunque Gemini falle. Polling de `GET /analisis/{id}/explicacion` con `X-Actividad-Pasiva: 1`
  hasta que salga de `PENDIENTE` (máximo 15 s) → W-08c.
- `estado` ∈ `PENDIENTE | GENERADA | FALLIDA | RECHAZADA`. `FALLIDA` (`ERR-3001`: Gemini no
  respondió o tardó más de 15 s) y `RECHAZADA` (`ERR-3002`: el texto no pasó la validación)
  traen `mensaje` estándar y `puede_reintentar` → W-08d.
- A Gemini solo le llegan nombre, probabilidad y umbral en %, si lo supera, y cada región
  descrita en palabras («zona superior izquierda») con su % del área. Nunca la imagen, los
  mapas ni coordenadas (RF-R05 CA 2). Eso mismo queda en `ExplicacionLlm.datos_enviados`.
- Antes de mostrarse, el texto se valida: entre 40 y 1500 caracteres, sin porcentajes que no
  estén en los datos y sin términos como cáncer, tratamiento o biopsia.
- Reintento: máximo 3 intentos en total. `409 EXPLICACION_NO_REINTENTABLE` si ya está
  `GENERADA` o sigue `PENDIENTE`; `429 REINTENTOS_AGOTADOS` (trae `max_intentos`) al tercero.

**Observaciones (RF-D04).**

- `valoracion` ∈ `COINCIDE | NO_COINCIDE | NO_CONCLUYENTE`; `texto` opcional, hasta 2000
  caracteres (en blanco se guarda como `null`).
- Una por doctor y análisis, y no se edita: `409 OBSERVACION_YA_REGISTRADA`. El doctor que
  recibe un caso trasladado agrega la suya sin tocar la del doctor de origen (RF-A07 CA 3).
- Solo sobre un resultado: `409 ANALISIS_NO_COMPLETADO`. Análisis ajeno: `404`.
- Se ven en `GET /analisis/{id}` → `observaciones`, con `es_mia`.

**Historial (RF-H01).**

- Las dos listas muestran los análisis de los **casos asignados al doctor**: los propios y los
  recibidos por traslado. Nunca llevan datos del paciente.
- Fila: `{id, codigo, solicitado_en, estado, caracteristicas_que_superan, caracteristica_principal,
  probabilidad_principal, tiene_observacion, observacion, modelo_revision, trasladado,
  realizado_por: {nombre, apellido, cuenta_eliminada}}`. `caracteristica_principal: null` =
  «Sin característica sobre el umbral»; `observacion` es la valoración del doctor que consulta.
- **«Mis análisis»** (`GET /analisis`): los más recientes primero. Filtros: `origen`
  (`todos | propios | recibidos`), `estado`, `codigo` (prefijo), `caracteristica` (código; solo
  donde supera el umbral), `desde` y `hasta` (días de Colombia, ambos incluidos; al revés da
  `422 RANGO_FECHAS_INVALIDO`) y `orden` (`-solicitado_en` o `solicitado_en`).
- **«Buscar por paciente»** (`POST /pacientes/analisis/buscar`): el documento va en el cuerpo.
  Orden cronológico (el más antiguo primero) salvo `orden: "-solicitado_en"`. Paciente ajeno o
  inexistente: `200` con `items: []` y `caso_id: null`, sin revelar nada (RF-H01 CA 5).
  `caso_id` es el caso más reciente (para «Descargar reporte de este paciente»); `caso_ids`, todos.
- nginx limita la búsqueda por paciente igual que `/pacientes/consulta` (30/min por IP).

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

**Bitácora (RF-A02, RNF-05).**

- Solo lectura y solo para el administrador: no existe ningún endpoint para editarla o borrarla,
  y la base de datos además lo impide.
- Entrada: `{id, ocurrido_en, actor, accion, accion_texto, resultado, objetivo, detalle, ip}`.
  `id` va como texto. `actor` y `objetivo` = `{id, nombre, apellido, cuenta_eliminada}`;
  `actor` es `null` en intentos sin sesión (correo inexistente) y `objetivo` es la cuenta sobre
  la que se hizo la acción. `detalle` es un texto armado por el backend (por ejemplo «Rechazado:
  contraseña incorrecta» o «Umbral global 0.5000 → 0.6000»); nunca trae contraseñas, secretos
  ni datos de pacientes.
- Filtros: `accion`, `resultado` (`EXITO | FALLO`), `actor_id` o `actor` (parte del nombre),
  `desde` y `hasta` (días de Colombia). Lo más reciente primero; 25 por página por defecto.
- **Exportar** (`/admin/auditoria/exportar`, RF-DB02 CA 7 y 10): CSV con `fecha_hora, usuario,
  evento, resultado, ip` de la creación de cuentas y del segundo factor (`CUENTA_CREADA`,
  `ENVIO_CREDENCIAL`, `VINCULACION_TOTP`, `VERIFICACION_2FA`). Período obligatorio de máximo 366
  días (`422 PERIODO_INVALIDO`, trae `max_dias`). Va con BOM para que Excel abra bien las tildes,
  neutraliza fórmulas en las celdas y queda registrada en la bitácora (`AUDITORIA_EXPORTADA`).

**Planeados** (detalle en la especificación del equipo): reportes PDF, casos recibidos del lado
del doctor, dashboards, bitácora, monitoreo y SSE.

### 3.6 Capa de servicios (`app/services/`)

Las reglas del negocio viven aquí y reciben sus dependencias por el constructor, para
probarlas sin base de datos (RNF-19).

- `autenticacion.py`: login, segundo factor, cambio de temporal, vinculación TOTP, control
  de la sesión e inactividad, bloqueo tras 5 fallos (15 min).
- `politica_contrasena.py`: 12 a 64 caracteres, sin reglas de composición; rechaza las
  comunes, las obvias, las que llevan el correo o el nombre de la app, y las filtradas.
- `auditoria.py`: bitácora con patrón Observador. El evento rechaza en `detalle` cualquier
  dato del paciente, resultado clínico o secreto.
- `bitacora.py`: consulta y exportación de la bitácora, con los textos de cada acción.
- `verificadores_imagen.py`: cadena de responsabilidad peso → formato → resolución, y la
  limpieza de metadatos.
- `imagenes.py`: área temporal de las imágenes cargadas (dueño y vencimiento).
- `analisis.py`: fachada `ServicioAnalisis` (documento → seudónimo → caso → análisis →
  cola, con candado por paciente) y proxy `ProxyAccesoAnalisis` (solo el doctor del caso).
- `historial.py` (+ `repositories/historial_repository.py`): «Mis análisis» y «Buscar por
  paciente», siempre por el caso asignado al doctor.
- `calidad_imagen.py` y `procesamiento.py`: lo que corre el worker, etapa por etapa.
- `explicacion.py`: arma el resumen para Gemini, valida el texto y maneja los reintentos.
- `clasificacion.py`: llama al Space, comprueba la revisión, sube los mapas de calor, aplica
  la estrategia de umbral (`politica_umbral.py`) y copia el umbral en cada resultado.

Cuando un fallo debe quedar guardado antes de responder error (intentos fallidos), el
servicio confirma con la unidad de trabajo (`repositories/unidad_trabajo.py`).

### 3.7 Adaptadores (`app/adapters/`)

- `almacen.py`: MinIO por boto3, con dos clientes: el interno (`minio:9000`) sube y lee; el
  público firma URL con el host que alcanza el navegador (5 min de vigencia).
- `llm.py`: Gemini (`google-genai`) con salida JSON, timeout de 15 s y sin reintentos
  automáticos. Rechaza cualquier imagen o mapa de calor en lo que se le envía.
- `inferencia.py`: Space privado de Hugging Face por HTTPS con token (contrato abajo) y un
  simulador solo para desarrollo (`HF_SIMULADO=true`).
- `cola.py`: encola en Celery por nombre de tarea; si Redis no responde en 3 s, el análisis
  queda `FALLIDO` (`ERR-1003`) y la API responde 503.
- `filtraciones.py`: Have I Been Pwned por k-anonimato (solo sale el inicio del SHA-1). Si
  no responde, el cambio de contraseña no se bloquea.

### 3.8 Worker (`app/workers/celery_app.py`)

Celery con Redis como intermediario. Comando en compose:
`celery -A app.workers.celery_app worker --loglevel=info` (en Windows, `--pool=solo`).
Tarea `gastroia.procesar_analisis` (`app/workers/tareas.py`, con `acks_late`), etapa por
etapa:

1. **ANONIMIZAR:** revisa que la imagen guardada siga sin metadatos.
2. **CALIDAD:** nitidez, brillo y reflejos; si no cumple, `FALLIDO` con `ERR-1001`.
3. **CLASIFICAR:** llama al Space (30 s). Si no responde, tarda, contesta fuera del contrato,
   trae otra revisión del modelo (RNF-29) o no trae exactamente las características activas:
   `FALLIDO` con `ERR-1002` (W-07c).
4. **GRAD_CAM:** decodifica los mapas y los sube a MinIO (`mapas/{analisis}/{codigo}-{orden}.png`),
   guarda resultados (con el umbral de ese momento) y regiones, y deja el análisis `COMPLETADO`.
5. **Explicación:** con el resultado ya guardado, pide el texto a Gemini (15 s) y lo valida.
   Los reintentos (ANA-04) van por la tarea `gastroia.explicar_analisis`.

Cada inferencia deja un renglón en `LogInferencia` (estado `EXITO`, `ERROR` o
`TIEMPO_AGOTADO`, latencia y el motivo técnico), sin datos clínicos (RF-M03).

**Contrato con el Space de Hugging Face** (lo implementa el equipo de ML):

```
POST {HF_SPACE_URL}/clasificar
Authorization: Bearer {HF_TOKEN}
multipart/form-data, campo «imagen» (JPEG o PNG ya sin metadatos)

200 {"revision_sha": "<40 hex>", "latencia_ms": 1840,
     "caracteristicas": [{"codigo": "ATROFIA", "probabilidad": 0.8734,
       "regiones": [{"x": 0.31, "y": 0.22, "ancho": 0.18, "alto": 0.20,
                     "area_pct": 14.2, "mapa_calor_base64": "<PNG en Base64>"}]}]}
```

- Códigos de característica iguales a los del catálogo (`ATROFIA`, `GASTRITIS`, `HPYLORI`).
- Probabilidades y caja de 0 a 1 (caja relativa a la imagen), `area_pct` de 0 a 100,
  hasta 10 regiones por característica, mapas en PNG.
- `revision_sha` = el commit cargado en el Space; debe ser igual a `HF_REVISION`.
- El Space debe ser privado y no guardar ni registrar las imágenes (RNF-30).

### 3.9 Tiempo real (SSE) y seguimiento del análisis

No hay WebSocket. El tiempo real será con **SSE** en `GET /api/v1/eventos` (planeado): los eventos llevan **solo IDs**, se publican después del commit
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
| `/api/v1/auth/login`, `contrasena/cambiar` y `totp/*` | `api:8000` | Límite 10/min por IP (ráfaga 5) |
| `/api/v1/pacientes/consulta` y `/pacientes/analisis/buscar` | `api:8000` | Límite 30/min por IP (ráfaga 10) |
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
