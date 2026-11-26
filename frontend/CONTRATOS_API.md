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
| `GET /api/casos-recibidos/resumen` | resuelto de otra forma | no hace falta: `casos_recibidos_nuevos` viene en `GET /api/v1/auth/sesion` |
| `GET /api/v1/admin/usuarios`: parámetro `orden` | implementado | ya acepta `orden`; W-09 todavía no lo usa |
| `GET /api/v1/admin/usuarios`: `q` en la query string | observación | sin cambio en el contrato |
| `rol_nombre` en los usuarios del administrador (U-8) | implementado | llega en cada `usuario`; el frontend ya lo muestra |
| `GET /api/v1/catalogos/roles` (U-16) | implementado | existe tal cual se propuso; W-10 y D-04 lo consumen y la tabla local se eliminó |
| `GET /api/v1/admin/usuarios`: orden que ponga las expiradas primero (U-17) | implementado | `orden=activacion` y `-activacion`; W-20 ordena en el servidor y «Vigencia» es ordenable |
| IP del bloqueo en el detalle de la cuenta (U-18) | propuesto | no existe; W-11b dice la fecha y los intentos, y remite a la bitácora |
| «Es el último administrador activo» en el detalle (U-19) | propuesto | no existe; W-11 lo deduce con una segunda consulta |
| Motivo de la desactivación en el detalle (U-20) | propuesto | no existe; W-11c dice desde cuándo y cuántos casos se reasignaron |
| `probabilidad_principal` en `analisis_recientes` (DB-1) | propuesto | no existe; W-15 quitó la columna «Prob.» |
| Total de traslados en `casos_recibidos` (DB-2) | propuesto | no existe; la tarjeta cuenta los nuevos |
| Umbral vigente en `frecuencia` (DB-3) | propuesto | no existe; la nota de la gráfica va sin el número |
| Sitio en Figma para `no_concluyente` (DB-4) | propuesto a diseño | el frontend lo añade al detalle de la tarjeta |
| `ultimos_7_dias` y `sin_valoracion` sin dibujar (DB-5) | pregunta abierta | se calculan y no se muestran |
| Las cifras del panel solo cuentan completados (DB-6) | propuesto a diseño | el detalle de cada tarjeta lo dice |
| «Ver detalle» en la tabla de escritorio (DB-7) | propuesto a diseño | el frontend lo añadió |
| Total del traslado en la búsqueda de W-27 (CR-1) | propuesto | no existe; el frontend lo cruza con la bandeja que ya tiene en memoria |
| `limite` por traslado, no por bandeja (CR-2) | propuesto | no existe; «Ver los N análisis» repide toda la bandeja con `limite=0` |
| «Casos» o «análisis» en el bloque de traslado (CR-3) | propuesto a diseño | el frontend hace que la palabra siga al número |
| El filtro «Doctor de origen» sin resultados (CR-4) | propuesto a diseño | no está dibujado; el frontend lo resuelve con una línea y un botón |
| Orden de los análisis en `GET /casos-recibidos` (CR-5) | propuesto | no existe; W-27 deja los encabezados como texto, igual que W-16 |
| El filtro `resultado` de la bitácora, sin dibujar (BI-1) | propuesto a diseño | el endpoint ya lo acepta; W-21 lo añade como quinto desplegable |
| Orden de las columnas en `GET /admin/bitacora` (BI-2) | propuesto | no existe; W-21 deja los cinco encabezados como texto |
| La columna «Usuario» de W-21 muestra correos (BI-3) | propuesto a diseño | el contrato no entrega correos; W-21 pinta nombre y apellido |
| `objetivo` sin columna en el frame de W-21 (BI-4) | propuesto a diseño | el frontend lo pone delante del detalle |

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

- **Estado:** resuelto de otra forma, mejor que la propuesta. **No hace falta el endpoint.**
- **Cómo quedó:** el número llega en `GET /api/v1/auth/sesion` como `casos_recibidos_nuevos`
  (`int | null`), junto a la etapa, el usuario y la inactividad. Es `null` cuando no aplica:
  sin la etapa `ACTIVA` o con un rol que no es doctor.
