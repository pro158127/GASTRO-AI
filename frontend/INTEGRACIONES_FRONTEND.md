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
- **Errores encontrados:** durante el reinicio del API, Nginx devolvió temporalmente `502`; se resolvió al quedar saludable el API. Ningún error de compilación.
- **Limitaciones / trabajo pendiente:** validar GET, POST y estados visuales con sesión de administrador.
- **Desvíos de Figma o solicitudes al backend:** se separó el mockup unido en el archivo
  recibido. Los valores de tiempos y modelo del mockup son ficticios y no se usan.
  La barra lateral, encabezado y aviso global se reutilizan del layout. W-22 no incluye
  mascota; la capa «Estado vacío con TOPOLOGO» del archivo corresponde a W-23b.

