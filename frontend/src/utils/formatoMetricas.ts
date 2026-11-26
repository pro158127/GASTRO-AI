// Formato de las métricas del modelo (RM-06), compartido por la pantalla W-23
// (`pages/MetricasModelo.tsx`) y por el bloque de evaluación de W-19
// (`pages/EvaluacionModelo.tsx`).
//
// Este código vivía dentro de W-23 y se movió aquí **tal cual**: las mismas reglas, los mismos
// literales, el mismo «No reportada». No se reescribió nada al moverlo, para que W-23 no cambie
// de aspecto ni de comportamiento.
//
// El motivo del traslado es que las dos pantallas están a un clic de distancia: si cada una
// aplicara sus propias reglas, el mismo número saldría como «0,90» en el dashboard y como «90 %»
// en las métricas, y la aplicación se contradiría consigo misma.
//
// **Hay una decisión abierta** sobre pasar ROC-AUC y PR-AUC a decimal. La toma otra persona y
// vale para las dos pantallas a la vez: se cambia aquí, en `valorMetrica`, y cambia en ambas.
import type { MetricasModelo as ValoresMetricas } from "../services/metricasModelo";

const formatoPorcentaje = new Intl.NumberFormat("es-CO", {
  style: "percent",
  maximumFractionDigits: 1,
});
const formatoCalibracion = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
export const formatoNumero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export const metricas = [
  { campo: "SENSIBILIDAD", etiqueta: "Sensibilidad", calibracion: false },
  { campo: "ESPECIFICIDAD", etiqueta: "Especificidad", calibracion: false },
  { campo: "F1", etiqueta: "F1", calibracion: false },
  { campo: "ROC_AUC", etiqueta: "ROC-AUC", calibracion: false },
  { campo: "PR_AUC", etiqueta: "PR-AUC", calibracion: false },
  { campo: "BRIER", etiqueta: "Brier · menor es mejor", calibracion: true },
  { campo: "ECE", etiqueta: "ECE · menor es mejor", calibracion: true },
] as const;

export function valorMetrica(valores: ValoresMetricas | null | undefined, campo: (typeof metricas)[number]["campo"]): string {
  const valor = valores?.[campo];
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "No reportada";
  return campo === "BRIER" || campo === "ECE" ? formatoCalibracion.format(valor) : formatoPorcentaje.format(valor);
}

export function fechaReporte(fecha: string | null | undefined): string {
  if (!fecha) return "No incluida";
  const [anio, mes, dia] = fecha.split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : "No incluida";
}
