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
> explicación con Gemini, observaciones, historial y casos recibidos (sección 3.5). Faltan
> reportes PDF, bitácora y monitoreo, dashboards y SSE.

---

## 2. Puesta en marcha y accesos

### 2.1 Comandos Docker

```bash
cp backend/.env.example backend/.env   # una vez
docker compose up -d --build           # construir y arrancar todo
docker compose ps
docker compose logs -f api
docker compose logs -f worker
docker compose restart nginx           # tras cambiar backend/docker/nginx/*.conf
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

### 2.4 Producción (servidor)

```bash
cp .env.example .env                   # en la raíz; llenar las variables de producción
cp backend/.env.example backend/.env   # claves HMAC, TOTP, HF, LLM, SMTP_USUARIO/CONTRASENA…
# Certificado: fullchain.pem y privkey.pem en backend/docker/nginx/certs/ (fuera de git)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`docker-compose.prod.yml` va encima del de desarrollo y solo cambia esto:

- **HTTPS (RNF-02):** nginx usa `nginx.prod.conf`. El 80 redirige a https, el 443 sirve la
  SPA y la API (HTTP/2, HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`) y el 9000
  sirve MinIO por https solo para abrir las URL firmadas. Sin https la app no funciona: la
  cookie de sesión es `Secure`.
- **Puertos:** solo nginx publica (80, 443 y 9000). Postgres, Redis, MinIO, su consola y la
  API quedan dentro de la red de Docker.
- **Sin valores de desarrollo:** `POSTGRES_PASSWORD`, `S3_SECRET_KEY`,
  `S3_PUBLIC_ENDPOINT_URL` (`https://<dominio>:9000`) y `SMTP_HOST` son obligatorias; si
  falta una, compose no arranca y dice cuál.
- **Correo real:** sin Mailpit; `SMTP_STARTTLS=true` y puerto 587 por defecto.
- **Reinicio:** todos los servicios con `restart: unless-stopped`.
- **`ENVIRONMENT=production`:** el backend (API, worker y `preparar`) no arranca si falta
  o queda con valor de desarrollo alguna de: `HMAC_CLAVES` (con la versión actual),
  `TOTP_CLAVE_CIFRADO` (32 bytes en Base64), `HF_SPACE_URL` (https), `HF_TOKEN`,
  `GASTROAI_API_KEY`, `HF_REVISION` (SHA de 40), `HF_SHA256` (64 hex), `S3_SECRET_KEY`, `S3_PUBLIC_ENDPOINT_URL` (https) y la
  contraseña de `DATABASE_URL`. Tampoco con `HF_SIMULADO=true`. El error nombra las
  variables, nunca sus valores.

Las rutas de nginx son las mismas en los dos ambientes (`backend/docker/nginx/rutas.conf`);
`nginx.conf` (desarrollo) y `nginx.prod.conf` (producción) solo cambian lo de alrededor.

### 2.5 Respaldo y restauración (RNF-26)

```bash
# Desde la raíz, con el stack arriba (en producción, con los dos -f del §2.4)
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"   backend/scripts/respaldar.sh /srv/respaldos        # RESPALDOS_A_CONSERVAR=7 borra los viejos
# En un servidor limpio (base vacía), con el mismo .env y backend/.env
COMPOSE="…" backend/scripts/restaurar.sh /srv/respaldos/gastroai-20261117T030000Z
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Cada respaldo es una carpeta `gastroai-<fecha UTC>/` con:

| Archivo | Qué es |
|---|---|
| `base.dump` | `pg_dump` (formato custom): cuentas, análisis, bitácora, logs de inferencia, métricas y modelo desplegado |
| `archivos.tar` | imágenes y mapas de MinIO con su tipo y metadatos, más `indice.json` con la huella de cada uno (sin `tmp/`) |
| `pesos.bin` | copia de los pesos, solo si `HF_PESOS_ARCHIVO` está configurado; se baja con la revisión fija y se verifica contra `HF_SHA256` |
| `manifiesto.json` | conteos por tabla, huella SHA-256 de la bitácora completa, modelo vigente y resumen de los archivos |
| `SHA256SUMS` | huellas de todo lo anterior |

- **Consistencia:** el manifiesto se toma antes y después del `pg_dump`; si la base cambió en
  medio, se repite (hasta 3 veces).
- **Verificación al restaurar:** se revisan las huellas, se restaura y se recalcula el
  manifiesto. Tiene que coincidir todo: conteos, bitácora entrada por entrada (RNF-05) y
  archivos. Si algo no cuadra, el script lo dice y sale con error.
- **Seguridad:** `restaurar.sh` se niega a correr si la base ya tiene tablas (nunca pisa una
  instalación en uso). El respaldo trae seudónimos, hashes e imágenes: dato personal
  protegido (Ley 1581). Queda solo legible por el dueño (`umask 077`); guárdalo cifrado y
  fuera del servidor.
- Las piezas que corren dentro del contenedor están en `scripts/respaldo.py` (todo por
  stdin/stdout, sin montar carpetas).

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
├── scripts/cargar_metricas.py  # carga el reporte de evaluación del modelo (RM-06)
├── scripts/respaldar.sh, restaurar.sh, respaldo.py  # respaldo y restauración (RNF-26)
├── scripts/recuperar_admin.py  # recupera al único administrador (RF-U09 CA 10)
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
| Base de datos y cola | `DATABASE_URL`, `REDIS_URL`, `EVENTOS_INTERVALO_SEGUNDOS` (15) |
| MinIO | `S3_ENDPOINT_URL` (interno), `S3_PUBLIC_ENDPOINT_URL` (URL firmadas), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_URL_FIRMADA_SEGUNDOS`, `IMAGEN_TEMPORAL_MINUTOS` (30) |
| Seudónimo y TOTP | `HMAC_CLAVES` (JSON con todas las versiones), `HMAC_VERSION_ACTUAL`, `TOTP_CLAVE_CIFRADO` |
| Modelo | `HF_SPACE_URL` (https), `HF_TOKEN`, `GASTROAI_API_KEY` (cabecera `X-API-Key`), `HF_REPO`, `HF_REVISION` (SHA fijo), `HF_SHA256`, `HF_PESOS_ARCHIVO` (respaldo), `HTTP_TIMEOUT_SECONDS` (30), `HF_SIMULADO` (solo desarrollo) |
| Explicación | `LLM_PROVEEDOR` (gemini), `LLM_MODELO` (gemini-3.5-flash), `LLM_RAZONAMIENTO` (MINIMAL), `LLM_API_KEY`, `LLM_TIMEOUT_SECONDS` (15) |
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
| GET | `/auth/sesion` | Cualquier etapa | — | `{etapa, usuario, inactividad, casos_recibidos_nuevos}` |
| POST | `/auth/sesion/continuar` | Cualquier etapa | — | `{ultima_actividad_en}` |
| POST | `/auth/logout` | Cualquiera (o ninguna) | `{motivo?}` | `204`, borra la cookie |
| GET | `/perfil` | Cualquier rol | — | `{id, nombre, apellido, correo, telefono, rol: {codigo, nombre}, estado, creado_en, totp_vinculado}` |
| PATCH | `/perfil` | Cualquier rol | `{nombre?, apellido?, telefono?}` | el perfil (correo y rol se ignoran) |
| GET | `/admin/usuarios` | `ADMINISTRADOR` | `?q&rol&estado&excluir&orden&pagina&por_pagina` | `{items, paginacion, conteos}` |
| POST | `/admin/usuarios` | `ADMINISTRADOR` | `{nombre, apellido, correo, telefono?, rol}` | `201 {usuario, credencial}` |
| GET | `/admin/usuarios/{id}` | `ADMINISTRADOR` | — | usuario + `casos_activos, totp_vinculado, intentos_fallidos, bloqueado_hasta, bloqueado_en, desactivado_en, ultimo_traslado, envios_credencial` |
| GET | `/admin/usuarios/{id}/casos-activos` | `ADMINISTRADOR` | — | `{total_casos, total_analisis, casos: [{caso_id, analisis: [{id, codigo, solicitado_en}]}]}` |
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
| GET | `/admin/estado-operativo` | `ADMINISTRADOR` | — | `{verificado_en, alerta, servicios, modelo_desplegado}` |
| POST | `/admin/estado-operativo/verificar` | `ADMINISTRADOR` | — | igual que el GET (mide de nuevo) |
| GET | `/admin/modelo/metricas` | `ADMINISTRADOR` | — | `{disponible, modelo, rotulo, conjunto_prueba, fecha_reporte, contiene_datos_clinicos, model_card_url, macro, por_caracteristica}` |
| GET | `/admin/logs-inferencia` | `ADMINISTRADOR` | `?estado&desde&hasta&pagina&por_pagina` | `{items, paginacion}` |
| GET | `/eventos` | `ACTIVA` (cualquier rol) | — | `text/event-stream` (§3.9) |
| GET | `/admin/dashboard` | `ADMINISTRADOR` | — | `{usuarios, seguridad, analisis, latencia_7d, servicios, alerta, modelo_vigente, envios_credencial_fallidos, verificado_en}` |
| GET | `/catalogos/tipos-documento` | Cualquier rol | — | `{items: [{codigo, nombre, longitud_maxima}]}` |
| GET | `/catalogos/roles` | Cualquier rol | — | `{items: [{codigo, nombre}]}` (el mismo nombre de `rol_nombre`; U-16) |
| GET | `/dashboard/doctor` | `DOCTOR` | — | `{primer_uso, resumen, analisis_recientes, frecuencia, concordancia, pacientes_con_seguimiento, avisos_traslado, casos_recibidos, aviso}` |
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
| POST | `/reportes` | `DOCTOR` | `{analisis_ids}` o `{caso_id}` | `201 {id, formato: "PDF", generado_en, analisis, descarga_url}` |
| GET | `/reportes/{id}/archivo` | `DOCTOR` (el que lo generó) | — | `application/pdf` (attachment) |
| GET | `/analisis` | `DOCTOR` | `?pagina&por_pagina&origen&estado&codigo&caracteristica&desde&hasta&orden` | `{items, paginacion}` («Mis análisis») |
| GET | `/casos-recibidos` | `DOCTOR` | `?origen_id&limite` | `{nuevos, total_traslados, total_casos, doctores_origen, traslados}` |
| POST | `/casos-recibidos/buscar` | `DOCTOR` | `{tipo_documento, numero_documento, origen_id?, limite?}` | igual + `analisis_propios_paciente` |
| POST | `/traslados/{id}/visto` | `DOCTOR` | — | `204` |
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
- `/auth/logout` responde 204 aunque la sesión ya hubiera vencido. El cuerpo es opcional:
  `{"motivo": "manual"}` (por defecto) o `{"motivo": "inactividad"}` cuando el front cierra por el
  aviso del minuto 10; solo cambia lo que queda en la bitácora (`CIERRE_SESION` o
  `CIERRE_SESION_INACTIVIDAD`).
- `/auth/sesion/continuar` («Sigo aquí») funciona en **cualquier etapa**, también en el cambio de
  contraseña, la vinculación del TOTP y el código, para poder avisar y ampliar el tiempo en esas
  pantallas (WCAG 2.2.1). Solo renueva la inactividad; no salta ningún paso.
- `casos_recibidos_nuevos` es el número del menú «Casos recibidos»: traslados que el doctor no ha
  abierto. Solo viene con sesión `ACTIVA` y rol `DOCTOR`; en los demás casos es `null`. Como el
  front consulta `/auth/sesion` por la inactividad, el número se actualiza solo.
- Las respuestas llevan la cabecera HTTP `Date` (la pone el servidor). El front la usa con
  `ultima_actividad_en` para calcular el tiempo restante sin depender del reloj del equipo; no se
  debe quitar en nginx ni en uvicorn.

**Paciente y documento.**

- El documento solo viaja en el cuerpo de un `POST`; nunca en la URL, en la respuesta ni en
  los logs. Se normaliza (sin puntos, espacios ni guiones) y se valida por tipo: **CC hasta
  10 dígitos, TI hasta 11, CE hasta 6**. Mal escrito: `422 DOCUMENTO_INVALIDO` con `campos`
  (`tipo_documento` o `numero_documento`) → W-06e.
- La consulta solo cuenta los casos del doctor que pregunta (propios o recibidos por
  traslado): no revela si el paciente tiene análisis con otros doctores (RF-H01 CA 5).
- nginx limita `/pacientes/consulta` por IP (30/min) para que no se use para adivinar documentos.

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

**Salud del sistema (RF-A04, RF-A05, RF-M03).**

- Estado operativo: `servicios` = `[{codigo, nombre, estado, tiempo_respuesta_ms, ultima_verificacion}]`
  con `codigo` ∈ `APP_WEB | INFERENCIA_VISION | EXPLICACION_LLM | BASE_DATOS | CORREO |
  ALMACENAMIENTO` y `estado` ∈ `OPERATIVO | LENTO | SIN_RESPUESTA` (`LENTO` = más de 2 s;
  `tiempo_respuesta_ms` es `null` si no respondió).
  - Se mide en vivo y en paralelo, con un máximo de `MONITOREO_TIMEOUT_SECONDS` (3 s) por
    servicio. La medición se reutiliza 30 s; `verificar` fuerza una nueva si la última tiene
    más de 10 s.
  - Cómo se revisa cada uno: la app web con un GET a `MONITOREO_APP_WEB_URL`; el Space con un
    GET a su raíz con el token; Gemini pidiendo los datos del modelo (sin gastar tokens); la
    base con `SELECT 1`; el SMTP conectando y entrando sin mandar nada; MinIO con el bucket.
  - `modelo_desplegado` = `{repositorio_hf, revision_sha, huella_pesos_sha256, desplegado_en,
    model_card_url, coincide_con_configuracion, revision_space}` o `null`.
    `coincide_con_configuracion` compara con `HF_REVISION` (RNF-29); `revision_space` es la que
    informa el Space en `GET /`, si la manda.
  - `alerta` = `{nivel: "ERROR" | "ADVERTENCIA", mensaje}` o `null`. Es `ERROR` si un servicio
    no responde, si no hay modelo vigente o si la revisión no coincide; `ADVERTENCIA` si solo
    hay servicios lentos.
- Métricas: las del reporte de evaluación (RM-06) del modelo vigente, rotuladas siempre como
  «Evaluación del modelo desplegado sobre el conjunto de prueba» (no son desempeño en
  producción).
  - `macro` y cada fila de `por_caracteristica` (`{caracteristica: {id, nombre}, ...}`) traen
    `SENSIBILIDAD, ESPECIFICIDAD, F1, ROC_AUC, PR_AUC, BRIER, ECE`, con `null` en la que falte.
  - Si hay varios reportes, solo cuenta el más reciente.
  - Sin reporte: `{"disponible": false}` (más `modelo` si hay uno vigente), sin cifras
    provisionales.
  - Las cifras se cargan con `scripts/cargar_metricas` (ver «Cargar el reporte de
    evaluación» en §3.10).
- Logs: `items` = `[{id: "L-000984", ocurrido_en, revision_modelo, latencia_vision_ms,
  latencia_llm_ms, estado, codigo_error}]`, del más reciente al más viejo.
  - `estado` ∈ `EXITO | ERROR | TIEMPO_AGOTADO`; `latencia_llm_ms` es `null` si no hubo
    llamada al LLM.
  - `desde` y `hasta` son días de Colombia, ambos incluidos; si `desde` es posterior →
    `422 RANGO_FECHAS_INVALIDO`.
  - **Nunca** sale el `analisis_id` ni nada clínico (RF-M03 CA 2).

**Dashboard técnico (RF-DB02).** `GET /admin/dashboard`, pantalla inicial del administrador
(W-19). Solo conteos: ningún campo identifica un caso, un paciente o un análisis (CA 8).

- `usuarios` = `{por_estado: {PENDIENTE, ACTIVO, INACTIVO}, por_rol: {DOCTOR, ADMINISTRADOR},
  pendientes_expiradas}`. Las cuentas eliminadas no cuentan (CA 1).
- `seguridad` = `{accesos_fallidos_24h, cuentas_bloqueadas}`: inicios de sesión y
  verificaciones TOTP fallidas de las últimas 24 h según la bitácora, y cuentas con bloqueo
  temporal en curso (CA 4).
- `analisis` = `{hoy, ultimos_7_dias, con_error_7_dias, calidad_insuficiente_7_dias}`. «Hoy»
  empieza a las 00:00 de Colombia; los 7 días son las últimas 168 h. Un fallido por calidad
  de imagen no cuenta como error.
- `latencia_7d` = `{vision_p95_ms, llm_p95_ms, inferencias, errores}`: percentil 95 calculado
  en PostgreSQL sobre `LogInferencia`, separado por modelo (CA 6); `null` si no hubo datos.
- `servicios` (`[{codigo, nombre, estado}]`), `alerta`, `modelo_vigente` (`{repositorio_hf,
  revision_corta, desplegado_en, coincide_con_configuracion}`) y `verificado_en` salen de la
  misma medición del estado operativo (memoria de 30 s), así que entrar al dashboard no mide
  dos veces (CA 2 y 3).
- `envios_credencial_fallidos`: cuentas cuyo último envío de la contraseña temporal falló.
- Las métricas del modelo (CA 5 y 9) se piden a `/admin/modelo/metricas`, que ya maneja el
  estado vacío. La exportación de auditoría (CA 7 y 10) es `/admin/auditoria/exportar`.

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

**Reporte PDF (RF-H02).**

- `POST /reportes` con `analisis_ids` (1 a 50, los repetidos cuentan una vez) **o** `caso_id`
  (todos los análisis del paciente: «Descargar reporte de este paciente», CA 4). Mismo
  criterio de acceso que «Mis análisis»: casos asignados al doctor, propios o recibidos.
- Errores: análisis o caso ajeno o inexistente → `404 NO_ENCONTRADO`; alguno sin resultado
  → `422 ANALISIS_SIN_RESULTADO`; el paciente no tiene análisis completados →
  `422 SIN_ANALISIS`; más de 50 → `422 DEMASIADOS_ANALISIS`; MinIO caído → `503`.
- El PDF (`services/constructor_reporte.py`, patrón Builder) sigue el diseño R-01 / R-02:
  - **Por análisis (R-01):** recuadro «Análisis experimental»; Trazabilidad (código, fecha,
    quién lo hizo, modelo y revisión, «Paciente: no se incluye»); imagen anonimizada y mapa
    Grad-CAM lado a lado con la línea de cada región (confianza y área); características
    frente al umbral; explicación del LLM si está `GENERADA`; valoración profesional.
  - **Varios (R-02):** hoja de resumen (código, fecha, característica principal,
    probabilidad, valoración y página donde empieza) y cada análisis desde una página nueva.
  - **En cada página:** logo, título («… (continuación)» si sigue) y «Generado el … por …»
    arriba; abajo el aviso de herramienta experimental y «Página X de N» (RF-R04 CA 4,
    RNF-22). El total y las páginas del resumen salen de una primera pasada de maquetación.
  - Nunca el documento ni el seudónimo. Si una imagen no se puede leer, va el recuadro vacío.
  - El logo sale de `app/assets/` (copia de `frontend/src/assets/logo-*.svg`) y se dibuja en
    vectores con `services/logo_pdf.py`, sin librerías de SVG.
- Se guarda en MinIO (`reportes/{id}.pdf`); la tabla `Reporte` + `ReporteAnalisis` deja
  quién lo generó y qué análisis entraron. La descarga es `Reporte_GastroAI_<código>.pdf`
  con `Cache-Control: no-store`.

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

**Casos recibidos (RF-A07).**

- Bandeja del doctor con los casos que le trasladaron (al desactivar, eliminar o reasignar a otro
  doctor). Un bloque por traslado, el más reciente primero:
  `{id, tipo, ejecutado_en, nuevo, origen: {nombre, apellido, cuenta_eliminada}, casos: [{caso_id,
  total_analisis, ultimo_analisis_en}], analisis_total, analisis}`.
- `analisis` = filas `{id, codigo, solicitado_en, estado, caracteristica_principal,
  probabilidad_principal, originalmente_de}`, las más recientes primero; `?limite=5` por defecto y
  `limite=0` las trae todas («Ver los N casos»). `originalmente_de` aparece cuando el análisis lo
  hizo alguien distinto del doctor de origen (caso trasladado dos veces).
- `nuevo` = el doctor no ha abierto ese traslado; `POST /traslados/{id}/visto` lo marca (204,
  repetirlo no cambia nada; traslado ajeno → 404). `nuevos` = cuántos faltan por abrir.
- `doctores_origen` alimenta el filtro «Doctor de origen» (`?origen_id=`).
- Solo aparece lo que sigue siendo del doctor: si un caso recibido se trasladó otra vez, sale de
  su bandeja. Nunca se muestra el seudónimo ni qué administrador hizo el traslado.
- La búsqueda por documento filtra los mismos bloques por paciente y agrega
  `analisis_propios_paciente` (aviso «Este paciente también tiene N análisis suyos»). Sin
  coincidencias: `traslados: []`, sin revelar nada. Mismo límite por IP que la consulta de paciente.

**Configuración de inferencia.**

- Todo umbral va de 0.10 a 0.90; fuera de rango: `422 UMBRAL_FUERA_DE_RANGO` con `campos`
  (`umbral_global`, `umbrales[i].umbral`) y `rango`.
- En modo por característica deben venir todas las activas con su umbral, o
  `422 UMBRALES_INCOMPLETOS`. `umbral: null` quita el umbral propio (usa el global).
- Solo afecta análisis futuros: cada resultado guarda el umbral con que se evaluó.

**Dashboard clínico (RF-DB01).**

- Pantalla inicial del doctor. Todo se calcula **solo con sus propios análisis completados**
  (los que hizo él y siguen siendo suyos). Lo que recibió por traslado se informa aparte en
  `casos_recibidos` y `avisos_traslado`, y no cambia sus indicadores (RF-A07 CA 2).
- `primer_uso: true` = no tiene ningún análisis → estado vacío «Realizar el primer análisis», sin
  gráficas (RF-DB01 CA 10).
- `resumen` = `{total_analisis, analisis_mes, ultimos_7_dias, sin_valoracion}`. El mes es el de
  Colombia; `sin_valoracion` = completados sin su observación.
- `analisis_recientes` = los 5 más recientes, en cualquier estado: `{id, codigo, solicitado_en,
  estado, caracteristica_principal, caracteristicas_que_superan}`. Se identifican por el código,
  nunca por el paciente (RF-DB01 CA 2).
- `frecuencia` = `{rotulo, barras: [{caracteristica_id, codigo, nombre, analisis}]}`: en cuántos
  análisis superó el umbral cada característica, con el umbral aplicado ese día. Gráfico de
  **barras**, no circular, y con el rótulo tal cual (RF-DB01 CA 3 y 4). Las que tienen 0 también
  vienen.
- `concordancia` = `{porcentaje, coincide, no_coincide, no_concluyente}`; `porcentaje` = coincide /
  (coincide + no coincide), con un decimal, o `null` si aún no valoró nada.
- `pacientes_con_seguimiento` = casos con 2 o más análisis propios (RF-DB01 CA 6).
- `avisos_traslado` = traslados recibidos sin abrir: `{traslado_id, tipo, cantidad_casos, origen:
  {nombre, apellido, cuenta_eliminada}, ejecutado_en}`.
- Siempre trae `aviso` (RF-DB01 CA 9).

**Usuarios (administrador).**

- `usuario` = `{id, nombre, apellido, correo, telefono, rol, rol_nombre, estado, bloqueado,
  creado_en, activado_en, estado_activacion, temporal_expira_en, ultimo_envio}`.
  `estado_activacion` y `temporal_expira_en` solo vienen en las cuentas `PENDIENTE`
  (`estado_activacion` = `PENDIENTE` o `EXPIRADA`, RF-U06). `rol_nombre` es el nombre
  visible del rol (p. ej. «Doctor/Gastroenterólogo»). `ultimo_envio` es la `credencial`
  más reciente o `null`: con `estado: "FALLIDO"` la fila muestra «Correo no enviado».
- `orden` = `nombre` (por defecto: apellido y nombre), `correo`, `rol` (nombre visible),
  `estado` (prioridad de la insignia: bloqueada, pendiente, inactiva, activa) o `activacion`
  (U-17, para W-20: primero las pendientes con la temporal vencida y, dentro de cada grupo, la
  que vence o venció antes); con `-` delante, descendente (`?orden=-correo`). Siempre se
  desempata por apellido, nombre e `id`, así que el orden es fijo entre páginas. Otro valor → 422.
- La lista trae `conteos` = `{activos, pendientes, expiradas, inactivos, bloqueadas,
  eliminadas}` de **todas** las cuentas, sin importar los filtros (resumen de la pantalla).
- En el detalle: `bloqueado_en` (solo con un bloqueo en curso) y `desactivado_en` (solo si
  está `INACTIVO`) salen de la bitácora; la IP del bloqueo **no** viene aquí, se consulta en
  la bitácora filtrando por el usuario. `ultimo_traslado` = `{tipo, cantidad_casos,
  ejecutado_en, destino: {nombre, apellido, cuenta_eliminada}}` o `null`.
- `casos-activos`: los casos de un doctor para elegir qué reasignar, con solo el código y la
  fecha de cada análisis (nada clínico ni del paciente, RF-A06 CA 2). 404 si la cuenta no existe.
- `credencial` = `{motivo, estado, intentado_en, codigo_error}`; con el correo caído:
  `estado: "FALLIDO"`, `codigo_error: "CORREO_NO_ENVIADO"` → la UI ofrece reenviar. **La
  contraseña temporal nunca viaja en la respuesta**, solo por correo.
- `traslado` = `{id, tipo, casos_trasladados}` o `null`.
- Paginación: `?pagina=1&por_pagina=20` (máximo 100) → `{items, paginacion: {pagina, por_pagina, total}}`.
- Las cuentas eliminadas no salen en la lista salvo `estado=ELIMINADO`. Se pueden consultar,
  pero cualquier cambio sobre ellas responde 404.
- Desactivar, eliminar, restablecer y cambiar el correo cierran las sesiones abiertas de esa
  cuenta. Restablecer, además, desvincula la app autenticadora (RF-U09 CA 9).
- Si hay un único administrador y pierde el acceso, se recupera desde el servidor con
  `scripts/recuperar_admin` (RF-U09 CA 10, ver `backend/README.md`).
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

**Planeados** (detalle en la especificación del equipo): reportes PDF, dashboards, bitácora,
monitoreo y SSE.

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
- `estado_operativo.py`: panel de supervisión; corre en paralelo los chequeos de
  `adapters/salud.py` y compara el modelo vigente con la revisión configurada.
- `monitoreo.py`: métricas del reporte de evaluación y logs técnicos de inferencia.
- `reportes.py` y `constructor_reporte.py`: reporte PDF de resultados (Builder).
- `dashboard_tecnico.py`: pantalla inicial del administrador; conteos sin datos clínicos y
  la medición compartida del estado operativo.
- `verificadores_imagen.py`: cadena de responsabilidad peso → formato → resolución, y la
  limpieza de metadatos.
- `imagenes.py`: área temporal de las imágenes cargadas (dueño y vencimiento).
- `analisis.py`: fachada `ServicioAnalisis` (documento → seudónimo → caso → análisis →
  cola, con candado por paciente) y proxy `ProxyAccesoAnalisis` (solo el doctor del caso).
- `casos_recibidos.py` (+ `repositories/casos_recibidos_repository.py`): bandeja de casos
  recibidos por traslado.
- `historial.py` (+ `repositories/historial_repository.py`): «Mis análisis» y «Buscar por
  paciente», siempre por el caso asignado al doctor.
- `dashboard.py` (+ `repositories/dashboard_repository.py`): dashboard clínico del doctor.
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
- `tiempo_real.py`: avisos SSE por Redis pub/sub (`PublicadorRedis`) y el `Broker` que los
  reparte a las conexiones de cada proceso (§3.9).

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

**Contrato con el Space privado de Hugging Face** (modelo Fold 2, lo implementa el equipo
de ML en `Model_CNN/Code-to-deploy-model/app.py`):

```
POST {HF_SPACE_URL}/clasificar
Authorization: Bearer {HF_TOKEN}
X-API-Key: {GASTROAI_API_KEY}
multipart/form-data, campo «imagen» (JPEG o PNG ya sin metadatos)

200 {"revision_sha": "<40 hex>", "checkpoint_sha256": "<64 hex>",
     "predicciones": {"ATROFIA": {"probabilidad": 0.8734, "umbral": 0.5, "detectado": true,
       "region_roi": {"x": 74, "y": 52, "ancho": 43, "alto": 48, "area_pct": 14.2},
       "mapa_calor_png_b64": "<PNG en Base64>"}, "GASTRITIS": {…}, "HPYLORI": {…}}}
```

- Códigos de característica iguales a los del catálogo (`ATROFIA`, `GASTRITIS`, `HPYLORI`).
- Probabilidades de 0 a 1 y `area_pct` de 0 a 100. La caja viene en píxeles de la entrada
  de 240 × 240 (el Space redimensiona sin recortar) y el adaptador la pasa a fracciones de
  0 a 1. Una caja de 0 × 0 (el Grad-CAM no marcó nada) no se guarda como región.
- `umbral` y `detectado` del Space no se usan: el backend aplica el umbral vigente (RF-A01).
  Para el Fold 2 el umbral inicial es **0,50 global para las tres clases** (el mismo del
  PR #296). Umbrales distintos por clase solo con una calibración documentada de esta
  versión del modelo.
- La región y su mapa de calor se guardan **solo si la característica supera el umbral** y
  la caja es válida (más de 0 × 0 y dentro de la imagen). Por debajo se conservan la
  probabilidad y el resultado, pero no se muestra ninguna región como hallazgo. El umbral
  interno del Grad-CAM (0,5 sobre el mapa normalizado) solo recorta activaciones: no
  decide si la característica está detectada.
- Grad-CAM es una visualización experimental, no una segmentación clínica: la API manda
  ese aviso en `mapa_calor.aviso` y el PDF lo imprime junto al mapa.
- `revision_sha` = el commit cargado en el Space; debe ser igual a `HF_REVISION`.
- `checkpoint_sha256` = la huella de los pesos; debe ser igual a `HF_SHA256` (si no,
  `HUELLA_DISTINTA` en `LogInferencia`).
- `GET {HF_SPACE_URL}/` (sin `X-API-Key`) responde la salud y la revisión: lo usa el panel
  de supervisión (RF-A04).
- El Space debe ser privado y no guardar ni registrar las imágenes (RNF-30).

### 3.9 Tiempo real (SSE) y seguimiento del análisis

No hay WebSocket: el servidor avisa por **SSE** en `GET /api/v1/eventos`
(`text/event-stream`, guía en `docs/sse_tiempo_real.md`). Los avisos llevan **solo IDs**: el
front vuelve a pedir el dato al endpoint REST de siempre, que es donde está la autorización.

| Evento | Datos | A quién | Cuándo |
|---|---|---|---|
| `conectado` | `{}` | quien se conecta | al abrir y al reconectar (el front hace refetch) |
| `analisis.estado` | `{analisis_id}` | doctor que lo pidió | análisis nuevo, cambio de etapa, terminó o falló |
| `analisis.explicacion` | `{analisis_id}` | doctor que lo pidió | explicación `GENERADA`, `FALLIDA` o `RECHAZADA` |
| `traslado.nuevo` | `{traslado_id}` | doctor destino | desactivar, eliminar o reasignar casos |
| `cuenta.rol_cambiado` | `{}` | esa cuenta | el admin le cambió el rol |
| `sesion.cerrada` | `{motivo}` | dueño de la sesión | su sesión ya no vale; el stream termina |

Cada `data:` es `{"tipo": "<evento>", ...datos}`. `motivo` ∈ `INACTIVIDAD |
CUENTA_DESACTIVADA | DEMASIADOS_INTENTOS | CERRADA` (`CERRADA` = cerró sesión en otra pestaña
o el admin le restableció la contraseña).

- **Quién publica:** nadie a mano. `repositories/avisos_tiempo_real.py` escucha la `Session`
  de SQLAlchemy: en cada flush anota qué cambió y **publica después del commit** (si hay
  rollback, se descartan). Así sirve igual en la API y en el worker, que lo activan al
  arrancar (`lifespan` y la señal `worker_init` de Celery).
- **Cómo llega:** `PublicadorRedis` publica en el canal `usuario:<id>`; en cada proceso de la
  API un solo `Broker` escucha `usuario:*` y reparte a las conexiones abiertas (máximo 100
  avisos en cola por conexión). Si Redis no responde, el aviso se pierde sin tumbar la
  petición; el front recupera con el refetch de `conectado`.
- **La sesión:** abrir el stream exige sesión `ACTIVA` (401/403 como cualquier endpoint).
  Cada `EVENTOS_INTERVALO_SEGUNDOS` (15) y cada vez que llega un `sesion.cerrada`, revisa que
  **su** sesión siga valiendo (el aviso puede ser de otra sesión del mismo usuario). Nunca
  renueva la inactividad (RF-U10) y no deja una conexión de la base tomada mientras está
  abierto.
- sse-starlette manda `: ping` cada 15 s; la respuesta lleva `X-Accel-Buffering: no`.

Además, mientras el análisis está `PROCESANDO`, el frontend puede consultar
`GET /analisis/{id}/estado` con `X-Actividad-Pasiva: 1`, que no renueva la sesión.

### 3.10 Migraciones y carga inicial

```bash
cd backend
alembic upgrade head          # aplica 0001 y 0002
python -m app.seed            # roles, características, umbral 50 %, modelo vigente, primer admin
alembic revision --autogenerate -m "descripcion"   # cuando cambie un modelo
```

Nunca `create_all`. Un modelo nuevo se importa en `app/models/__init__.py` para que Alembic
lo vea.

**Cargar el reporte de evaluación (RM-06).** Lo entrega el equipo de ML como JSON; el formato
está en `app/schemas/reporte_evaluacion.py`:

```json
{"repositorio_hf": "ragnartech/gastro-ai", "revision_sha": "<40 hex del modelo desplegado>",
 "fecha_reporte": "2026-11-10", "conjunto_prueba": "GastroHUN + EGID, prueba por paciente",
 "macro": {"SENSIBILIDAD": 0.81, "ESPECIFICIDAD": 0.88, "F1": 0.79, "ROC_AUC": 0.90,
           "PR_AUC": 0.85, "BRIER": 0.12, "ECE": 0.05},
 "por_caracteristica": {"ATROFIA": {"SENSIBILIDAD": 0.83}, "GASTRITIS": {}, "HPYLORI": {}}}
```

```bash
python -m scripts.cargar_metricas reporte.json --revisar            # solo valida
docker compose exec -T api python -m scripts.cargar_metricas - < reporte.json
```

- Métricas de `NombreMetrica`, de 0 a 1, con 4 decimales; la que no venga queda vacía.
- El modelo (repositorio + revisión) debe estar registrado, las características deben estar
  en el catálogo y la fecha no puede ser futura. Si algo no cuadra no se guarda nada y se
  listan todos los problemas.
- Un reporte por modelo y conjunto de prueba: volver a cargarlo lo reemplaza.
- Solo números agregados: el formato no acepta campos de más.

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

### 5.4 nginx (`backend/docker/nginx/`)

Rutas en `rutas.conf`, compartidas por `nginx.conf` (desarrollo, puerto 80) y
`nginx.prod.conf` (producción, https; ver §2.4).

| Ruta | Destino | Notas |
|---|---|---|
| `/api/v1/auth/login`, `contrasena/cambiar` y `totp/*` | `api:8000` | Límite 10/min por IP (ráfaga 5) |
| `/api/v1/pacientes/consulta`, `/pacientes/analisis/buscar` y `/casos-recibidos/buscar` | `api:8000` | Límite 30/min por IP (ráfaga 10) |
| `/api/v1/eventos` | `api:8000` | SSE: sin buffering, `proxy_read_timeout 1h` y máximo 20 streams por IP (429) |
| `/api/` | `api:8000` | `X-Forwarded-For` para la IP de la bitácora |
| `/` | `frontend:80` | SPA compilada |

`client_max_body_size 12m` (la API rechaza por encima de 10 MB con su propio 413 en JSON).
`resolver 127.0.0.11` evita los 502 al recrear contenedores.
El registro de accesos usa el formato `sin_consulta`: guarda la ruta **sin la query string**,
para que búsquedas como `GET /admin/usuarios?q=…` no dejen nombres ni correos en los logs.
Por lo mismo, uvicorn corre con `--no-access-log` (el registro de accesos es solo el de nginx).

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


**Recuperación del único administrador (RF-U09 CA 10).**
`backend/scripts/recuperar_admin.py` usa el servicio de recuperación con acceso al servidor. Ver el procedimiento limitado en `backend/README.md`. Requiere la corrección de credenciales #283.
