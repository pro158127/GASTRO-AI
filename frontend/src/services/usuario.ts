// Punto de cambio entre datos simulados y API real: cuando el backend confirme el endpoint,
// la función se implementa en api.ts y aquí solo cambia el origen del export.
export { obtenerResumenCasosRecibidos } from "./simulados/usuario";
