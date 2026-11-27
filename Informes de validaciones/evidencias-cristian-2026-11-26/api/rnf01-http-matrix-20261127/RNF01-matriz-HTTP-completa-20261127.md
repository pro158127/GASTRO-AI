# RNF-01 / CP-RNF-01 — matriz HTTP completa de denegación por rol

Fecha: 2026-11-27
Rama auditada: `testing/qa-branch`
SHA de aplicación: `6442125527457a5879c7e08d5a2cbd704e8db01c`

## Alcance

Se enumeraron las operaciones de la especificación OpenAPI y se contrastaron con las anotaciones de rol en los routers. Las 23 operaciones administrativas usan `SesionAdmin`; las 17 operaciones clínicas/de doctor usan `SesionDoctor`. Rutas públicas, de autenticación y recursos compartidos de sesión activa (perfil y catálogos) no se clasificaron como exclusivos de un rol.

## Ejecución

Comando: `backend/.venv/bin/python Informes de validaciones/evidencias-cristian-2026-11-26/api/rnf01-http-matrix-20261127/check_role_http_matrix.py`

El script consulta cada método/ruta protegida mediante `TestClient` sobre la aplicación FastAPI real, con una sesión sintética del rol opuesto. La dependencia de autenticación se sustituye por una sesión en memoria; no se accede a la base de datos ni a datos clínicos. Se conservan los routers, la resolución de dependencias, el middleware y el manejador HTTP del aplicativo.

| Matriz negativa | Operaciones comprobadas | HTTP 403 + `PERMISO_DENEGADO` |
|---|---:|---:|
| Doctor en rutas administrativas | 23 | 23 |
| Administrador en rutas de doctor | 17 | 17 |
| **Total** | **40** | **40** |

Fallos: **0**. No se invocaron servicios de dominio en las rutas denegadas. Hash SHA-256 del verificador: `987352a0d0f1e6a20f5b4e8ce316a558518f451d370e305d0b3cfc56f58958e8`.

## Resultado

La matriz de rutas exclusivas cumple la denegación por rol en las 40 operaciones HTTP enumeradas. Las rutas compartidas y públicas quedan fuera de esta matriz negativa y conservan sus controles de sesión/etapa correspondientes.
