# Contratos de API propuestos por el frontend

Formatos de datos que las pantallas usan con **datos simulados** porque el endpoint todavía
no existe en `../ARCHITECTURE.md` § 3.5. Son propuestas del equipo de frontend para el
equipo del backend; ninguno es un endpoint existente hasta que el backend lo confirme.

Las funciones simuladas viven en `src/services/simulados/` y llevan un comentario
`// SIMULADO: falta endpoint ...`.

Las propuestas marcadas **implementado** ya existen en el backend (rama
`feature/63-backend-base`, commit `8492a99`, base `/api/v1`) y el frontend las usa; se
conservan aquí como registro de en qué quedó cada una. La fuente de verdad del contrato
real es `../ARCHITECTURE.md` § 3.5 de esa rama.

## Plantilla de cada propuesta

### `MÉTODO /ruta` · Pantalla(s) que lo usan

- **Estado:** propuesto | confirmado por backend | implementado
- **Solicitud:** campos y tipos.
- **Respuesta:** campos y tipos, con un ejemplo JSON ficticio.
- **Errores:** códigos y significado.
- **Notas:** permisos, paginación, dudas para el backend.

## Resumen

| Propuesta | Estado | Cómo quedó en el backend |
|---|---|---|
| Código de referencia en errores 5xx | implementado | `ERR-xxxx` en `codigo` de los 5xx; `id_solicitud` en todo error |
| `POST /api/auth/logout` | implementado | `POST /api/v1/auth/logout`, con cookie |
| `GET /api/auth/me` | implementado | `GET /api/v1/auth/sesion` |
| `GET /api/casos-recibidos/resumen` | propuesto | pendiente (ruta pasa a `/api/v1`) |
| `GET /api/v1/admin/usuarios`: parámetro `orden` | implementado | ya acepta `orden`; W-09 todavía no lo usa |
| `GET /api/v1/admin/usuarios`: `q` en la query string | observación | sin cambio en el contrato |
| `rol_nombre` en los usuarios del administrador (U-8) | implementado | llega en cada `usuario`; el frontend ya lo muestra |
| `GET /api/v1/catalogos/roles` (U-16) | propuesto | no existe; W-10 usa una tabla local |

## Propuestas

### Cuerpo de error 5xx con código de referencia · W-01, W-31

- **Estado:** implementado, con otra forma que la propuesta (`codigo_referencia`).
- **Forma real** (`../ARCHITECTURE.md` § 3.5):

  ```json
  { "error": { "codigo": "ERR-7F3A", "mensaje": "Algo salió mal. Intenta de nuevo.", "id_solicitud": "req_01JC5Z8X9Q2W3E4R5T6Y7U8I9O" } }
  ```

  En los **5xx**, `codigo` es un `ERR-xxxx` genérico: es el código que W-31 le pide al
  usuario dictar al administrador, y el mismo queda en el log con la traza. En los demás
  errores `codigo` es un código de la tabla de § 3.5 y `id_solicitud` identifica la petición.
  Algunos errores traen datos propios dentro de `error`: `motivo` (`SESION_EXPIRADA`),
  `etapa` (`ETAPA_INVALIDA`), `campos` y `requisitos`.
- **Qué hace el frontend:** `ErrorApi` (`src/services/api.ts`) guarda `estado`, `codigo`,
  `idSolicitud`, `motivo` y `etapa`; `idError` es el `ERR-xxxx` y solo existe en los 5xx. Los
  códigos viven en `src/services/codigosError.ts`. Los textos que ve el usuario salen de
  Figma y se eligen por `codigo`; el `mensaje` del servidor no se muestra. Con `idError`, W-31
  y el inicio de sesión agregan la frase «Si continúa, informe al administrador este código:
  ERR-7F3A.».
- **Notas:** el `429 DEMASIADOS_INTENTOS` (límite de 10 por minuto por IP en login y códigos,
  con `Retry-After: 60`) no tiene estado en Figma; el login muestra un aviso propio
  («Demasiados intentos. Espere un minuto e intente de nuevo.»), pendiente de agregar al
  diseño.

### `POST /api/auth/logout` · W-01f

- **Estado:** implementado como `POST /api/v1/auth/logout`.
- **Cómo quedó:** la sesión viaja en la cookie `gastro_sesion` (HttpOnly), así que no hay
  token ni `Authorization`. Cuerpo opcional `{motivo: "manual" | "inactividad"}`. Responde
  **siempre** `204` y borra la cookie, aunque la sesión ya hubiera vencido o no existiera.
  Funciona en cualquier etapa del inicio de sesión.
