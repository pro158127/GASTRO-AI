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

### `GET /api/auth/me` · estructura de las pantallas internas (barra lateral y barra superior)

- **Estado:** propuesto
- **Solicitud:** requiere `Authorization: Bearer <token>`. Sin cuerpo.
- **Respuesta:** `200` con los datos del usuario del token. Los campos reflejan el modelo
  `User` del backend (`full_name`, `email`, rol):

  ```json
  { "full_name": "Dra. Ana Pérez", "email": "ana.perez@ejemplo.test", "role": "doctor" }
  ```

  `role` toma los nombres que ya crea `seed.py`: `admin`, `doctor` o `tecnico`.
- **Errores:** `401` (token ausente, vencido o invalidado); `5xx` (ver el código de referencia).
- **Notas:**
  - Hoy el login solo devuelve el token y no hay endpoint de usuario actual, así que el
    frontend no puede saber el rol ni el nombre. El frontend **no decodifica el JWT** para
    obtenerlos.
  - El frontend usa `role` solo para elegir qué menú mostrar (comodidad de interfaz). La
    autorización real debe hacerse en cada endpoint del backend, a partir del token.
  - Figma dibuja menús para Doctor y Administrador. **Pregunta para el backend:** ¿qué es el
    rol `tecnico` y qué debería ver? Hoy el frontend no le muestra ningún ítem.
  - Figma escribe el nombre con tratamiento («Dra. Ana Pérez»). Se simula como parte de
    `full_name`; el backend decide si lo guarda así o entrega otro campo.
  - **Qué hará el frontend cuando exista:** implementar `obtenerUsuarioActual()` en
    `src/services/api.ts` y cambiar el export de `src/services/usuario.ts`.
- **Simulación actual:** `src/services/simulados/usuario.ts`. El rol simulado sale de
  `VITE_ROL_SIMULADO` (`doctor` por defecto o `admin`) en `frontend/.env.local`. Mientras esto
  esté simulado, un build de producción muestra el menú de doctor a todos.

### `GET /api/casos-recibidos/resumen` · contador del menú «Casos recibidos» (W-15, W-15b)

- **Estado:** propuesto
- **Solicitud:** requiere `Authorization: Bearer <token>`. Solo para el rol doctor.
- **Respuesta:** `200` con la cantidad de casos trasladados por otros doctores que el doctor
  todavía no ha revisado:

  ```json
  { "sin_revisar": 4 }
  ```
- **Errores:** `401`; `403` si el usuario no es doctor; `5xx`.
- **Notas:**
  - El contador del menú se oculta cuando vale 0 y se anuncia como «Casos recibidos, 4 sin
    revisar» (nota del componente «Ítem de navegación» en Figma, marcado «Fase 2»).
  - Los casos trasladados no se suman a los demás indicadores (RF-A07 CA 2); el dashboard
    debe usar este mismo dato para su indicador «Casos recibidos».
  - Pendiente definir cuándo se actualiza (al cargar la pantalla, al abrir un traslado).
- **Simulación actual:** valor fijo 4 en `src/services/simulados/usuario.ts`, único lugar del
  dato. Es un valor de ejemplo del componente de Figma; el dashboard W-15 dibuja 0.
