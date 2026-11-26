# Registro de integraciones del frontend

Este archivo registra cada integración de pantallas o componentes recibidos desde
Figma con la API de Gastro-AI. Se actualiza en cada integración y después de sus
verificaciones.

## Despliegue local y verificación del respaldo

- **Fecha:** 25/11/2026.
- **Arranque:** `docker compose up -d --build` completó. El proyecto Compose es
  `gastro-ai-frontend`; queda disponible en `http://localhost`.
- **Configuración local:** se creó `backend/.env` con permisos `0600`, ignorado por Git,
  secretos aleatorios y `HF_SIMULADO=true`. No se reutilizaron los `.env` de otros
  worktrees. La base es un volumen nuevo de desarrollo con carga inicial; no contiene
  datos del otro stack QA.
- **Salud:** API, PostgreSQL, Redis, MinIO y Mailpit saludables; worker, frontend y Nginx
  activos. `GET /api/v1/health` respondió `200` con `status=ok` y `database=ok`; la SPA
  en `/` respondió `200`. Migraciones 0001–0003 y carga inicial terminaron sin error.
- **Rutas de W-22/W-23/W-24:** las cuatro llamadas (GET de W-22, POST de actualizar,
  GET de métricas y GET de logs) respondieron `401` sin sesión, como exige la protección
  de administrador. Falta comprobar respuestas con una sesión autenticada.
- **Respaldo creado:**
  `/tmp/gastroai-backup-verificacion/gastroai-20261125T204948Z`.
  Directorio con permisos `0700`; archivos con `0600`.
- **Contenido:** dump PostgreSQL, `archivos.tar`, manifiesto y `SHA256SUMS`.
  Checksums verificados. `restaurar.sh` restauró el respaldo en un proyecto Compose
  aislado y confirmó **8 filas, bitácora idéntica (0 entradas) y 0 archivos**.
- **Alcance del respaldo:** es una comprobación de un entorno recién sembrado, no un
  respaldo de datos productivos ni del otro stack local. Los pesos no se incluyen porque
  `HF_PESOS_ARCHIVO` está vacío; la inferencia está simulada. La restauración prueba la
  recuperación de BD y archivos de MinIO, no de pesos.
- **Incidencia:** al recrear API/worker para cargar la configuración, Nginx devolvió
  `502` mientras API estaba en `health: starting`; desapareció al pasar el healthcheck.
  La API volvió a `200` y el stack principal quedó saludable.
- **Cierre del ensayo:** se detuvieron los contenedores del proyecto temporal de
  restauración con `docker compose down` (sin `-v`); el stack principal sigue activo.

## W-22 · Estado operativo

- Rama para PR: `codex/integracion-w22-estado-operativo` → `testing/qa-branch`.
- **Fecha:** 25/11/2026.
- **Archivos de frontend:** `src/pages/EstadoOperativo.tsx`,
  `src/pages/EstadoOperativo.module.css`, `src/services/estadoOperativo.ts` y
  `src/navegacion/pantallas.tsx`.
- **Endpoints y métodos:** `GET /api/v1/admin/estado-operativo` para la carga inicial y
  `POST /api/v1/admin/estado-operativo/verificar` para «Actualizar».
- **Contrato revisado:** `backend/app/api/routers/admin_monitoreo.py`,
  `backend/app/schemas/monitoreo.py`, `backend/app/services/estado_operativo.py` y
  `backend/app/adapters/salud.py` de la rama local. El modelo incluye
  `huella_pesos_sha256` y `desplegado_en`, además de `repositorio_hf`, `revision_sha`,
  `model_card_url`, `coincide_con_configuracion` y `revision_space`.
- **Estados cubiertos:** carga inicial, datos, servicios lentos/sin respuesta, alerta del
  servidor, ausencia de modelo, error con reintento y actualización conservando el último
  resultado visible. Escritorio usa tabla; debajo de 1280 px usa tarjetas.
- **Build (`pnpm build`):** aprobado el 25/11/2026 (`tsc --noEmit` y `vite build`).
- **Prueba de endpoint:** health API respondió `200`; GET y POST administrativos devolvieron `401` sin sesión, control de acceso esperado. No se verificó respuesta autenticada `200`.
- **Prueba en navegador:** no se completó flujo autenticado.
- **Errores encontrados:** antes de iniciar Compose, `GET /api/v1/auth/sesion` respondió `500` porque Vite no podía conectar con `127.0.0.1:80` (`ECONNREFUSED`); la interfaz protegida no llegó a montarse. Durante el reinicio de API/worker, Nginx también devolvió temporalmente `502`; se resolvió al quedar saludable el API. No hubo errores de compilación ni queda un error reproducible con el stack saludable.
- **Limitaciones / trabajo pendiente:** validar GET, POST y estados visuales con sesión de administrador.
- **Desvíos de Figma o solicitudes al backend:** se separó el mockup unido en el archivo
  recibido. Los valores de tiempos y modelo del mockup son ficticios y no se usan.
  La barra lateral, encabezado y aviso global se reutilizan del layout. W-22 no incluye
  mascota; la capa «Estado vacío con TOPOLOGO» del archivo corresponde a W-23b.

## W-23 · Métricas del modelo

- **Fecha:** 25/11/2026.
- **Archivos de frontend:** `src/pages/MetricasModelo.tsx`,
  `src/pages/MetricasModelo.module.css` y `src/services/metricasModelo.ts`.
