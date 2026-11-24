// La baja que quedó a medias cuando el doctor tenía casos activos: W-11 la deja antes de ir a
// W-25 (D-02) y W-11 la recoge al volver (D-10b), para saber que la reasignación era el paso
// previo de una desactivación o de una eliminación, y con qué doctor de destino.
//
// Vive en una variable de módulo, es decir, en memoria: se pierde al recargar la página y nunca
// llega a `localStorage`, a `sessionStorage` ni a la URL. Tampoco se usa `location.state` de
// react-router, que sí queda guardado en `history.state` del navegador, por la misma razón que
// explica `notificacionPendiente.ts`. Perderla al recargar no rompe nada: W-11 vuelve a ofrecer
// el botón y W-25 sigue funcionando como reasignación suelta.
//
// Leer y borrar están separados, igual que en `notificacionPendiente.ts`: dentro de
// `<React.StrictMode>` React llama dos veces a la función inicializadora de `useState`, así que
// si leer borrara, la segunda llamada —el render que React conserva— no encontraría nada.
//
// `destinoId` es lo que ya había elegido el administrador. Importa en el rebote: si entre la
// reasignación y la baja le asignan un caso nuevo al doctor, el servidor responde otra vez 409
// DESTINO_REQUERIDO y se vuelve a W-25; llegar con el destino en blanco sería hacerle repetir
// una decisión que ya tomó.
import type { TipoTraslado } from "../types";

/** Las dos bajas que pueden quedar pendientes de reasignar. Reasignar por sí sola no es una baja. */
export type TipoBaja = Extract<TipoTraslado, "DESACTIVACION" | "ELIMINACION">;

export interface BajaPendiente {
  /** Cuenta que se iba a dar de baja. Si se abre otro detalle, esta baja ya no aplica. */
  usuarioId: string;
  tipo: TipoBaja;
  /** Doctor de destino elegido en un intento anterior, si lo hubo. */
  destinoId?: string;
}

let pendiente: BajaPendiente | null = null;

/** Deja la baja pendiente para la pantalla siguiente. Reemplaza cualquier otra sin leer. */
export function dejarBajaPendiente(baja: BajaPendiente): void {
  pendiente = baja;
}

/**
 * Lectura pura: devuelve la baja pendiente **de esa cuenta**, o `null`. Pedirla con otro
 * `usuarioId` no la devuelve (y tampoco la borra: de eso se encarga quien corresponda).
 */
export function leerBajaPendiente(usuarioId: string): BajaPendiente | null {
  return pendiente?.usuarioId === usuarioId ? pendiente : null;
}

/** Borra la baja pendiente. Es idempotente: llamarla de más no hace nada. */
export function limpiarBajaPendiente(): void {
  pendiente = null;
}
