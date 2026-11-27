// Dashboard técnico del administrador (W-19), ../ARCHITECTURE.md § 3.5.
//
// Una sola consulta trae la pantalla entera: cuentas, seguridad, estado de los servicios,
// modelo desplegado y latencia. Las métricas del modelo (las seis tarjetas de evaluación) no
// salen de aquí: son de `GET /admin/modelo/metricas`, que es otra pantalla.
import type { DashboardTecnico } from "../types";
import { solicitar } from "./api";

/**
 * `GET /admin/dashboard`. Solo rol ADMINISTRADOR; el backend responde 403 a cualquier otro.
 *
 * **No es pasiva**: la pide la persona al entrar en la pantalla o al reintentar tras un fallo,
 * así que debe renovar la inactividad de la sesión. Tampoco se sondea: este dashboard no se
 * actualiza solo. La medición de los servicios la reutiliza el servidor si tiene menos de 30 s,
 * de modo que entrar aquí no vuelve a medir.
 */
export function obtenerDashboardTecnico(): Promise<DashboardTecnico> {
  return solicitar<DashboardTecnico>("/admin/dashboard");
}
