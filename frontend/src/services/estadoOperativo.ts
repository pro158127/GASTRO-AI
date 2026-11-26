// Contrato de GET/POST /admin/estado-operativo · W-22.
import { solicitar } from "./api";

export type EstadoServicio = "OPERATIVO" | "LENTO" | "SIN_RESPUESTA";

export interface ServicioOperativo {
  codigo: string;
  nombre: string;
  estado: EstadoServicio;
  tiempo_respuesta_ms: number | null;
  ultima_verificacion: string;
}

export interface AlertaOperativa {
  nivel: "ERROR" | "ADVERTENCIA";
  mensaje: string;
}

export interface ModeloDesplegado {
  repositorio_hf: string;
  revision_sha: string;
  huella_pesos_sha256: string;
  desplegado_en: string;
  model_card_url: string | null;
  coincide_con_configuracion: boolean;
  revision_space: string | null;
}

export interface RespuestaEstadoOperativo {
  verificado_en: string;
  alerta: AlertaOperativa | null;
  servicios: ServicioOperativo[];
  modelo_desplegado: ModeloDesplegado | null;
}

/** Consulta automática: no renueva la inactividad de la sesión. */
export function obtenerEstadoOperativo(opciones: { pasiva?: boolean } = {}): Promise<RespuestaEstadoOperativo> {
  return solicitar<RespuestaEstadoOperativo>("/admin/estado-operativo", {
    pasiva: opciones.pasiva ?? true,
  });
}

/** Acción explícita del administrador para solicitar una nueva medición. */
export function verificarEstadoOperativo(): Promise<RespuestaEstadoOperativo> {
  return solicitar<RespuestaEstadoOperativo>("/admin/estado-operativo/verificar", {
    metodo: "POST",
  });
}
