# Contratos de API propuestos por el frontend

Formatos de datos que las pantallas usan con **datos simulados** porque el endpoint todavía
no existe en `../ARCHITECTURE.md` § 3.5. Son propuestas del equipo de frontend para el
equipo del backend; ninguno es un endpoint existente hasta que el backend lo confirme.

Las funciones simuladas viven en `src/services/simulados/` y llevan un comentario
`// SIMULADO: falta endpoint ...`.

Las propuestas marcadas **implementado** ya existen en el backend (commit `b770076`, rama
`feature/63-backend-base`, base `/api/v1`) y el frontend las usa; se conservan aquí como
registro de en qué quedó cada una.

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
| Código de referencia en errores 5xx | implementado | `error.id_error` en todo error |
| `POST /api/auth/logout` | implementado | `POST /api/v1/auth/logout`, con cookie |
| `GET /api/auth/me` | implementado | `GET /api/v1/auth/sesion` |
| `GET /api/casos-recibidos/resumen` | propuesto | pendiente (ruta pasa a `/api/v1`) |

## Propuestas

### Cuerpo de error con código de referencia · W-01, W-31

- **Estado:** implementado. El backend lo resolvió para **todos** los errores, no solo los 5xx,
  con otra forma que la propuesta (`codigo_referencia`).
- **Forma real** (`../ARCHITECTURE.md` § 3.5):

  ```json
  { "error": { "codigo": "ERROR_INTERNO", "mensaje": "Algo salió mal. Intenta de nuevo.", "id_error": "ERR-7F3A" } }
  ```

- **Qué hace el frontend:** `ErrorApi` (`src/services/api.ts`) guarda `estado`, `codigo` e
  `idError`. Los textos que ve el usuario salen de Figma y se eligen por `codigo`; el
  `mensaje` del servidor no se muestra. Con `idError`, W-31 y el inicio de sesión agregan la
  frase «Si continúa, informe al administrador este código: ERR-7F3A.».
- **Notas:** el backend también responde `PETICION_INVALIDA` (400), `METODO_NO_PERMITIDO`
  (405), `ARCHIVO_DEMASIADO_GRANDE` (413), `DEMASIADOS_INTENTOS` (429) y `SIN_VINCULACION`
  (409), que no aparecen en la tabla de § 3.5. El frontend los trata como error inesperado
  (W-31) hasta que el diseño diga otra cosa.

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
- **Cómo quedó:** responde `{etapa, vence_en, usuario: {id, nombre, apellido, rol}}`, con
  `rol` igual a `DOCTOR` o `ADMINISTRADOR`. Sirve en cualquier etapa del inicio de sesión;
  con `X-Actividad: pasiva` no renueva la inactividad. El nombre y el apellido vienen
  separados (el tratamiento «Dra.» de los ejemplos de Figma ya no se muestra).
- **Respuestas a las preguntas de la propuesta:** el rol `tecnico` no existe; solo hay
  `DOCTOR` y `ADMINISTRADOR`. El frontend usa `rol` solo para elegir el menú; la autorización
  real la hace el backend en cada endpoint.
- **Qué hace el frontend:** `ProveedorSesion` lo consulta al cargar la página y tras el
  login. Se eliminó el usuario simulado y `VITE_ROL_SIMULADO`. `vence_en` se guarda, pero
  todavía no se usa (lo necesita W-05).

### `GET /api/casos-recibidos/resumen` · contador del menú «Casos recibidos» (W-15, W-15b)

- **Estado:** propuesto. La ruta pasa a `GET /api/v1/casos-recibidos/resumen` por la nueva
  base; el backend aún lista los traslados como «planeados».
- **Solicitud:** requiere sesión en etapa `ACTIVA` (cookie). Solo para el rol doctor.
- **Respuesta:** `200` con la cantidad de casos trasladados por otros doctores que el doctor
  todavía no ha revisado:

  ```json
  { "sin_revisar": 4 }
  ```
- **Errores:** `401` (`SIN_SESION`, `SESION_VENCIDA`); `403` `SIN_PERMISO` si el usuario no es
  doctor; `5xx` `ERROR_INTERNO`.
- **Notas:**
  - El contador del menú se oculta cuando vale 0 y se anuncia como «Casos recibidos, 4 sin
    revisar» (nota del componente «Ítem de navegación» en Figma, marcado «Fase 2»).
  - Los casos trasladados no se suman a los demás indicadores (RF-A07 CA 2); el dashboard
    debe usar este mismo dato para su indicador «Casos recibidos».
  - Pendiente definir cuándo se actualiza (al cargar la pantalla, al abrir un traslado). Si
    se consulta automáticamente, debería llevar `X-Actividad: pasiva`.
- **Simulación actual:** valor fijo 4 en `src/services/simulados/usuario.ts`, único lugar del
  dato. Es un valor de ejemplo del componente de Figma; el dashboard W-15 dibuja 0.
