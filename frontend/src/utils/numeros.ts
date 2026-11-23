// Porcentajes tal como los escribe Figma, en es-CO (coma decimal): «84 %», «14,2 %».
//
// Hay **dos** funciones a propósito. `GET /analisis/{id}` mezcla dos escalas: las
// probabilidades, los umbrales y las coordenadas van de 0 a 1, mientras que
// `area_porcentaje` ya viene de 0 a 100 (`alembic/sql/restricciones.sql`). Una sola función
// «porcentaje» invitaría a multiplicar por cien lo que no debe, y un 14,2 % de área se
// convertiría en 1420 % sin que nada avise.

/** Espacio duro antes del «%» para que el signo no quede solo al final de la línea. */
const ESPACIO_DURO = " ";

const SIN_DECIMALES = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const UN_DECIMAL = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/**
 * Fracción de 0 a 1 → «84 %». Para `probabilidad` y `umbral_aplicado`.
 *
 * Cadena vacía si el valor no es un número utilizable: no se inventa un porcentaje.
 */
export function porcentajeDeFraccion(valor: number | null | undefined): string {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "";
  return `${SIN_DECIMALES.format(valor * 100)}${ESPACIO_DURO}%`;
}

/**
 * Valor que ya viene de 0 a 100 → «14,2 %». Para `area_porcentaje`, que el servidor guarda
 * como `Numeric(5, 2)` en esa escala.
 */
export function porcentajeDirecto(valor: number | null | undefined): string {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "";
  return `${UN_DECIMAL.format(valor)}${ESPACIO_DURO}%`;
}

/**
 * Fracción de 0 a 1 → número de 0 a 100 para el ancho o la posición de una barra en CSS.
 * Se recorta al rango: un valor fuera de él solo podría descuadrar el dibujo.
 */
export function fraccionEnBarra(valor: number | null | undefined): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return 0;
  return Math.min(100, Math.max(0, valor * 100));
}