- **Por qué es mejor:** el menú se ve en **todas** las pantallas, y la sesión ya se consulta al
  cargar la página y en cada comprobación pasiva de inactividad. Así el contador se actualiza
  solo, sin una petición más y sin depender de que la persona entre al dashboard.
- **Ojo con el nombre:** cuenta **traslados** sin abrir, no casos. Es el mismo número que
  `casos_recibidos.traslados_nuevos` del dashboard. La insignia del menú se anuncia «Casos
  recibidos, 4 sin revisar» (nota del componente «Ítem de navegación» en Figma), que dice
  «casos» para un número de traslados; queda anotado para diseño.
- **Qué hace el frontend:** `ProveedorSesion` lo guarda con el resto de la sesión y
  `useUsuarioActual` lo entrega a la barra lateral y al menú de celular (0 cuando es `null`,
  que es como la insignia se oculta). Se eliminaron `src/services/usuario.ts` y
  `src/services/simulados/usuario.ts`: ya no queda nada simulado en el frontend.

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

### `GET /api/v1/catalogos/roles` · W-10 y D-04 (consulta U-16)

- **Estado:** **implementado** (rama `feature/63-backend-base`, commit `ae62b00`). Tal cual se
  propuso: `GET /api/v1/catalogos/roles`, para cualquier sesión activa, con los mismos nombres
  que viajan en `rol_nombre`. Respuesta real:

  ```json
  { "items": [
      { "codigo": "DOCTOR", "nombre": "Doctor/Gastroenterólogo" },
      { "codigo": "ADMINISTRADOR", "nombre": "Administrador" }
  ] }
  ```

  El frontend lo consume en `src/services/catalogos.ts` y lo pinta con el componente
  `src/components/CampoRol.tsx`, que usan W-10 (crear usuario) y D-04 (cambiar rol). Se pide una
  sola vez por sesión del navegador: el servicio guarda en memoria el resultado del primer éxito
  y comparte la petición si dos pantallas lo piden a la vez. Un fallo no se guarda, así que el
  botón «Reintentar» del campo vuelve a salir a la red. La tabla local `ETIQUETA_ROL_FORMULARIO`
  se eliminó.
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
- **Qué pasa si el catálogo no responde:** el campo «Rol» explica que no se pudieron cargar los
  roles y ofrece «Reintentar». No hay una lista de respaldo escrita en el frontend: sería la
  misma tabla provisional con otro nombre y mostraría un nombre inventado si el backend
  renombrara un rol. Sin opciones no se puede elegir ninguna, así que W-10 no deja crear la
  cuenta y D-04 deja «Cambiar rol» no disponible, que es lo correcto.

### Orden que ponga las expiradas primero en `GET /api/v1/admin/usuarios` · W-20 (consulta U-17)

- **Estado:** **implementado** (rama `feature/63-backend-base`, commit `ae62b00`). `orden` acepta
  ahora `activacion` y `-activacion`, que fue la primera de las dos formas propuestas. Agrupa
  primero las pendientes con la temporal vencida y, dentro de cada grupo, por
  `temporal_expira_en` ascendente, así que la que lleva más tiempo vencida encabeza la lista; las
  cuentas que no están PENDIENTE van al final. Se resuelve en SQL, con el mismo desempate estable
  de siempre (apellido, nombre, `id`), así que **vale para todas las páginas**.

  `src/services/usuariosAdmin.ts` lo manda en `listarCuentasPendientes` y W-20 abre con
  `activacion`. El ordenamiento en el navegador se eliminó, y «Vigencia» pasó a ser un encabezado
  ordenable de verdad, con `aria-sort` y los íconos de orden. «Creada» sigue en texto plano: el
  servidor no ordena por `creado_en`.