- **Qué hace el frontend:** `ProveedorSesion.cerrarSesion` llama con `{motivo: "manual"}` y
  cierra la sesión local siempre. Si el servidor responde 204, muestra W-01f. Si la llamada
  falla, muestra una alerta de advertencia («Se cerró la sesión en este equipo, pero no
  pudimos confirmarlo con el servidor…», pendiente de agregar a Figma) y guarda la marca de
  «cierre pendiente» en `sessionStorage`; al recargar reintenta el logout antes de consultar
  la sesión.
- **Notas:** `motivo: "inactividad"` se usará con W-05 (cierre automático por inactividad).

### `GET /api/auth/me` · estructura de las pantallas internas (barra lateral y barra superior)

- **Estado:** implementado como `GET /api/v1/auth/sesion`.
- **Cómo quedó:** responde `{etapa, usuario: {id, nombre, apellido, rol}, inactividad:
  {aviso_en_s, cierre_en_s, ultima_actividad_en}}`, con `rol` igual a `DOCTOR` o
  `ADMINISTRADOR`. Sirve en cualquier etapa del inicio de sesión; con `X-Actividad-Pasiva: 1`
  no renueva la inactividad. El nombre y el apellido vienen separados (el tratamiento «Dra.»
  de los ejemplos de Figma ya no se muestra). Sin sesión responde `401 SESION_EXPIRADA`.
- **Respuestas a las preguntas de la propuesta:** el rol `tecnico` no existe; solo hay
  `DOCTOR` y `ADMINISTRADOR`. El frontend usa `rol` solo para elegir el menú; la autorización
  real la hace el backend en cada endpoint.
- **Qué hace el frontend:** `ProveedorSesion` lo consulta al cargar la página y tras el
  login. Se eliminó el usuario simulado y `VITE_ROL_SIMULADO`. `inactividad` se guarda, pero
  todavía no se usa (lo necesita W-05).
- **Pregunta para el backend:** `ruta_inicial` (`/doctor/dashboard`, `/admin/dashboard`) llega
  al activar la cuenta (`/auth/totp/vincular` y `/auth/totp/verificar`). Hoy las rutas del
  frontend son `/dashboard`; hay que acordar cuál prevalece.

### `GET /api/casos-recibidos/resumen` · contador del menú «Casos recibidos» (W-15, W-15b)

- **Estado:** propuesto. La ruta pasa a `GET /api/v1/casos-recibidos/resumen` por la nueva
  base; el backend aún lista los traslados como «planeados».
- **Solicitud:** requiere sesión en etapa `ACTIVA` (cookie). Solo para el rol doctor.
- **Respuesta:** `200` con la cantidad de casos trasladados por otros doctores que el doctor
  todavía no ha revisado:

  ```json
  { "sin_revisar": 4 }
  ```
- **Errores:** `401 SESION_EXPIRADA`; `403 PERMISO_DENEGADO` si el usuario no es doctor;
  `5xx` con `ERR-xxxx`.
- **Notas:**
  - El contador del menú se oculta cuando vale 0 y se anuncia como «Casos recibidos, 4 sin
    revisar» (nota del componente «Ítem de navegación» en Figma, marcado «Fase 2»).
  - Los casos trasladados no se suman a los demás indicadores (RF-A07 CA 2); el dashboard
    debe usar este mismo dato para su indicador «Casos recibidos».
  - Pendiente definir cuándo se actualiza (al cargar la pantalla, al abrir un traslado). Si
    se consulta automáticamente, debería llevar `X-Actividad-Pasiva: 1`.
- **Simulación actual:** valor fijo 4 en `src/services/simulados/usuario.ts`, único lugar del
  dato. Es un valor de ejemplo del componente de Figma; el dashboard W-15 dibuja 0.

### Parámetro `orden` en `GET /api/v1/admin/usuarios` · W-09

- **Estado:** implementado. El backend ya acepta `orden` con los valores que se proponían aquí
  (`nombre`, `correo`, `rol`, `estado`, con `-` delante para descendente) y desempata siempre por
  apellido, nombre e `id`, así que la paginación es estable. También entrega ya `conteos`
  (resumen por estado, U-1) y `ultimo_envio` en cada usuario.
- **Pendiente en el frontend:** W-09 todavía pinta los encabezados como texto plano y no muestra
  el resumen de conteos. Queda para la tarea del bloque de W-09 (U-1 y U-15); no entró en la
  tarea 2a (crear usuario).
- **Texto original de la propuesta:**
- **Por qué:** W-09 (Figma 48:836) dibuja los encabezados Nombre, Correo, Rol y Estado como
  ordenables (componente «Encabezado de tabla», con `aria-sort`), con «Nombre ↑» activo. Hoy el
  servidor ordena siempre por apellido y luego nombre, y ordenar en el navegador solo
  ordenaría la página actual de 8. Mientras no exista, el frontend muestra los encabezados como
  texto plano, sin íconos ni `aria-sort`.
