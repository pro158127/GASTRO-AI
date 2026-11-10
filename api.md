# api

## Convenciones

* **Base:** `/api/v1`. Intercambio en JSON (UTF-8), salvo la carga de imágenes (`multipart`).
* **Fechas:** ISO 8601 en UTC. **Probabilidades y umbrales:** decimales de 0 a 1 (`0.84` = 84 %).
* **Sesión:** cookie `gastro_sesion`; el frontend usa `fetch` con `credentials: "same-origin"`.
* **Paginación:** `?pagina=1&por_pagina=20` (máximo 100) → `{"items": [...], "paginacion": {"pagina", "por_pagina", "total"}}`.
* **Documentación interactiva:** `http://localhost:8000/docs` (Swagger de FastAPI) cuando la API corre sin nginx.

## Formato de error

```json
{
  "error": {
    "codigo": "DOCUMENTO_INVALIDO",
    "mensaje": "Texto para el usuario",
    "campos": [
      {
        "campo": "numero_documento",
        "mensaje": "..."
      }
    ],
    "id_solicitud": "req_01JC5Z8X9Q2W3E4R5T6Y7U8I9O"
  }
}
```

* `id_solicitud` identifica la petición en el log.
* `campos` solo aparece cuando el error es de un campo concreto.
* En los errores `5xx`, `codigo` es un `ERR-xxxx` genérico.

| HTTP      | Código                        | Cuándo                                                                   |
| --------- | ----------------------------- | ------------------------------------------------------------------------ |
| 401       | `SESION_EXPIRADA`             | Sin sesión o vencida; con `motivo` `INACTIVIDAD` o `DEMASIADOS_INTENTOS` |
| 401       | `AUTH_CREDENCIALES_INVALIDAS` | Cualquier fallo de credenciales en el login (siempre el mismo)           |
| 401 / 422 | `TOTP_CODIGO_INVALIDO`        | Código del segundo factor incorrecto (401 al verificar, 422 al vincular) |
| 403       | `PERMISO_DENEGADO`            | El rol no permite la acción                                              |
| 403       | `ETAPA_INVALIDA`              | Falta un paso del inicio de sesión (trae la etapa actual)                |
| 404       | `NO_ENCONTRADO`               | No existe o no pertenece al usuario                                      |
| 422       | `DATOS_INVALIDOS`             | Campo faltante o con formato incorrecto                                  |
| 429       | `DEMASIADOS_INTENTOS`         | Límite de peticiones por IP                                              |

Los códigos propios de cada módulo están en `ARCHITECTURE.md` §3.5 del repositorio.

## Endpoints (35)

### Salud y autenticación

| Método | Ruta                       | Acceso                    | Descripción                                                       |
| ------ | -------------------------- | ------------------------- | ----------------------------------------------------------------- |
| GET    | `/health`                  | Público                   | Estado de la API y de la base de datos                            |
| POST   | `/auth/login`              | Público                   | Correo y contraseña; devuelve la siguiente etapa y deja la cookie |
| POST   | `/auth/contrasena/cambiar` | Etapa `CAMBIO_CONTRASENA` | Cambio obligatorio de la contraseña temporal                      |
| POST   | `/auth/totp/iniciar`       | Etapa `VINCULAR_TOTP`     | Código QR y secreto para vincular la aplicación autenticadora     |
| POST   | `/auth/totp/vincular`      | Etapa `VINCULAR_TOTP`     | Primer código válido: vincula la aplicación y activa la cuenta    |
| POST   | `/auth/totp/verificar`     | Etapa `PENDIENTE_2FA`     | Código de 6 dígitos en cada ingreso                               |
| GET    | `/auth/sesion`             | Cualquier etapa           | Usuario, etapa y tiempos de inactividad                           |
| POST   | `/auth/sesion/continuar`   | Sesión activa             | «Sigo aquí» del aviso de inactividad                              |
| POST   | `/auth/logout`             | Cualquiera                | Cierra la sesión en el servidor                                   |

### Perfil y administración