- **Por qué se pidió:** W-20 (Figma 69:4286) es la lista de cuentas pendientes de activación
  (`?estado=PENDIENTE`). La nota de la pantalla en Figma pide que **las expiradas vayan
  primero**, y
  son las únicas que llevan el botón primario: son las que el administrador tiene que resolver
  ya. Pero las dos clases de cuenta tienen el mismo `estado` (`PENDIENTE`) y se distinguen por
  `estado_activacion` (`PENDIENTE` o `EXPIRADA`), que no es un valor aceptado de `orden`
  (`nombre`, `correo`, `rol`, `estado`). Ordenar por `estado` no las separa.
- **Respuesta:** la misma `{items, paginacion, conteos}`; no cambió nada más. El número de
  expiradas del pie sigue saliendo de `conteos.expiradas`, que el backend calcula sobre todas las
  cuentas y no sobre la página.
- **Errores:** `422 DATOS_INVALIDOS` con `campos: [{campo: "orden", …}]` si el valor no se
  reconoce, igual que antes.
- **Lo que queda pendiente:** «Creada» no es ordenable, porque `creado_en` no es un valor de
  `orden`. Figma dibuja W-20 con «Creada ↑» como columna activa; mientras el servidor no ordene
  por esa fecha, ese encabezado se queda en texto plano, igual que en W-09. Si el backend añade
  `creado_en`, W-20 puede ofrecer también esa columna sin más cambios que pasarla al mismo
  componente de encabezado ordenable.

### IP del bloqueo en `GET /api/v1/admin/usuarios/{id}` · W-11b (consulta U-18)

- **Estado:** propuesto. El detalle ya trae `bloqueado_en`, `intentos_fallidos` y
  `bloqueado_hasta`, pero no la IP.
- **Por qué:** W-11b (Figma 99:2887) dibuja la frase completa: «Bloqueada el 19/10/2026 a las
  15:12 por 5 intentos fallidos **desde la IP 203.0.113.45**. Se desbloquea sola a las 15:42
  (RF-U12)». El contrato dice de forma explícita que la IP no viene aquí y que se consulta en la
  bitácora filtrando por el usuario, así que la pantalla no puede escribir esa frase entera.
- **Solicitud propuesta:** ningún parámetro nuevo; un campo más en la respuesta del detalle, por
  ejemplo `bloqueado_desde_ip: string | null`, al lado de `bloqueado_en`, con la IP del último
  intento fallido que provocó el bloqueo y `null` si no hay bloqueo en curso.
- **Errores:** ninguno nuevo.
- **Qué hace el frontend mientras tanto:** `src/pages/DetalleCuenta.tsx` arma la frase sin la IP
  («Bloqueada el … tras 5 intentos fallidos. Se desbloquea sola el … La IP queda registrada en la
  bitácora»), con lo que sí llega en el detalle. No se inventa el dato ni se deja la frase a
  medias.
- **Nota:** si el equipo prefiere no repetir la IP fuera de la bitácora por privacidad, la
  decisión es igual de válida; entonces conviene quitar la IP del texto de W-11b en Figma para que
  el diseño y el contrato digan lo mismo.

### «Es el último administrador activo» en `GET /api/v1/admin/usuarios/{id}` · W-11i (consulta U-19)

- **Estado:** propuesto. Hoy solo se sabe después de intentarlo (409 `ULTIMO_ADMINISTRADOR`).
- **Por qué:** W-11i (Figma 165:18887) necesita saberlo **antes** de dibujar: «Cambiar rol» va
  deshabilitado y una alerta explica por qué (RF-U07 CA 6, RF-U08 CA 4). El detalle no trae nada
  que lo diga, y esperar al 409 significaría ofrecer una acción que siempre va a fallar.
- **Solicitud propuesta:** ningún parámetro nuevo; un campo más en la respuesta del detalle, por
  ejemplo `es_ultimo_administrador: boolean`, calculado con la misma regla que ya usa el servidor
  para rechazar la acción (rol `ADMINISTRADOR`, estado `ACTIVO` y ningún otro administrador
  activo). Sirve igual `otros_administradores_activos: int`.
