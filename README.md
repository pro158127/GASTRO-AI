# estado

_Actualizado al 9 de noviembre de 2026 · rama `feature/63-backend-base`, commit `8b22250`._

## Hecho

| Bloque                          | Contenido                                                                                                                       | Requisitos                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Base                            | Estructura por capas, configuración, Docker Compose, nginx, MinIO, Redis, errores                                               | RNF-18, RNF-19                                  |
| Base de datos                   | 20 tablas, restricciones, triggers y carga inicial                                                                              | —                                               |
| Autenticación y sesión          | Login por etapas, segundo factor, contraseña temporal, bloqueo, inactividad, cierre de sesión                                   | RF-U01, U02, U03, U10, U12 · RNF-01, 02, 03     |
| Perfil y usuarios               | Perfil propio y gestión completa de cuentas del administrador                                                                   | RF-U04 a U09, U11                               |
| Traslados (administrador)       | Traslado de casos al desactivar, eliminar o reasignar                                                                           | RF-A06                                          |
| Catálogos, pacientes y umbrales | Seudónimo, consulta de paciente, configuración de umbrales                                                                      | RF-D01, RF-A01                                  |
| Imagen y análisis               | Carga, verificación, limpieza de metadatos, creación, estado, resultado y control de calidad                                    | RF-D01, D02, D03, RF-P01, RF-R01 a R04 · RNF-04 |
| Modelo                          | Clasificación y Grad-CAM con Hugging Face, log de inferencia y modo simulado (el redimensionamiento de RF-P02 lo hace el Space) | RF-M01, M03, RF-P04 · RNF-29, RNF-30            |
| Explicación                     | Gemini con validación y reintentos; reintento del análisis                                                                      | RF-R05                                          |

**En números:** 35 endpoints, 298 pruebas y 98 % de cobertura.

## Pendiente

| Siguiente                     | Contenido                                                                             | Requisitos       |
| ----------------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| 9 · Observaciones e historial | Valoración del doctor sobre el resultado e historial del paciente                     | RF-D04, RF-H01   |
| 10 · Reportes                 | Descarga de reportes en PDF con el aviso experimental                                 | RF-H02           |
| 11 · Traslados (doctor)       | Bandeja de casos recibidos                                                            | RF-A06, RF-A07   |
| 12 · Bitácora y monitoreo     | Consulta de la bitácora, estado de los servicios, métricas del modelo y logs técnicos | RF-A02, A04, A05 |
| 13 · Dashboards y tiempo real | Dashboard clínico y técnico, eventos en tiempo real (SSE)                             | RF-DB01, RF-DB02 |
| 14 · Cierre                   | Integración continua, documentación final y copias de seguridad                       | RNF-20           |

## Dependencias externas

* **Space de Hugging Face:** lo publica el equipo de ML. Mientras tanto se usa el modo simulado en desarrollo. Se necesitan la URL, el token, el repositorio, el commit SHA del modelo, la huella de los pesos, los umbrales sugeridos y las métricas.
* **Servidor SMTP real:** en desarrollo los correos llegan a Mailpit.

## Integración con el frontend

El frontend (React) depende de la API `/api/v1` y de la cookie de sesión de este backend, por lo que su pull request se integra **después** del backend. Hoy el frontend cubre el flujo de acceso; las pantallas de análisis y administración se construyen sobre los endpoints ya disponibles.
