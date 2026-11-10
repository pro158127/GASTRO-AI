# seguridad

## Inicio de sesión por etapas

```
login ─┬─ contraseña temporal ──► CAMBIO_CONTRASENA ─► VINCULAR_TOTP o PENDIENTE_2FA ─► ACTIVA
       ├─ sin app vinculada ────► VINCULAR_TOTP ─────────────────────────────────────► ACTIVA
       └─ con app vinculada ────► PENDIENTE_2FA ─────────────────────────────────────► ACTIVA
```

Cada etapa solo habilita sus propios endpoints; el resto del sistema exige la etapa `ACTIVA`.

| Control             | Cómo se implementa                                                                                                         | Requisito      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Contraseñas         | bcrypt con 12 rondas; política de 12 a 64 caracteres, sin comunes, sin datos propios y sin contraseñas filtradas           | RF-U02, RNF-02 |
| Contraseña temporal | Llega solo por correo y vence a las 72 h; se cambia obligatoriamente en el primer ingreso                                  | RF-U02, RF-U05 |
| Segundo factor      | TOTP (Google Authenticator u otra), secreto cifrado con AES-256-GCM, un código no se puede reusar                          | RF-U01         |
| Respuesta del login | Correo inexistente, contraseña incorrecta o cuenta bloqueada, inactiva o eliminada: siempre el mismo error                 | RF-U01 CA 2    |
| Tiempo constante    | Si el correo no existe se verifica igual contra un hash ficticio, para no revelar qué correos existen                      | RF-U01 CA 2    |
| Bloqueo             | 5 intentos fallidos (contraseña o código) bloquean la cuenta 15 min y queda en la bitácora                                 | RF-U12, RNF-03 |
| Límite por IP       | nginx: 10 peticiones por minuto en login, cambio de contraseña y segundo factor; 30 por minuto en la consulta de pacientes | RNF-03         |

## Sesión

* El token viaja en la cookie **`gastro_sesion`** (`HttpOnly`, `Secure`, `SameSite=Strict`). El navegador la envía sola; el JavaScript de la página no puede leerla.
* En la base solo se guarda el **hash SHA-256** del token.
* **Cierre por inactividad a los 10 minutos.** Las consultas automáticas del frontend envían `X-Actividad-Pasiva: 1` y no renuevan la sesión; así el cierre funciona aunque la pantalla esté esperando un resultado.
* Cerrar sesión la invalida en el servidor. Las cuentas desactivadas o eliminadas pierden sus sesiones abiertas.

## Roles y acceso

* Dos roles: **DOCTOR** y **ADMINISTRADOR**. El rol se lee de la base en cada petición.
* Rol equivocado → `403`. Recurso de otro usuario → `404`, como si no existiera, para no revelar que existe.
* Un doctor solo ve los análisis de los casos asignados a él (propios o recibidos por traslado). El administrador no ve datos clínicos.
* El sistema no permite quedarse sin administrador activo.

## Protección de los datos del paciente

| Medida               | Detalle                                                                                                                                                              | Requisito           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Seudónimo            | `HMAC-SHA256(clave, "TIPO:NUMERO")`. El número de documento nunca se guarda, no se escribe en logs y no sale en las respuestas; solo viaja en el cuerpo de un `POST` | RF-D01, RNF-04      |
| Normalización        | Se quitan puntos, espacios y guiones; largo máximo por tipo: CC 10, TI 11, CE 6                                                                                      | RF-D01 CA 9         |
| Claves versionadas   | Fuera del código y de la base; se pueden rotar sin perder los casos anteriores                                                                                       | RNF-28              |
| Imagen sin metadatos | Se vuelve a guardar sin EXIF, perfil de color ni textos incrustados                                                                                                  | RF-D02 CA 6, RF-D03 |
| Formato real         | La imagen se valida por su contenido, no por su nombre ni por lo que dice el navegador                                                                               | RF-D02              |
| Gemini sin imagen    | Solo recibe porcentajes y regiones descritas en palabras; un control bloquea cualquier imagen                                                                        | RF-R05 CA 2         |
| Modelo sin retención | El Space es privado, con HTTPS y token, y no guarda las imágenes                                                                                                     | RNF-30              |

## Errores sin información técnica

Toda respuesta de error tiene el mismo formato y nunca incluye trazas ni detalles internos (CWE-209). En los errores del servidor se muestra un código `ERR-xxxx` que también queda en el log junto con el detalle técnico, para que soporte pueda buscarlo.

## Bitácora de auditoría

Las acciones críticas (inicios de sesión, bloqueos, creación y cambios de cuentas, cambios de rol, traslados, cambios de configuración) quedan en una bitácora **inmutable**. La bitácora rechaza cualquier dato del paciente, resultado clínico o secreto en su detalle.