- **Errores:** ninguno nuevo.
- **Qué hace el frontend mientras tanto:** `hayOtroAdministradorActivo` en
  `src/services/usuariosAdmin.ts` hace una segunda consulta,
  `GET /admin/usuarios?rol=ADMINISTRADOR&estado=ACTIVO&excluir={id}&por_pagina=1`, y mira
  `paginacion.total`. Es una consulta que el contrato ya contempla (es la misma que se usa para
  elegir el doctor de destino de un traslado), pero son dos viajes para pintar una pantalla.
- **Nota:** la pantalla sigue atendiendo el 409 aunque el botón esté deshabilitado, porque entre
  la carga y el clic otra pestaña puede haber cambiado las cosas (RF-U03 CA 4). El campo nuevo no
  reemplaza esa comprobación: solo evita ofrecer lo imposible.

### Motivo de la desactivación en `GET /api/v1/admin/usuarios/{id}` · W-11c (consulta U-20)

- **Estado:** propuesto. Prioridad baja.
- **Por qué:** la nota de W-11c (Figma 99:3055) pide que la pantalla explique «desde cuándo y por
  qué» se desactivó la cuenta. El detalle trae `desactivado_en` y `ultimo_traslado`, que dan el
  cuándo y cuántos casos se reasignaron, pero no hay ningún motivo guardado.
- **Solicitud propuesta:** si el equipo quiere el «por qué», haría falta guardarlo al desactivar
  (un `motivo` opcional en `POST /{id}/desactivar`, que volvería en el detalle como
  `desactivado_motivo: string | null`). Implica cambiar también D-01, que hoy no pide motivo.
- **Qué hace el frontend mientras tanto:** W-11c dice desde cuándo y, si el último traslado fue el
  de la desactivación, cuántos casos se reasignaron. El motivo no se inventa.
- **Nota:** mientras no exista, la bitácora sigue siendo el lugar donde se ve quién desactivó la
  cuenta y cuándo, que es casi siempre lo que se busca.

### `probabilidad_principal` en `analisis_recientes` de `GET /api/v1/dashboard/doctor` · W-15 (DB-1)

- **Estado:** propuesto.
- **Por qué:** W-15 (Figma 62:3401) dibuja la tabla de casos recientes con cuatro columnas: ID de
  análisis, Fecha, Característica principal y **Prob.** («84 %», «67 %»). `AnalisisReciente` no
  trae ninguna probabilidad, aunque la fila del historial (`FilaHistorial`, `GET /analisis`) sí
  tenga `probabilidad_principal`. No se puede calcular en el frontend ni inventar.
- **Solicitud propuesta:** añadir a cada elemento de `analisis_recientes` el mismo campo que ya
  existe en el historial, con la misma escala (0 a 1) y la misma regla:

  ```json
  { "id": "…", "codigo": "A-2026-000147", "caracteristica_principal": "Atrofia gástrica", "probabilidad_principal": 0.84 }
  ```

  `null` cuando no hay ninguna por encima del umbral o el análisis no ha terminado, igual que
  `caracteristica_principal`.
- **Qué hace el frontend mientras tanto:** W-15 se construyó **sin** la columna «Prob.», en
  escritorio y en tarjetas. Una columna entera de «—» no informa de nada. Cuando el campo llegue,
  la columna entra en `src/pages/DashboardCasosRecientes.tsx` sin tocar el resto de la pantalla.

### Total de traslados en `casos_recibidos` de `GET /api/v1/dashboard/doctor` · W-15c (DB-2)

- **Estado:** propuesto. Prioridad baja.
- **Por qué:** la tarjeta «Casos recibidos» de W-15c se escribe «7» con el detalle «2 traslados»,
  es decir, el **total** de traslados recibidos. La respuesta trae `casos` (el total de casos) y
  `traslados_nuevos` (solo los que no ha abierto), así que ese total no se puede deducir: con 2
  traslados y 1 sin abrir, `traslados_nuevos` vale 1.
- **Solicitud propuesta:** un campo más en `casos_recibidos`, que el endpoint
  `GET /api/v1/casos-recibidos` ya calcula como `total_traslados`:

  ```json
  { "casos_recibidos": { "traslados_nuevos": 1, "traslados": 2, "casos": 7 } }
  ```
