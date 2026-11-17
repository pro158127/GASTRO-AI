// Datos simulados del resumen de casos recibidos. El usuario y el rol ya son reales
// (GET /auth/sesion); este contador sigue simulado porque el endpoint todavía no existe.
// Formato propuesto en CONTRATOS_API.md; mientras el backend no lo confirme, no es un endpoint
// existente.
import type { ResumenCasosRecibidos } from "../../types";

/**
 * Casos recibidos por traslado sin revisar. Es el único lugar donde vive este dato: el
 * contador del menú y el indicador del dashboard W-15 deben leerlo de aquí.
 */
const CASOS_RECIBIDOS_SIN_REVISAR = 4;

// SIMULADO: falta endpoint GET /api/v1/casos-recibidos/resumen
export async function obtenerResumenCasosRecibidos(): Promise<ResumenCasosRecibidos> {
  return { sin_revisar: CASOS_RECIBIDOS_SIN_REVISAR };
}
