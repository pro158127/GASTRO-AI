// Punto de cambio entre datos simulados y API real: cuando el backend confirme los endpoints,
// estas funciones se implementan en api.ts y aquí solo cambia el origen del export.
export { obtenerResumenCasosRecibidos, obtenerUsuarioActual } from "./simulados/usuario";