- **Qué hace el frontend mientras tanto:** el detalle de la tarjeta dice lo que el número es de
  verdad («1 traslado nuevo sin abrir», «2 traslados nuevos sin abrir») y, sin traslados nuevos,
  el texto de W-15 «Por traslado de otros doctores». **No** se hace una segunda petición a
  `GET /casos-recibidos` por un número decorativo.

### Umbral vigente en `frecuencia` de `GET /api/v1/dashboard/doctor` · W-15 (DB-3)

- **Estado:** propuesto. Prioridad baja.
- **Por qué:** la nota al pie de la gráfica dice en Figma «Umbral vigente: 50 % (umbral global
  inicial, RF-A01 CA 4)». Ese número no viene en la respuesta y el único endpoint que lo tiene,
  `GET /admin/configuracion-inferencia`, es de administrador. Escribir «50 %» a mano sería
  inventar un dato que el administrador puede cambiar.
- **Solicitud propuesta:** `frecuencia.umbral_vigente` (0 a 1, o `null` si está en modo por
  característica), o bien un endpoint de lectura del umbral para el rol doctor.
- **Qué hace el frontend mientras tanto:** la nota va sin número y dice lo que sí es cierto para
  toda la gráfica: «Cada análisis se cuenta con el umbral que regía el día en que se hizo»
  (RF-A01 CA 2; cada resultado guarda el umbral con el que se evaluó, así que un solo número
  tampoco describiría bien la barra entera).

### Dónde va `no_concluyente` en la tarjeta de concordancia · W-15 (DB-4)

- **Estado:** propuesto **al equipo de diseño**, no al backend: el dato ya existe.
- **Por qué:** `ConcordanciaSalida` trae `coincide`, `no_coincide` y `no_concluyente`, y el
  contrato dice que el último «se informa aparte, no entra al porcentaje». Figma solo dibuja el
  porcentaje y una línea de detalle («32 de 41 análisis valorados»), sin sitio para los no
  concluyentes. Omitirlos incumple el requisito, y sumarlos a la base haría que el porcentaje
  pareciera mal calculado.
- **Qué hace el frontend:** el detalle de la tarjeta los nombra y dice expresamente que no entran:
  «32 de 41 análisis valorados · 5 no concluyentes, que no entran en el porcentaje». Si diseño le
  hace un sitio propio en el frame, se mueve ahí.
- **Tres estados, no dos.** `porcentaje` llega nulo en dos situaciones distintas y Figma solo
  dibuja una. Se distinguen con los tres conteos:
  - sin ninguna valoración → «—» y «Sin valoraciones todavía» (el texto de W-12);
  - con valoraciones, **todas** no concluyentes → «—» y «5 valoraciones, todas no concluyentes:
    no entran en el porcentaje». Decir aquí que no hay valoraciones sería falso;
  - con porcentaje → la base, más los no concluyentes si los hay.

### `ultimos_7_dias` y `sin_valoracion` no están dibujados · W-15 (DB-5)

- **Estado:** pregunta abierta para diseño y backend.
- **Qué pasa:** `ResumenDoctor` trae cuatro cifras y W-15 solo dibuja dos de ellas
  (`analisis_mes` y `total_analisis`); las otras tres tarjetas son concordancia, casos con
  seguimiento y casos recibidos. `ultimos_7_dias` y `sin_valoracion` se calculan en cada carga
  (dos consultas más en `dashboard_repository.py`) y no se muestran en ninguna parte.
- **Qué hace el frontend:** los tipa en `src/types/index.ts` con un comentario que dice que no se
  dibujan, y no los usa. No se inventan tarjetas que Figma no tiene.
- **Qué hay que decidir:** o Figma les hace sitio (serían dos tarjetas más, y `sin_valoracion`
  encaja bien con el recordatorio de valorar), o el backend deja de calcularlos.

### Las cifras del panel solo cuentan análisis completados · W-15 (DB-6)

- **Estado:** propuesto **al equipo de diseño**; el backend está bien, lo que falta es decirlo
  en la pantalla.
