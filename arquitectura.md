# arquitectura

## Tipo de arquitectura

El backend es un **monolito modular en capas** con **procesamiento asíncrono**:

* **Una sola aplicación** (no microservicios), organizada en capas y en módulos del dominio.
* **Capas** con responsabilidades separadas: controlador → servicio → repositorio.
* **Adaptadores** que aíslan los servicios externos (Hugging Face, Gemini, MinIO, correo).
* **Worker en segundo plano** (Celery) para el trabajo pesado: la API responde de inmediato y el análisis se procesa aparte.
* **Despliegue en un solo servidor** con Docker Compose.

La inferencia del modelo se ejecuta fuera del backend, en un Space privado de Hugging Face. Separarla permite probar la integración con un adaptador falso y no convierte el sistema en microservicios: el resto de la aplicación se despliega como un solo bloque.

## Componentes

```
Navegador ──► nginx :80 ──┬── /         ──► frontend (React compilado)
                          └── /api/v1/* ──► api (FastAPI)
                                               │
                                               ├── PostgreSQL 16   (datos)
                                               ├── MinIO           (imágenes, mapas de calor, PDF)
                                               └── Redis ──► worker (Celery)
                                                                ├── Space privado de Hugging Face
                                                                └── Gemini (explicación)
```

| Componente                | Responsabilidad                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| **nginx**                 | Puerta de entrada única: sirve el frontend, enruta la API y limita peticiones por IP                   |
| **api** (FastAPI)         | Recibe las peticiones, valida, aplica reglas y responde. Nunca ejecuta el modelo                       |
| **worker** (Celery)       | Procesa cada análisis por etapas: anonimizar, calidad, clasificación, mapa de calor y explicación      |
| **PostgreSQL**            | Datos estructurados: usuarios, casos, análisis, resultados, bitácora                                   |
| **MinIO**                 | Archivos: imágenes limpias, mapas de calor y, más adelante, reportes PDF. La base solo guarda su clave |
| **Redis**                 | Cola de tareas entre la API y el worker (con persistencia AOF para no perder tareas)                   |
| **Space de Hugging Face** | Ejecuta EfficientNet y Grad-CAM en una revisión fija del modelo                                        |
| **Gemini**                | Redacta la explicación a partir de probabilidades y regiones (nunca recibe la imagen)                  |

## Capas del código

```
backend/app/
├── api/routers/     Controladores: reciben la petición, validan y llaman al servicio. Sin SQL.
├── api/deps.py      Inyección de dependencias: sesión de BD, usuario, rol y servicios.
├── schemas/         Esquemas de entrada y salida (Pydantic).
├── services/        Reglas del negocio. No conocen FastAPI ni escriben SQL.
├── repositories/    Única capa que usa la base de datos.
├── models/          Tablas (SQLAlchemy), un archivo por módulo del dominio.
├── adapters/        Servicios externos: Hugging Face, Gemini, MinIO, correo, contraseñas filtradas.
├── workers/         Aplicación Celery y tareas.
└── core/            Configuración, base de datos, errores, seguridad y seudónimo.
```

Cada servicio recibe sus dependencias por el constructor. Eso permite probarlo con versiones falsas de la base de datos y de los servicios externos (RNF-19, módulos independientes).

## Patrones de diseño

| Patrón                        | Dónde se aplica                     | Para qué                                                                           |
| ----------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| **Repositorio**               | `repositories/`                     | Aislar el acceso a datos del resto del código                                      |
| **Inyección de dependencias** | `api/deps.py` (FastAPI `Depends`)   | Armar cada servicio con sus piezas y reemplazarlas en pruebas                      |
| **Cadena de responsabilidad** | Verificadores de imagen             | Peso → formato real → resolución, del más barato al más costoso                    |
| **Estrategia**                | Política de umbral                  | Umbral global o uno por característica, intercambiables                            |
| **Adaptador**                 | Hugging Face, Gemini, MinIO, correo | El resto del sistema no conoce los detalles de cada proveedor                      |
| **Fachada**                   | `ServicioAnalisis`                  | Una sola llamada para crear un análisis: documento, seudónimo, caso, imagen y cola |
| **Proxy**                     | `ProxyAccesoAnalisis`               | Solo el doctor asignado al caso puede ver el análisis                              |
| **Estado**                    | Estado de la cuenta                 | Qué transiciones permite cada estado (pendiente, activo, inactivo, eliminado)      |
| **Observador**                | Bitácora de auditoría               | Registrar acciones críticas sin acoplarlas al servicio que las hace                |
| **Builder**                   | Reporte PDF                         | _Planeado_ para el módulo de reportes                                              |

## Decisiones principales

| Decisión                                                            | Motivo                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Sesión en cookie `HttpOnly`, no tokens en el navegador              | El JavaScript de la página no puede leer el token (protección contra XSS) |
| Procesamiento asíncrono con respuesta `202`                         | La inferencia puede tardar hasta 30 s; la API no se bloquea               |
| El resultado se guarda **antes** de pedir la explicación            | Si Gemini falla, el doctor igual ve el resultado (RF-R05 CA 3)            |
| El umbral se copia en cada resultado                                | Un cambio de configuración no altera análisis ya hechos (RF-A01 CA 2)     |
| Modelo fijado a un commit SHA                                       | Siempre se sabe qué modelo produjo cada resultado (RNF-29)                |
| Seudónimo HMAC con claves versionadas                               | El documento nunca se guarda y las claves se pueden rotar (RNF-28)        |
| Seguimiento con consultas pasivas; tiempo real con SSE (_planeado_) | Más simple que WebSocket y compatible con el cierre por inactividad       |
| Migraciones solo con Alembic                                        | El esquema es reproducible y versionado; nunca `create_all` en producción |