- **Solicitud propuesta:** `orden` opcional, con el mismo formato que `GET /api/v1/analisis`
  (campo, y `-` delante para descendente):
  - `nombre` | `-nombre`: nombre completo (nombre y apellido);
  - `correo` | `-correo`;
  - `rol` | `-rol`;
  - `estado` | `-estado`.

  Sin `orden`, el orden actual (apellido, nombre). Desempate estable por `id` para que la
  paginación no repita ni salte cuentas.
- **Respuesta:** la misma `{items, paginacion}`.
- **Errores:** `422 DATOS_INVALIDOS` con `campos: [{campo: "orden", …}]` si el valor no es uno
  de los anteriores.
- **Dudas para el backend:** cómo ordenar `estado` cuando la cuenta está bloqueada (el frontend
  muestra una sola insignia con la prioridad Bloqueada > Pendiente/Expirada > Inactiva > Activa;
  ver `src/utils/presentacionUsuario.ts`).

### Búsqueda `q` en la query string de `GET /api/v1/admin/usuarios` · W-09

- **Estado:** observación para el backend; el frontend no cambia el contrato.
- **Qué pasa:** la búsqueda de W-09 es «por nombre o correo», así que `q` puede llevar un
  correo completo. Como el endpoint es un `GET`, `q` viaja en la URL de la petición
  (`/api/v1/admin/usuarios?q=ana.perez%40usc.edu.co&…`) y puede quedar en los logs de acceso de
  nginx o de la API, aunque el frontend nunca la pone en la barra de direcciones, en el
  historial ni en el almacenamiento del navegador.
- **Opciones para el backend:** excluir la query string de los logs de acceso de esa ruta, o
  una búsqueda por `POST` con `q` en el cuerpo, como ya se hace con el documento del paciente
  (`POST /pacientes/analisis/buscar`).

### `rol_nombre` en los usuarios del administrador (U-8) · W-09, W-10

- **Estado:** implementado. Cada `usuario` de `/admin/usuarios` trae ahora `rol` (el código) y
  `rol_nombre` (el nombre visible, p. ej. «Doctor/Gastroenterólogo»).
- **Qué hace el frontend:** W-09 muestra `rol_nombre` tal cual. Se eliminó la tabla temporal
  `ETIQUETA_ROL_USUARIO` de `src/utils/presentacionUsuario.ts`, que existía solo mientras el
  backend no mandaba el nombre.

### `GET /api/v1/catalogos/roles` · W-10 (consulta U-16)

- **Estado:** propuesto. No existe; tampoco está en `../ARCHITECTURE.md` § 3.5.
- **Por qué:** `rol_nombre` resuelve *mostrar* el rol de una cuenta que ya existe, pero W-10
  (crear usuario) necesita las etiquetas **antes** de que la cuenta exista, para pintar el grupo
  de opciones «Rol». Hoy `rol` es un enum cerrado del backend (`CodigoRol`: `DOCTOR`,
  `ADMINISTRADOR`) que nunca llega como lista, así que el frontend tiene que repetir los nombres.
- **Solicitud propuesta:** sin parámetros; cualquier rol con sesión `ACTIVA` (o solo
  `ADMINISTRADOR`, si el backend lo prefiere: hoy solo lo usa una pantalla de administrador).
  Mismo patrón que `GET /catalogos/tipos-documento`, que ya existe.
- **Respuesta propuesta:**

  ```json
  { "items": [
      { "codigo": "DOCTOR", "nombre": "Doctor/Gastroenterólogo" },
      { "codigo": "ADMINISTRADOR", "nombre": "Administrador" }
  ] }
  ```

  Los mismos `nombre` que la tabla `Rol` ya guarda y que viajan en `rol_nombre`, para que el
  selector de W-10 y la lista de W-09 digan exactamente lo mismo.
- **Errores:** `401 SESION_EXPIRADA`; `403 PERMISO_DENEGADO` si se restringe a administradores.
- **Qué hace el frontend mientras tanto:** tabla local `ETIQUETA_ROL_FORMULARIO` en
  `src/utils/presentacionUsuario.ts`, usada **solo** por el formulario de W-10 y marcada como
  provisional. Cuando exista el endpoint se borra esa tabla y el formulario pinta las opciones
  con lo que responda el catálogo.
- **Nota:** si el conjunto de roles no va a cambiar nunca, el backend puede decirlo y la tabla
  local se queda como decisión consciente, no como parche.
