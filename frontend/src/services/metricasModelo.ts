// Contratos de W-23 y W-24 · backend/app/api/routers/admin_monitoreo.py.
import { solicitar } from "./api";

export interface MetricasModelo {
  SENSIBILIDAD?: number | null;
  ESPECIFICIDAD?: number | null;
  F1?: number | null;
  ROC_AUC?: number | null;
  PR_AUC?: number | null;
  BRIER?: number | null;
  ECE?: number | null;
}

export interface RespuestaMetricasModelo {
  disponible: boolean;
  modelo?: { repositorio_hf: string; revision_sha: string } | null;
  rotulo?: string | null;
  conjunto_prueba?: string | null;
  fecha_reporte?: string | null;
  contiene_datos_clinicos?: boolean | null;
  model_card_url?: string | null;
  macro?: MetricasModelo | null;
  por_caracteristica?: Array<MetricasModelo & { caracteristica: { id: number; nombre: string } }>;
}


/** GET /admin/modelo/metricas; los campos no aplicables pueden no venir en el JSON. */
export function obtenerMetricasModelo(opciones: { pasiva?: boolean } = {}): Promise<RespuestaMetricasModelo> {
  return solicitar<RespuestaMetricasModelo>("/admin/modelo/metricas", {
    pasiva: opciones.pasiva ?? true,
  });
}
