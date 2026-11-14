# ANALISIS\_Y\_GUIA\_TECNICA

> Documento de lectura del repositorio. Describe lo que el código implementa hoy, no solo lo propuesto en los documentos de diseño. Se complementa con [ARCHITECTURE.md](/broken/pages/68660a36d9e2187a42c31073ec95aa6f529acea7), [backend/README.md](/broken/pages/4c0fdf57a058b69162da16a0968da5d04bb36fe7) y [frontend/CONTRATOS\_API.md](/broken/pages/93e9d6445dae2bb9469ae308e038987d59e6a298). No sustituye esos documentos ni es una auditoría clínica o de seguridad.

## 1. Alcance y mapa del repositorio

El producto ejecutable se divide en `backend/` y `frontend/`. La infraestructura principal está descrita por `docker-compose.yml` de la raíz; `backend/docker-compose.yml` permite levantar la parte backend sin la SPA. `Model_CNN/` conserva código, experimentos, reportes y material de entrenamiento/despliegue del modelo; no es importado automáticamente por FastAPI ni por Celery: la inferencia de producción se consume a través del adaptador HTTP hacia Hugging Face.

* Raíz: `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `.env.example` y Compose.
* Backend: aplicación FastAPI, capas de dominio, migraciones Alembic, worker Celery, scripts y contenedores.
* Frontend: SPA React/Vite, componentes, rutas, guardas de sesión y clientes API.
* `Model_CNN/`: material de modelo, guías de despliegue y análisis/documentación de datos. Los subdirectorios incluyen `Code-to-deploy-model` (6 archivos), `Codigo de fases de desarrolo del CNN` (13) y `Documentacion` (31).
* `Informes de validaciones/`: informes, resultados serializados y manifiestos de corridas anteriores; son evidencia histórica, no se ejecutan al iniciar la aplicación.
* `Asignaciones_Entregables_Cristian/`: documentos de planificación/control (DOCX/XLSX) ajenos al runtime.
* `.devcontainer/`: configuración para entorno de desarrollo.

## 2. Recorrido de una petición y conexiones

```
Navegador ──HTTP──> nginx :80 ── / ──> frontend estático
                          └── /api/* ──> FastAPI :8000
FastAPI ──SQLAlchemy──> PostgreSQL
FastAPI ──boto3/S3──> MinIO (objetos)
FastAPI ──Celery──> Redis ──> worker Celery
worker ──HTTP──> Space de Hugging Face (inferencia)
worker ──SDK/HTTPS──> Gemini (explicación, opcional)
FastAPI ──SMTP──> servidor de correo (Mailpit en Compose de desarrollo)
```

Nginx sirve como entrada única en el Compose raíz, enruta `/api/` a la API y el resto a la SPA, fija la IP cliente reenviada, impone límites por IP y configura el límite de carga. Sus destinos Docker se re-resuelven con `resolver 127.0.0.11`. El Compose backend independiente publica adicionalmente puertos de servicios para desarrollo. En el Compose raíz `preparar` espera a PostgreSQL y MinIO, ejecuta migraciones, inicialización de almacenamiento y seed; la API espera a que termine y Redis esté saludable. `preparar` termina normalmente con código cero.

### Capas backend

{% stepper %}
{% step %}
## `app/main.py`

Configura FastAPI, manejadores de error, CORS e incluye todos los routers bajo `settings.api_prefix` (por defecto `/api/v1`).
{% endstep %}

{% step %}
## `app/api/routers/`

Convierte HTTP y dependencias a llamadas de servicio; define métodos, rutas y modelos de respuesta.
{% endstep %}

{% step %}
## `app/api/deps.py`

Construye servicios, repositorios, adaptadores y dependencias de sesión, etapa, rol, IP y base. Una petición comparte la misma sesión SQLAlchemy; esto permite confirmar acción y auditoría juntas.
{% endstep %}

{% step %}
## `app/schemas/`

Valida y serializa los contratos Pydantic.
{% endstep %}

{% step %}
## `app/services/`

Contiene reglas de negocio y coordinación de repositorios y adaptadores.
{% endstep %}

{% step %}
## `app/repositories/`

Proporciona acceso SQLAlchemy. `UnidadTrabajo` concentra confirmación/rollback.
{% endstep %}

{% step %}
## `app/models/`

Define entidades y enums persistidos.
{% endstep %}

{% step %}
## `app/adapters/`

Define límites externos sustituibles: MinIO/S3, Redis/Celery, correo SMTP, HIBP (contraseñas filtradas), Space HF y Gemini.
{% endstep %}
{% endstepper %}

## 3. API implementada en el backend

Todas las rutas siguientes llevan prefijo `/api/v1`. Las rutas que requieren sesión usan cookie `gastro_sesion`; la cookie es HttpOnly, y el frontend no conserva el token ni envía `Authorization`. `SesionDoctor` requiere etapa activa y rol doctor; `SesionAdmin`, etapa activa y administrador. El backend realiza la autorización aunque el frontend oculte rutas. Los análisis ajenos responden como no encontrados para no revelar su existencia.

| Método y ruta                                      | Acceso                          | Función / comportamiento                                                                                                        |
| -------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                      | Público                         | Verifica estado de API/base según `HealthService`.                                                                              |
| `POST /auth/login`                                 | Público                         | Verifica credenciales; crea cookie y devuelve etapa del flujo. Los fallos de credenciales se presentan de forma indistinguible. |
| `POST /auth/contrasena/cambiar`                    | Etapa `CAMBIO_CONTRASENA`       | Cambia contraseña temporal validando política y confirmación; avanza etapa.                                                     |
| `POST /auth/totp/iniciar`                          | `VINCULAR_TOTP`                 | Genera secreto, URI otpauth y QR; una nueva llamada puede generar secreto nuevo no vinculado.                                   |
| `POST /auth/totp/vincular`                         | `VINCULAR_TOTP`                 | Comprueba primer código, cifra/vincula secreto y activa sesión.                                                                 |
| `POST /auth/totp/verificar`                        | `PENDIENTE_2FA`                 | Comprueba segundo factor en ingreso normal.                                                                                     |
| `GET /auth/sesion`                                 | Cualquier etapa con cookie      | Devuelve etapa, usuario e información de expiración/inactividad. Puede ser pasiva.                                              |
| `POST /auth/sesion/continuar`                      | Activa                          | Renueva la actividad explícitamente.                                                                                            |
| `POST /auth/logout`                                | Con o sin sesión                | Cierra sesión e invalida cookie; responde 204 incluso si ya no existía.                                                         |
| `GET /perfil`, `PATCH /perfil`                     | Cualquier rol activo            | Lee/edita el perfil propio; la edición admite nombre, apellido y teléfono.                                                      |
| `GET /admin/usuarios`                              | Admin                           | Lista con `q`, rol, estado, exclusión y paginación (por defecto 20 en backend).                                                 |
| `POST /admin/usuarios`                             | Admin                           | Crea cuenta pendiente y envía credencial temporal por correo; la contraseña no se devuelve.                                     |
| `GET /admin/usuarios/{id}`                         | Admin                           | Detalle, casos activos, TOTP, bloqueos e historial de envíos de credencial.                                                     |
| `PATCH /admin/usuarios/{id}`                       | Admin                           | Edita datos; un cambio de correo puede emitir nueva credencial y cerrar sesiones.                                               |
| `POST /admin/usuarios/{id}/rol`                    | Admin                           | Cambia rol, protegiendo último administrador y casos no reasignados.                                                            |
| `POST /admin/usuarios/{id}/activar`                | Admin                           | Reactiva cuenta inactiva.                                                                                                       |
| `POST /admin/usuarios/{id}/desactivar`             | Admin                           | Desactiva y cierra sesiones; puede requerir doctor destino para casos.                                                          |
| `POST /admin/usuarios/{id}/eliminar`               | Admin                           | Baja lógica conservando registros; puede requerir traslado de casos.                                                            |
| `POST /admin/usuarios/{id}/reasignar-casos`        | Admin                           | Traslada casos a otro doctor, todos o un subconjunto.                                                                           |
| `POST /admin/usuarios/{id}/restablecer-contrasena` | Admin                           | Nueva temporal, desvinculación TOTP y cierre de sesiones.                                                                       |
| `POST /admin/usuarios/{id}/reenviar-credencial`    | Admin                           | Reemite credencial temporal a cuenta pendiente.                                                                                 |
| `POST /admin/usuarios/{id}/desbloquear`            | Admin                           | Levanta bloqueo de cuenta por intentos.                                                                                         |
| `GET /admin/bitacora`                              | Admin                           | Consulta de auditoría con filtros/paginación; solo lectura.                                                                     |
| `GET /admin/bitacora/filtros`                      | Admin                           | Opciones de acciones y actores para filtros.                                                                                    |
| `GET /admin/auditoria/exportar`                    | Admin                           | CSV de eventos permitidos; periodo requerido, hasta 366 días; registra exportación.                                             |
| `GET /catalogos/tipos-documento`                   | Sesión activa                   | Catálogo de documentos.                                                                                                         |
| `GET /caracteristicas`                             | Sesión activa                   | Características activas del clasificador.                                                                                       |
| `POST /pacientes/consulta`                         | Doctor                          | Recibe documento en JSON, normaliza y busca historial propio/recibido sin revelar datos de otros doctores.                      |
| `POST /pacientes/analisis/buscar`                  | Doctor                          | Busca análisis por documento en el cuerpo POST, evitando documento en URL; pagina resultados del doctor.                        |
| `GET /admin/configuracion-inferencia`              | Admin                           | Consulta umbrales globales/por característica.                                                                                  |
| `PUT /admin/configuracion-inferencia`              | Admin                           | Actualiza umbrales para análisis futuros y audita el cambio.                                                                    |
| `POST /imagenes`                                   | Doctor                          | Multipart `archivo`; limita bytes, verifica imagen, elimina metadatos y guarda temporal en MinIO.                               |
| `POST /analisis`                                   | Doctor                          | Une imagen temporal y documento, seudonimiza paciente, persiste y encola; responde 202.                                         |
| `GET /analisis`                                    | Doctor                          | Historial propio y recibido con filtros por página. No incluye documento.                                                       |
| `GET /analisis/{id}/estado`                        | Doctor propietario/beneficiario | Estado y etapas de procesamiento; resultado completado incluye ruta de detalle.                                                 |
| `GET /analisis/{id}`                               | Doctor propietario/beneficiario | Resultado, imagen/mapas por URL firmada, probabilidades, umbrales, explicación, observaciones y datos de traslado.              |
| `POST /analisis/{id}/reintento`                    | Doctor autorizado               | Reencola análisis fallido reintentable con el mismo código.                                                                     |
| `GET /analisis/{id}/explicacion`                   | Doctor autorizado               | Estado/texto/intentos de explicación.                                                                                           |
| `POST /analisis/{id}/explicacion/reintentar`       | Doctor autorizado               | Reintenta explicación con límite de intentos.                                                                                   |
| `POST /analisis/{id}/observaciones`                | Doctor autorizado               | Registra valoración profesional; no permite duplicar valoración del mismo autor.                                                |

Los detalles de tipos, enumeraciones y JSON de cada endpoint están en los schemas (`backend/app/schemas/`) y su router. Las respuestas de error pasan por `core/errores.py`: sobre `{error:{codigo,mensaje,id_solicitud,...}}`; los errores internos se exponen como código genérico y el detalle se registra del lado servidor. Los endpoints y validaciones específicos añaden errores 4xx. Nginx genera 429 JSON y `Retry-After` para límites de autenticación y consulta de pacientes.

### Sesión y seguridad de paciente

El flujo es contraseña → posible cambio temporal → vinculación TOTP inicial o verificación TOTP → `ACTIVA`. La etapa actual se consulta en cada petición protegida; permisos no dependen de la navegación. `X-Actividad-Pasiva: 1` identifica polling que no debe reiniciar inactividad. El frontend registra manejadores globales para expiración de sesión, permiso y etapa inválida; las operaciones manuales se realizan con `credentials: "same-origin"`.

El número de documento solo se recibe en POST. `ServicioPacientes` lo normaliza y `Seudonimizador` aplica HMAC con versión de clave. El documento no se persiste como campo del caso ni debe ir a logs. La consulta solo revela casos del doctor actual, incluidos traslados. Nginx limita esas dos rutas a 30 solicitudes por minuto por IP. El login y operaciones de credencial/TOTP se limitan a 10/min por IP; la política de bloqueo por cuenta se implementa aparte en el servicio de autenticación.

## 4. Flujo de imagen, análisis y archivos

{% stepper %}
{% step %}
## Carga de archivo

Frontend carga archivo como multipart a `POST /imagenes`.
{% endstep %}

{% step %}
## Verificación y limpieza

El router lee como máximo `PESO_MAXIMO_BYTES + 1` para detectar exceso sin leerlo todo; la cadena de verificadores valida contenido real, sin confiar en extensión ni MIME, formato, legibilidad, peso y resolución mínima. La limpieza aplica orientación y elimina metadatos incrustados.
{% endstep %}

{% step %}
## Almacenamiento temporal

`ServicioImagenes` calcula SHA-256 del contenido limpio, crea `tmp_<ULID>` con propietario y expiración, sube bytes y metadatos no clínicos a `tmp/` en MinIO. El nombre original solo se sanea para la respuesta y no se persiste.
{% endstep %}

{% step %}
## Creación y encolado de análisis

`POST /analisis` toma temporal solo si pertenece al doctor y no expiró; verifica uso único, tipo/documento y confirmación cuando aplica, calcula seudónimo, obtiene modelo vigente, busca/crea caso, genera código `A-AAAA-NNNNNN`, mueve objeto de temporal a prefijo de análisis y guarda datos transaccionales. Encola tarea Celery. Si Redis no responde se reporta indisponibilidad y se evita dejar una solicitud incoherente.
{% endstep %}

{% step %}
## Procesamiento por worker

Worker carga la imagen de MinIO, vuelve a comprobar metadatos, mide calidad y clasifica. Registra etapa, resultados y regiones/mapas; falla con códigos de dominio `ERR-1001` para calidad, `ERR-1002` para modelo/Space, `ERR-1003` para cola al solicitar o `ERR-1004` para interno de tarea.
{% endstep %}

{% step %}
## Solicitud de explicación

Tras clasificación exitosa, solicita explicación en segundo plano. Gemini recibe únicamente resumen JSON de probabilidades, umbrales y regiones, no imagen ni mapa; el adaptador inspecciona recursivamente para prohibir imágenes/binarios. Si el proveedor falta o falla, queda explicación fallida y el resultado de clasificación sigue disponible.
{% endstep %}

{% step %}
## Consulta de resultado

El frontend consulta estado/explicación por HTTP y solicita detalle. La API firma URLs GET de vida limitada usando endpoint público; el navegador descarga directamente desde MinIO. El servidor usa endpoint interno para `put/get/copy/delete`.
{% endstep %}
{% endstepper %}

La cola usa Redis con serialización JSON, `acks_late`, prefetch 1 y timeout de conexión de 3 s al encolar. Si el worker se interrumpe, el mensaje puede redeliver; servicios evitan reprocesar un análisis que ya no está `PROCESANDO`. MinIO aplica ciclo de vida de un día para `tmp/` como respaldo; el vencimiento corto configurado se valida en la API. El bucket se inicializa con `scripts/init_storage.py`.

## 5. Frontend y llamadas HTTP

`main.tsx` monta React; `App.tsx` crea router y envuelve las pantallas con `ProveedorSesion`. `navegacion/pantallas.tsx` es catálogo de rutas/títulos/roles; las guardas `RutaPublica`, `RutaEtapa`, `RutaProtegida` y `RutaPorRol` coordinan navegación, pero la autoridad final es backend. `DisposicionInterna` y `disposicion/` presentan navegación y estructuras accesibles; `components/` contiene controles reutilizables y estilos CSS modules.

`services/api.ts` es el cliente común: base `/api/v1`, `fetch`, JSON, cookie same-origin, cabecera pasiva opcional y traducción de cuerpo de error a `ErrorApi`. La capa de servicios (`usuario.ts`, `usuariosAdmin.ts`) adapta nombres/types de UI. Las pantallas no llaman `fetch` directamente. `codigosError.ts` y `utils/avisosError.ts` traducen fallos a mensajes; la UI evita mostrar texto técnico del servidor. `simulados/usuario.ts` sigue siendo el origen de algunas funciones no conectadas.

La sesión se mantiene en memoria React. No se almacena token en local/session storage; existe una marca limitada para reintentar cierre pendiente. `relojInactividad.ts`, `useVigilanciaInactividad.ts` y `AvisoInactividad` calculan aviso/cierre a partir de datos y relojes de respuesta, y `ProveedorSesion` sincroniza cierre remoto/local.

### Estado real de pantallas

`MiPerfil` y `Usuarios` son pantallas conectadas a endpoints reales. El flujo de acceso —login, cambio de contraseña y TOTP— también consume API. Varias pantallas del catálogo siguen siendo `PantallaPendiente`: dashboard, nuevo análisis, historial, casos recibidos, alta/detalle de usuarios, bitácora, estado operativo, métricas, logs y parámetros. En consecuencia, que exista un endpoint backend no implica que ya exista una pantalla que lo use. `usuario.ts` reexporta un resumen de casos recibidos simulado.

## 6. Persistencia y migraciones

PostgreSQL es la fuente de verdad de usuarios, sesiones, casos, análisis, resultados, auditoría, configuración y traslados. `models/` declara entidades SQLAlchemy; los repositorios ejecutan consultas; Alembic es el mecanismo de esquema y no se debe usar `create_all`.

* `0001_inicial`: tablas/enums base a partir de modelos.
* `0002_restricciones`: SQL manual de checks, triggers y secuencia para código de análisis; entre otras, reglas de inmutabilidad de bitácora y datos de identidad seudonimizada.
* `0003_ajustes_contrato`: ajustes posteriores de traslados, etapas, regiones, onboarding y unicidad parcial de métricas.

El repositorio de modelos incluye entidades de reportes y telemetría que no equivalen a endpoints de reportes listos. La bitácora tiene consultas/exportación implementadas y controles de solo inserción/lectura en base.

## 7. Integraciones externas

| Integración              | Adaptador                           | Uso / datos que cruzan el límite                                                                                                                           |
| ------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL               | `core/database.py`, `repositories/` | Persistencia relacional y transacciones.                                                                                                                   |
| Redis/Celery             | `adapters/cola.py`, `workers/`      | Mensaje con ID de análisis; tarea ejecutada fuera de petición.                                                                                             |
| MinIO S3                 | `adapters/almacen.py`               | Imágenes originales saneadas, mapas de calor y URLs temporales firmadas.                                                                                   |
| Hugging Face Space       | `adapters/inferencia.py`            | Imagen de análisis y solicitud de inferencia autenticada/configurada por entorno; valida revisión/contrato del modelo. Puede simularse solo en desarrollo. |
| Gemini                   | `adapters/llm.py`                   | Solo probabilidades y regiones como JSON para redactar explicación; timeout y esquema de respuesta definidos.                                              |
| SMTP                     | `adapters/correo.py`                | Envío de credencial temporal; no registrar destinatario ni cuerpo. Mailpit captura correo en desarrollo.                                                   |
| HIBP/servicio compatible | `adapters/filtraciones.py`          | Verificación de contraseña filtrada mediante protocolo de rango; configurable/desactivable.                                                                |

La configuración central está en `core/config.py` y `.env.example`. Las direcciones internas de MinIO y públicas para firma son diferentes deliberadamente. Los secretos de HMAC y cifrado TOTP deben persistir entre reinicios; rotar HMAC implica conservar versiones históricas.

## 8. Modelo CNN y material no ejecutado por la aplicación

`Model_CNN/` agrupa fases de desarrollo, análisis exploratorio/documentación de datos, reportes de métricas/calibración/estructura de datos y código identificado para despliegue. Es material del ciclo de vida del modelo, distinto del backend clínico. El backend espera un Space HF remoto configurado con repositorio/revisión/checksum y usa `ServicioClasificacion` para traducir su respuesta a tablas y objetos MinIO. El código local de entrenamiento no se invoca con `docker compose up`.

Los documentos y reportes de `Model_CNN/Documentacion/Data-documentation/reports/` describen conjuntos/estadísticas y deben interpretarse como artefactos de análisis. Las carpetas de validaciones, informes manuales, XML/JSON de resultados y hashes son evidencias de ejecuciones fechadas y commits concretos; no garantizan por sí solos el comportamiento del checkout actual.

## 9. Diferencias importantes entre diseño y código actual

* `ARCHITECTURE.md` declara SSE `GET /api/v1/eventos` como camino de tiempo real, pero `main.py` no incluye router de eventos ni hay endpoint SSE registrado. El seguimiento implementado descrito en el código de análisis es polling HTTP con cabecera pasiva.
* El resumen de `ARCHITECTURE.md` dice que faltan bitácora y configuración/reportes en algunos apartados; en el checkout actual sí existen routers para bitácora, exportación, usuarios y configuración de inferencia. Reportes PDF, dashboards y estado operativo no aparecen como routers implementados.
* `frontend/CONTRATOS_API.md` mantiene propuestas y notas antiguas; úsese como historial de decisiones, contrastándolo con los routers actuales. Por ejemplo, hay una función simulada de casos recibidos y una pantalla provisional.
* No se encontró router de reportes PDF, exportación general de análisis, endpoint de eventos SSE ni dashboard de métricas operativas/modelo en `app/main.py`.
* El frontend página administración de usuarios de 8 en 8 aunque el backend admite por defecto 20; el frontend fija `por_pagina=8`.
* La documentación de arquitectura describe 20 tablas y enumera componentes; el esquema ejecutable efectivo debe comprobarse en los modelos y las migraciones, que incluyen 0003 además de las dos primeras.

## 10. Cómo seguir una funcionalidad en el código

Para una ruta: abrir `backend/app/main.py` para confirmar inclusión → `api/routers/<dominio>.py` → schema Pydantic utilizado → tipo `Servicio...` y fábrica en `api/deps.py` → `services/` → repositorios/adaptadores.

Para llamadas del navegador: `frontend/src/navegacion/pantallas.tsx` → pantalla → `frontend/src/services/` → `services/api.ts`.

Para una tabla: `models/` → migración Alembic → repositorio.

Para archivos y trabajos: router de imagen/análisis → servicios → `adapters/almacen.py`/cola → `workers/tareas.py` → procesamiento/clasificación/explicación.

Las pruebas automatizadas no se ejecutaron para esta documentación. La revisión fue estática de código y documentos del repositorio; la guía debe revisarse cuando cambien routers, schemas, despliegue o integración del modelo.
