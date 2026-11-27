// Dashboard clínico del doctor (W-15), ../ARCHITECTURE.md § 3.5.
//
// Una sola consulta trae la pantalla entera: resumen, casos recientes, frecuencia,
// concordancia, traslados recibidos y el aviso experimental. No hay nada que pedir aparte;
// en particular, el total de casos recibidos sale de aquí y no de `GET /casos-recibidos`.
import type { DashboardDoctor } from "../types";
import { solicitar } from "./api";

/**
 * `GET /dashboard/doctor`. Solo rol DOCTOR; el backend responde 403 a cualquier otro.
 *
 * **No es pasiva**: la pide la persona al entrar en la pantalla o al reintentar tras un
 * fallo, así que debe renovar la inactividad de la sesión. Tampoco se sondea: el dashboard
 * no se actualiza solo.
 */
export function obtenerDashboardDoctor(): Promise<DashboardDoctor> {
  return solicitar<DashboardDoctor>("/dashboard/doctor");
}
