// Contratos W-24 · backend/app/api/routers/admin_monitoreo.py.
import { solicitar } from "./api";

export type EstadoLogTecnico = "EXITO" | "ERROR" | "TIEMPO_AGOTADO";

export interface LogTecnico {
  id: string;
  ocurrido_en: string;
  revision_modelo: string;
  latencia_vision_ms: number;
  latencia_llm_ms: number | null;
  estado: EstadoLogTecnico;
  codigo_error: string | null;
}

export interface PaginaLogsTecnicos {
  items: LogTecnico[];
  paginacion: { pagina: number; por_pagina: number; total: number };
}

export interface FiltrosLogsTecnicos {
  estado: EstadoLogTecnico | "";
  desde: string;
  hasta: string;
  pagina: number;
}

export const LOGS_POR_PAGINA = 25;

/** GET /admin/logs-inferencia, con días de Colombia inclusivos y página desde 1. */
export function listarLogsTecnicos(
  filtros: FiltrosLogsTecnicos,
  opciones: { pasiva?: boolean } = {}
): Promise<PaginaLogsTecnicos> {
  const parametros = new URLSearchParams({
    pagina: String(filtros.pagina),
    por_pagina: String(LOGS_POR_PAGINA),
  });
  if (filtros.estado) parametros.set("estado", filtros.estado);
  if (filtros.desde) parametros.set("desde", filtros.desde);
  if (filtros.hasta) parametros.set("hasta", filtros.hasta);
  return solicitar<PaginaLogsTecnicos>(`/admin/logs-inferencia?${parametros.toString()}`, {
    pasiva: opciones.pasiva ?? true,
  });
}