- **Endpoint:** `GET /api/v1/admin/modelo/metricas`.
- **Contrato revisado:** `backend/app/api/routers/admin_monitoreo.py`,
  `backend/app/schemas/monitoreo.py`, `backend/app/services/monitoreo.py` y
  `backend/app/schemas/reporte_evaluacion.py`. Métricas entre 0 y 1; las claves
  omitidas/null se presentan como «No reportada», nunca como cero. Brier/ECE se muestran
  como valores de calibración y se indica que menor es mejor.
- **Estados cubiertos:** carga, error/reintento, reporte disponible y `disponible: false`
  sin cifras provisionales. El estado W-23b reutiliza `EstadoVacio` y la mascota SVG
  existente, que es decorativa. Se informa que son métricas del conjunto de prueba y no
  desempeño en producción.
- **Build (`pnpm build`):** aprobado el 25/11/2026.
- **Prueba de endpoint:** API saludable (`/api/v1/health` `200`); `GET /api/v1/admin/modelo/metricas` devuelve `401` sin sesión, control esperado. Falta validar con administrador.
- **Prueba en navegador:** flujo autenticado pendiente.
- **Errores / limitaciones:** build aprobado; no se observaron errores de backend reproducibles. Queda pendiente validar respuestas con y sin reporte usando sesión administrativa.
- **Desvíos / solicitudes al backend:** no registrados.

## W-26 · Parámetros de inferencia

- **Fecha:** 26/11/2026.
- **Archivos de frontend:** `src/pages/ParametrosInferencia.tsx`,
  `src/pages/ParametrosInferencia.module.css`, `src/services/configuracionInferencia.ts`,
  `src/navegacion/pantallas.tsx` y `src/services/api.ts` (se habilitó el método HTTP `PUT`).
- **Endpoints:** `GET /api/v1/admin/configuracion-inferencia` para cargar la configuración;
  `PUT /api/v1/admin/configuracion-inferencia` para guardar umbral global o todos los umbrales
  de características activas.
- **Contrato revisado:** `backend/app/api/routers/configuracion.py`,
  `backend/app/schemas/catalogo.py` y `backend/app/services/configuracion_inferencia.py`.
  El backend valida el rango de 10 % a 90 %, requiere todos los umbrales activos en modo por
  característica y registra el cambio en la bitácora. Los valores se envían como fracciones
  entre 0.10 y 0.90.
- **Estados cubiertos:** carga, error con reintento, modo global, modo por característica,
  validación del rango, botón habilitado solo con cambios, confirmación antes de guardar,
  estado de envío y aviso de éxito. «Restablecer valor inicial» usa 50 % o el valor de model
  card disponible. Se informa que los análisis existentes no cambian.
- **Build local:** `pnpm build` aprobado (`tsc --noEmit` y `vite build`). Docker Compose
  reconstruyó y arrancó el servicio `frontend`; `GET http://localhost/` y
  `GET http://localhost/parametros` respondieron `200`.
- **Prueba del endpoint:** `GET /api/v1/admin/configuracion-inferencia` respondió `401`
  sin cookie de sesión, control de acceso esperado. No se ejecutó el GET autenticado ni el PUT:
  no había sesión administrativa disponible y no se quiso escribir una configuración real
  solo como parte de la comprobación.
- **Errores / límites encontrados:** la primera compilación señaló una referencia posiblemente
  nula en el diálogo de confirmación (TS18047); se corrigió y la compilación final pasó. Se
  intentó correr `tests/test_configuracion_inferencia_rnf20_qa.py` en el contenedor API, pero
  esa imagen no tiene `pytest` instalado. No se encontró un error reproducible del endpoint;
  quedan pendientes las comprobaciones autenticadas de lectura y guardado.
- **Desvíos de diseño:** la fecha y el usuario se muestran como «Configuración vigente desde»
  con los datos que realmente expone el backend; no se inventa el valor anterior del cambio.
  El layout general de navegación y el aviso experimental se reutilizan del shell de la app.

## W-24 · Logs técnicos

- **Fecha:** 25/11/2026.
- **Archivos de frontend:** `src/pages/LogsTecnicos.tsx`,
  `src/pages/LogsTecnicos.module.css` y `src/services/logsTecnicos.ts`.
- **Endpoint:** `GET /api/v1/admin/logs-inferencia` con `estado`, `desde`, `hasta`,
  `pagina` y `por_pagina=25`.
- **Contrato revisado:** `backend/app/api/routers/admin_monitoreo.py`,
  `backend/app/schemas/monitoreo.py`, `backend/app/repositories/monitoreo_repository.py`
  y `backend/app/models/auditoria.py`. Las fechas se envían como días `YYYY-MM-DD`,
  inclusivos en la zona de Colombia; el cliente comprueba que «Desde» no supere «Hasta».
  La pantalla solo muestra tiempos y estado, sin `analisis_id`, códigos técnicos internos
  ni resultados clínicos.
- **Estados cubiertos:** carga, registros, vacío, filtro por estado/rango de fechas,
  paginación, respuesta lenta, errores y reintento. Tabla en escritorio y tarjetas en
  pantallas menores a 1280 px.
- **Build (`pnpm build`):** aprobado el 25/11/2026.
- **Prueba de endpoint:** API saludable (`/api/v1/health` `200`); `GET /api/v1/admin/logs-inferencia` devuelve `401` sin sesión, control esperado. Falta validar filtros y páginas con administrador.
- **Prueba en navegador:** flujo autenticado pendiente.
- **Errores / limitaciones:** build aprobado; no se observaron errores de backend reproducibles. Queda pendiente validar filtros, páginas y estados con sesión administrativa.
- **Desvíos / solicitudes al backend:** no registrados.
