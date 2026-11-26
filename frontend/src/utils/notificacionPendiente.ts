// Notificación que una pantalla deja para la siguiente (W-10 → W-09e: «Usuario creado»).
//
// Vive en una variable de módulo, es decir, en memoria: se pierde al recargar la página y nunca
// llega a `localStorage`, a `sessionStorage` ni a la URL. Eso importa porque el texto lleva el
// correo del usuario creado, que es un dato personal (CLAUDE.md § 6). Por la misma razón no se usa
// `location.state` de react-router: ese sí queda guardado en `history.state` del navegador.
//
// Leer y borrar están separados a propósito. La aplicación se monta dentro de `<React.StrictMode>`
// (`src/main.tsx`), así que en desarrollo React llama DOS veces a la función inicializadora de
// `useState`. Si leer borrara, la segunda llamada —que es el render que React conserva— devolvería
// `null` y la notificación no aparecería nunca. Por eso `leerNotificacion` es pura y el borrado va
// aparte, en un efecto.

export interface NotificacionPendiente {
  titulo: string;
  mensaje: string;
}

let pendiente: NotificacionPendiente | null = null;

/** Deja la notificación para la pantalla siguiente. Reemplaza cualquier otra sin leer. */
export function dejarNotificacion(notificacion: NotificacionPendiente): void {
  pendiente = notificacion;
}

/** Lectura pura: devuelve la notificación pendiente sin borrarla. Se puede llamar varias veces. */
export function leerNotificacion(): NotificacionPendiente | null {
  return pendiente;
}

/** Borra la notificación pendiente. Es idempotente: llamarla de más no hace nada. */
export function limpiarNotificacion(): void {
  pendiente = null;
}
