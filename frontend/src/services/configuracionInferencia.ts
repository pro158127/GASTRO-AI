// Contrato de GET/PUT /admin/configuracion-inferencia (W-26, RF-A01 y RF-A02).
import { solicitar } from "./api";

export interface UmbralCaracteristica {
  id: number;
  codigo: string;
  nombre: string;
  umbral: number | null;
  umbral_por_defecto: number | null;
  activa: boolean;
}

export interface ConfiguracionInferencia {
  usar_umbral_por_caracteristica: boolean;
  umbral_global: number;
  rango: { min: number; max: number };
  caracteristicas: UmbralCaracteristica[];
  actualizado_por: { nombre: string; apellido: string } | null;
  actualizado_en: string;
}

export interface CambioUmbralCaracteristica {
  caracteristica_id: number;
  umbral: number | null;
}

export interface ActualizacionConfiguracionInferencia {
  usar_umbral_por_caracteristica: boolean;
  umbral_global: number;
  umbrales: CambioUmbralCaracteristica[];
}

export function obtenerConfiguracionInferencia(): Promise<ConfiguracionInferencia> {
  return solicitar<ConfiguracionInferencia>("/admin/configuracion-inferencia", { pasiva: true });
}

export function guardarConfiguracionInferencia(
  configuracion: ActualizacionConfiguracionInferencia,
): Promise<ConfiguracionInferencia> {
  return solicitar<ConfiguracionInferencia>("/admin/configuracion-inferencia", {
    metodo: "PUT",
    cuerpo: configuracion,
  });
}