- **Qué pasa:** el panel puede decir «Análisis acumulados: 5» mientras el historial lista 17
  filas, y las dos cifras son correctas. `dashboard_repository.py` lo dice en su cabecera:
  «Propios = análisis **COMPLETADOS** que hizo el doctor y **cuyo caso sigue asignado a él**».
  El historial, en cambio, lista los tres estados y además los recibidos por traslado. Los
  textos de Figma («Desde su primer ingreso», «Pacientes con 2 o más análisis») no lo insinúan,
  así que la diferencia se lee como un error de la aplicación.
- **A qué cifras les pasa:** `analisis_mes` y `total_analisis` (las dos primeras tarjetas),
  `pacientes_con_seguimiento` y la gráfica de frecuencia, que cuenta sobre los mismos análisis
  y los compara con `total_analisis`. La concordancia no lo necesita: su base ya se nombra
  («32 de 41 análisis valorados»), y valorar un análisis supone que terminó.
- **Qué hace el frontend:** los detalles dicen «Completados en octubre de 2026», «Completados
  desde su primer ingreso» y «Pacientes con 2 o más análisis completados», y la descripción de
  la gráfica, «Número de análisis **completados** en que cada característica superó el umbral…».
- **Qué queda sin decir:** la segunda mitad de la condición, que solo cuentan los casos que
  siguen asignados al doctor. Un doctor al que le reasignaron casos verá bajar sus cifras sin
  explicación, y eso no cabe en una línea de detalle de 12 px. Hace falta un sitio en el frame:
  una nota al pie de la fila de tarjetas, como la de privacidad de «Casos recientes».

### «Ver detalle» en la tabla de escritorio de «Casos recientes» · W-15 (DB-7)

- **Estado:** propuesto **al equipo de diseño**. Ya implementado en el frontend.
- **Qué pasa:** W-15 dibuja la tabla con cuatro columnas y ninguna acción, pero T-15 y M-15
  dibujan cada caso como tarjeta **con un botón «Ver detalle»**. Tal cual, desde una pantalla
  grande se puede hacer menos que desde el celular: para abrir un análisis habría que pasar por
  «Ver historial». La tabla de W-16 ya tiene esa acción en cada fila.
- **Qué hace el frontend:** una columna «Acción» con el mismo enlace de texto de W-16 (no un
  botón de 40 px, que engordaría las filas), con el código del análisis en el nombre accesible.

### Total del traslado en `POST /casos-recibidos/buscar` · W-27f (CR-1)

- **Estado:** propuesto. Prioridad baja.
- **Por qué:** el encabezado de cada bloque en la búsqueda dice «2 casos de este paciente · **12
  en el traslado** · trasladados el 20/10/2026». La respuesta de la búsqueda solo trae los
  totales ya filtrados por paciente (`analisis_total` del bloque es el del paciente), así que
  ese «12» no está en ninguna parte de esa respuesta.
- **Solicitud propuesta:** un campo más en cada bloque de la búsqueda, por ejemplo
  `analisis_total_traslado`, con el total sin filtrar.
- **Qué hace el frontend mientras tanto:** lo cruza con lo que ya tiene. `GET /casos-recibidos`
  devuelve el `analisis_total` real de cada traslado, y la pantalla lo guarda por `id` en cada
  carga que no es una búsqueda (`useBandejaRecibidos`, `totalDelTraslado`). Si ese traslado no
  se hubiera visto nunca sin filtrar, la frase se omite en vez de inventar un número.

### Un `limite` por traslado, no uno para toda la bandeja · W-27d (CR-2)

- **Estado:** propuesto.
- **Por qué:** `GET /casos-recibidos?limite=5` recorta **todos** los bloques a la vez, pero el
  botón «Ver los 12 análisis» de W-27d es de **un** bloque: el doctor pide ver un traslado
  entero, no los tres.
- **Solicitud propuesta:** un `limite` por bloque, o un endpoint
  `GET /traslados/{id}/analisis` con su propia paginación.
- **Qué hace el frontend mientras tanto:** repide la bandeja entera con `limite=0` y recorta en
  pantalla los bloques a los que no se les pidió nada (un `Set` de traslados «completos»). El
  resultado se ve exactamente como el diseño, a cambio de una petición más y de traer análisis
  que no se van a mostrar. Con bandejas grandes esto no escala.

