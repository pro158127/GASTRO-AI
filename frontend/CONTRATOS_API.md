# Contratos de API propuestos por el frontend

Formatos de datos que las pantallas usan con **datos simulados** porque el endpoint todavía
no existe en `../ARCHITECTURE.md` § 3.5. Son propuestas del equipo de frontend para el
equipo del backend; ninguno es un endpoint existente hasta que el backend lo confirme.

Las funciones simuladas viven en `src/services/simulados/` y llevan un comentario
`// SIMULADO: falta endpoint ...`.

## Plantilla de cada propuesta

### `MÉTODO /ruta` · Pantalla(s) que lo usan

- **Estado:** propuesto | confirmado por backend | implementado
- **Solicitud:** campos y tipos.
- **Respuesta:** campos y tipos, con un ejemplo JSON ficticio.
- **Errores:** códigos y significado.
- **Notas:** permisos, paginación, dudas para el backend.

## Propuestas

### Cuerpo de error 5xx con código de referencia · W-01, W-31

- **Estado:** propuesto
- **Solicitud:** aplica a cualquier endpoint de `/api`.
- **Respuesta (cuando el servidor responde 5xx):** JSON con un código corto que el
  administrador pueda buscar en los registros, sin detalles técnicos ni rastros del sistema
  (CWE-209, nota de W-31 en Figma):

  ```json
  { "codigo_referencia": "ERR-7F3A" }
  ```

- **Errores:** solo 5xx.
- **Notas:** W-31 en Figma pide mostrar «informe al administrador este código: ERR-7F3A».
  Hoy la API no lo entrega, así que el frontend muestra solo «Algo salió mal» y «Ocurrió un
  error inesperado. Intente de nuevo.». Cuando el campo exista, el frontend añade la frase
  del código. Es una propuesta; el nombre del campo lo decide el backend.

### `POST /api/auth/logout` · W-01f

- **Estado:** propuesto
- **Solicitud:** requiere `Authorization: Bearer <token>`. Sin cuerpo.
- **Respuesta:** `204 No Content`, sin cuerpo. Desde ese momento el token usado queda
  invalidado en el servidor.
- **Errores:**
  - `401`: el token falta, ya venció o ya estaba invalidado.
  - `5xx`: fallo del servidor (ver la propuesta del código de referencia, arriba).
- **Notas:**
  - Hoy no existe: `../ARCHITECTURE.md` § 3.5 no lista un endpoint de cierre de sesión.
    El frontend solo borra el token del navegador, y ese token sigue siendo válido en el
    servidor hasta que vence a los 60 minutos (no hay refresh). La nota de W-01f en Figma
    dice que «la sesión se invalida en el servidor» (RF-U10 CA 1 y 2); con el cierre solo
    local eso no se cumple, y es relevante en consultorios con equipos compartidos.
  - Tras el cierre, cualquier petición con ese token debe responder `401`, para que el
    frontend cierre la sesión como ya lo hace con un token vencido.
  - El mecanismo de invalidación (por ejemplo, una lista de tokens revocados con
    vencimiento igual al que les queda de vida) lo decide el backend.
  - Más adelante, el cierre automático por inactividad (W-05, RF-U10 CA 5) debería usar el
    mismo endpoint.
  - **Qué hará el frontend cuando exista:**
    1. Agregar en `src/services/api.ts` una función que llame a este endpoint con el token
       actual.
    2. Hacer que `cerrarSesion()` de `ProveedorSesion` la llame antes de borrar el token
       local.
    3. Cerrar la sesión local siempre, aunque la llamada falle (por ejemplo, sin conexión) o
       responda `401`, para que nadie quede atrapado en una sesión que no puede cerrar.
    4. Mantener el aviso «Cerró sesión correctamente» de W-01f. Si el backend prefiere que no
       se muestre cuando falla la invalidación en el servidor, lo ajustamos.