| Método | Ruta                                          | Acceso        | Descripción                                                  |
| ------ | --------------------------------------------- | ------------- | ------------------------------------------------------------ |
| GET    | `/perfil`                                     | Cualquier rol | Datos propios                                                |
| PATCH  | `/perfil`                                     | Cualquier rol | Editar nombre, apellido y teléfono                           |
| GET    | `/admin/usuarios`                             | Administrador | Lista de cuentas con filtros y paginación                    |
| POST   | `/admin/usuarios`                             | Administrador | Crear cuenta; la contraseña temporal va solo por correo      |
| GET    | `/admin/usuarios/{id}`                        | Administrador | Detalle de una cuenta                                        |
| PATCH  | `/admin/usuarios/{id}`                        | Administrador | Editar datos, incluido el correo                             |
| POST   | `/admin/usuarios/{id}/rol`                    | Administrador | Cambiar el rol                                               |
| POST   | `/admin/usuarios/{id}/activar`                | Administrador | Reactivar una cuenta                                         |
| POST   | `/admin/usuarios/{id}/desactivar`             | Administrador | Desactivar (traslada sus casos a otro doctor)                |
| POST   | `/admin/usuarios/{id}/eliminar`               | Administrador | Eliminación lógica (traslada sus casos)                      |
| POST   | `/admin/usuarios/{id}/reasignar-casos`        | Administrador | Pasar casos a otro doctor                                    |
| POST   | `/admin/usuarios/{id}/restablecer-contrasena` | Administrador | Nueva temporal y desvinculación del segundo factor           |
| POST   | `/admin/usuarios/{id}/reenviar-credencial`    | Administrador | Reenviar la temporal a una cuenta pendiente                  |
| POST   | `/admin/usuarios/{id}/desbloquear`            | Administrador | Levantar el bloqueo por intentos                             |
| GET    | `/admin/configuracion-inferencia`             | Administrador | Umbrales vigentes                                            |
| PUT    | `/admin/configuracion-inferencia`             | Administrador | Cambiar umbrales (10 % a 90 %); solo afecta análisis futuros |

### Catálogos, pacientes y análisis

| Método | Ruta                                    | Acceso        | Descripción                                          |
| ------ | --------------------------------------- | ------------- | ---------------------------------------------------- |
| GET    | `/catalogos/tipos-documento`            | Cualquier rol | CC, TI y CE con su largo máximo                      |
| GET    | `/caracteristicas`                      | Cualquier rol | Características que evalúa el modelo                 |
| POST   | `/pacientes/consulta`                   | Doctor        | ¿Tengo historial de este paciente? (solo mis casos)  |
| POST   | `/imagenes`                             | Doctor        | Cargar la imagen al área temporal                    |
| POST   | `/analisis`                             | Doctor        | Crear el análisis y enviarlo a procesar (`202`)      |
| GET    | `/analisis/{id}/estado`                 | Doctor        | Avance por etapas (consulta periódica)               |
| GET    | `/analisis/{id}`                        | Doctor        | Resultado completo                                   |
| POST   | `/analisis/{id}/reintento`              | Doctor        | Volver a procesar un análisis fallido (mismo código) |
| GET    | `/analisis/{id}/explicacion`            | Doctor        | Estado y texto de la explicación                     |
| POST   | `/analisis/{id}/explicacion/reintentar` | Doctor        | Reintentar la explicación (máximo 3 intentos)        |

## Ejemplo: crear un análisis

{% stepper %}
{% step %}
### Cargar la imagen al área temporal

```http
POST /api/v1/imagenes
Content-Type: multipart/form-data   (campo «archivo»)

201 {"imagen_id": "tmp_01J9…", "nombre": "endoscopia_001.jpg", "formato": "JPEG",
     "ancho": 1920, "alto": 1080, "peso_bytes": 482113, "sha256": "9f86…",
     "expira_en": "2026-11-09T19:50:28Z"}
```
{% endstep %}

{% step %}
### Crear el análisis y enviarlo a procesar

```http
POST /api/v1/analisis
{"imagen_id": "tmp_01J9…", "tipo_documento": "CC",
 "numero_documento": "1.234.567.890", "confirmacion_documento": "1234567890"}

202 {"analisis": {"id": "a1b2…", "codigo": "A-2026-000123", "estado": "PROCESANDO",
                  "solicitado_en": "2026-11-09T19:21:00Z"}}
```
{% endstep %}
{% endstepper %}