### «Casos» o «análisis» en el bloque de traslado · W-27b a W-27f (CR-3)

- **Estado:** propuesto **al equipo de diseño**, no al backend: los datos ya existen.
- **Por qué:** Figma escribe «casos» en los cuatro sitios del bloque («12 casos» en la cabecera,
  «Mostrando 5 de 12 casos» en el pie, «Ver los 12 casos» en el botón) y «19 casos recibidos en
  3 traslados» arriba. Pero la API separa dos cosas que en los datos de ejemplo coinciden:
  `casos` (los pacientes-caso, que es lo que suma `total_casos`) y `analisis_total` (las filas
  de la tabla). Con un análisis por caso los dos números son el mismo, y por eso el frame no
  los distingue; con dos análisis de un mismo paciente dejan de serlo, y entonces «Mostrando 5
  de 12 casos» sobre una tabla de análisis sería falso.
- **Qué hace el frontend:** la palabra sigue al número. «Casos» donde el número es de casos
  (el resumen de arriba, que usa `total_casos`, y la cabecera del bloque, que usa
  `casos.length`) y «análisis» donde el número es `analisis_total` («Mostrando 5 de 12
  análisis», «Ver los 12 análisis»). En la búsqueda, la cabecera cuenta análisis del paciente,
  y lo dice: «2 análisis de este paciente · 12 en el traslado».

### El filtro «Doctor de origen» sin resultados · W-27 (CR-4)

- **Estado:** propuesto **al equipo de diseño**. No está dibujado.
- **Por qué:** el filtro puede dejar la bandeja vacía (el doctor de origen elegido ya no tiene
  casos en ella), y ese estado no tiene frame. No es W-27a («aún no ha recibido casos»), que
  diría algo falso, ni W-27g, que es de la búsqueda.
- **Qué hace el frontend:** una línea, «Ningún caso recibido de ese doctor.», y un botón «Ver
  todos los doctores» que deshace el filtro. Sin mascota y sin tarjeta: no es un vacío de la
  pantalla, es un filtro que no encontró nada, y el camino de vuelta tiene que estar a la vista.

### Orden de los análisis en `GET /casos-recibidos` · W-27 (CR-5)

- **Estado:** propuesto. Prioridad baja. Es el mismo caso que las tres columnas sin orden de
  W-16.
- **Por qué:** W-27 dibuja los cuatro encabezados de la tabla con flechas de ordenar, y «Fecha
  del análisis» con la flecha descendente activa. El endpoint no acepta ningún parámetro de
  orden: solo `origen_id` y `limite`. El servidor devuelve siempre `solicitado_en DESC`.
- **Solicitud propuesta:** un `orden` como el de `GET /analisis` (`solicitado_en`,
  `-solicitado_en`), si el orden tiene que poder cambiarse.
- **Qué hace el frontend mientras tanto:** los encabezados son texto, no botones. Ordenar en el
  navegador las 5 filas que se muestran aparentaría ordenar las 12 del traslado. El sentido se
  dice con palabras en el pie del bloque («del más reciente al más antiguo»), no solo con una
  flecha (WCAG 1.4.1).

### El filtro `resultado` no está dibujado · W-21 (BI-1)

- **Estado:** propuesto **al equipo de diseño**, no al backend: el parámetro ya existe.
- **Por qué:** `GET /admin/bitacora` acepta `resultado` (`EXITO` o `FALLO`,
  `backend/app/api/routers/admin_bitacora.py:51`), pero el frame solo dibuja «Tipo de evento»,
  «Usuario», «Desde» y «Hasta». La alerta de seguridad de W-19 manda al administrador a esta
  pantalla justamente a revisar **intentos fallidos**; sin este filtro tendría que buscarlos a
  ojo entre 245 eventos.
- **Qué hace el frontend:** un quinto desplegable, «Resultado», con marcador «Todos los
  resultados» y las opciones «Correctos» y «Fallidos». Es la única desviación de los controles
  del frame.

