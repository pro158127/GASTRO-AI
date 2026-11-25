// La búsqueda por paciente de W-16, guardada para volver del detalle del análisis.
//
// Vive en una variable de módulo, es decir, en memoria del proceso: se pierde al recargar la
// página y **nunca** llega a `localStorage`, a `sessionStorage`, a la URL ni a la consola.
// Eso importa porque lleva el número de documento del paciente (CLAUDE.md § 6). Es el mismo
// criterio, y por las mismas razones, que `notificacionPendiente.ts` con el correo.
//
// ---------------------------------------------------------------------------------------
// CUÁNDO SE BORRA. Lo que parece obvio no funciona, así que conviene leer esto entero antes
// de tocarlo:
//
// - **No se borra al desmontar el historial.** Ir al detalle *es* desmontar el historial, de
//   modo que limpiar ahí borraría el valor justo en el caso que se quiere cubrir.
// - **Leer no borra.** La aplicación se monta dentro de `<React.StrictMode>`, así que React
//   llama DOS veces al inicializador de `useState`. Si leer borrara, la segunda llamada —el
//   render que React conserva— encontraría el hueco vacío y la búsqueda no volvería nunca.
//   Es el mismo fallo de `consumirNotificacion` de la tarea 2a; por eso leer es puro y el
//   borrado va aparte, en un efecto.
//
// El reparto que sí funciona, en tres piezas:
//
// 1. Nada se guarda por omisión. `guardarBusquedaParaVolver` se llama en un solo sitio: el
//    manejador de «Ver detalle» de la pestaña de paciente, justo antes de navegar. Quien se
//    va es quien decide que hay algo que dejar, igual que W-10 con `dejarNotificacion()`.
//    Salir por el menú o cerrando sesión no escribe nada.
// 2. El historial lee con `leerBusquedaGuardada()` desde el inicializador de `useState`, y
//    llama a `limpiarBusquedaGuardada()` en un efecto de montaje que corre SIEMPRE, se haya
//    restaurado o no.
// 3. Solo se restaura si el montaje viene de un «atrás» (`useNavigationType() === "POP"`).
//    Entrar al historial desde el menú es un `PUSH`: el efecto del punto 2 vacía el hueco y
//    no se restaura nada, así que un documento buscado hace rato no reaparece en una visita
//    que no tiene nada que ver.
//
// Ventana conocida y aceptada: si alguien va al detalle y de ahí se marcha a otra pantalla
// sin volver, el valor sigue en memoria hasta el próximo montaje del historial, que lo borra
// sin llegar a mostrarlo. Muere al recargar. Cerrar la sesión no lo borra hoy: hacerlo
// tocaría `ProveedorSesion`, que es compartido y ya está entregado, y queda como pendiente.

import type { BusquedaPaciente } from "../services/historial";

let guardada: BusquedaPaciente | null = null;

/** Deja la búsqueda para cuando se vuelva del detalle. Reemplaza cualquier otra sin leer. */
export function guardarBusquedaParaVolver(busqueda: BusquedaPaciente): void {
  guardada = busqueda;
}

/** Lectura pura: devuelve lo guardado sin borrarlo. Se puede llamar varias veces. */
export function leerBusquedaGuardada(): BusquedaPaciente | null {
  return guardada;
}

/** Borra lo guardado. Es idempotente: llamarla de más no hace nada. */
export function limpiarBusquedaGuardada(): void {
  guardada = null;
}
