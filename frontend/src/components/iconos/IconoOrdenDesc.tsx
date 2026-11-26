// Ícono/orden-desc. Columna por la que se está ordenando, de mayor a menor. Decorativo: el estado
// lo dice `aria-sort="descending"` en el encabezado que lo contiene.
//
// **Derivado, no exportado de Figma.** El componente «Encabezado de tabla» (16:710) solo tiene
// dibujadas las variantes «Ninguno» y «Ascendente», pero su descripción pide
// `aria-sort="ascending|descending|none"`, así que la descendente hace falta en código. Es el
// mismo trazo de `Ícono/orden-asc` reflejado sobre el eje horizontal: la punta de la flecha pasa
// de y=3.33 a y=12.67 y las barbas de y=7.33 a y=8.67. Si diseño dibuja la variante, se
// reemplaza este trazo por el suyo.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoOrdenDesc({ className }: PropiedadesIcono) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 3.33333V12.6667M12 8.66667L8 12.6667L4 8.66667" />
    </svg>
  );
}