### Orden de las columnas en `GET /admin/bitacora` · W-21 (BI-2)

- **Estado:** propuesto. Prioridad baja. Es el mismo caso que CR-5 (W-27) y las tres columnas
  sin orden de W-16.
- **Por qué:** el frame dibuja «Fecha y hora» con la flecha descendente activa y las otras
  cuatro cabeceras con el ícono de ordenable. El endpoint **no acepta ningún parámetro de
  orden**: los ocho que acepta son `pagina`, `por_pagina`, `accion`, `resultado`, `actor_id`,
  `actor`, `desde` y `hasta`. El servidor devuelve siempre lo más reciente primero.
- **Solicitud propuesta:** un `orden` como el de `GET /analisis` (`ocurrido_en`,
  `-ocurrido_en`), si el orden tiene que poder cambiarse.
- **Qué hace el frontend mientras tanto:** los cinco encabezados son texto, sin botón, sin
  ícono y sin `aria-sort`. Tampoco se ordena en el navegador: reordenar las 8 filas de la
  página aparentaría ordenar las 245 del total. El sentido se dice con palabras, visible en el
  pie («· del más reciente al más antiguo») y en un `<span>` para lector de pantalla dentro del
  encabezado de la fecha (WCAG 1.4.1).

### La columna «Usuario» muestra correos · W-21 (BI-3)

- **Estado:** propuesto **al equipo de diseño**.
- **Por qué:** el frame escribe `marta.rios@usc.edu.co` en la columna «Usuario», y
  `luis.gomez@usc.edu.co` dentro de varios detalles. El contrato **no entrega correos**: `actor`
  y `objetivo` son `{id, nombre, apellido, cuenta_eliminada}`
  (`backend/app/schemas/bitacora.py:11-16`).
- **Qué hace el frontend:** pinta nombre y apellido, con «(cuenta eliminada)» cuando
  corresponde (RF-A07 CA 4), reutilizando `nombreDeOrigen`. Los textos de evento y detalle los
  redacta el servidor y se pintan tal cual, así que los ejemplos del frame («Inicio de sesión
  fallido», «Creación de usuario») no coinciden palabra por palabra con `TEXTO_ACCION`
  («Inicio de sesión», «Creación de cuenta»): manda el servidor.

### `objetivo` no tiene columna en el frame · W-21 (BI-4)

- **Estado:** propuesto **al equipo de diseño**.
- **Por qué:** cada entrada trae `objetivo`, la cuenta sobre la que se hizo la acción
  (`backend/app/schemas/bitacora.py:25`), y el frame tiene cinco columnas, ninguna para ella. Y
  hace falta: `detalle_legible()` (`backend/app/services/bitacora.py:116-150`) **no nombra
  nunca al objetivo** —el único nombre que compone es el destino de `CASOS_REASIGNADOS`—, así
  que un cambio de rol llega como «De Doctor a Administrador» sin decir de quién, y una cuenta
  creada como «Rol: Doctor» sin decir cuál. Sin el objetivo, la bitácora registraría cambios sin
  decir sobre quién.
- **Qué hace el frontend:** lo pone delante del detalle, separado con «·»: «Carlos Díaz · De
  Doctor a Administrador». No se añade ninguna columna. Es lo que ya hace el frame, que mete la
  cuenta afectada dentro de la columna «Detalle» («carlos.diaz@usc.edu.co: Doctor →
  Administrador»), con el nombre en vez del correo (ver BI-3).

### Nota aparte: el 422 del período en `GET /admin/bitacora`

No es una propuesta, es un error del contrato que no estaba anotado. `desde > hasta` responde
`422 RANGO_FECHAS_INVALIDO` con `campos: [{campo: "desde", mensaje: "..."}]`, desde
`limites_de_fechas` (`backend/app/services/historial.py:33-39`). Lo comparten `GET /analisis`
(W-16) y esta pantalla. W-21 lee `campos` y pone el mensaje del servidor en el campo que el
servidor señala. **W-16 todavía no lo trata** y lo manda a la alerta genérica de W-31.
