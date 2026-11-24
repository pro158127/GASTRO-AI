// Ícono/ordenar (Figma 12:658). Columna que se puede ordenar y todavía no se está usando para
// ordenar. Decorativo: el estado lo dice `aria-sort` en el encabezado que lo contiene.
//
// A diferencia del resto de los íconos, la retícula es de 16 y no de 24: así está dibujado en el
// componente «Encabezado de tabla» (16:710), donde mide 16 px al lado de un texto de 14.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoOrdenar({ className }: PropiedadesIcono) {
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
      <path d="M5.33333 2.66667V13.3333M8 5.33333L5.33333 2.66667L2.66667 5.33333M10.6667 13.3333V2.66667M8 10.6667L10.6667 13.3333L13.3333 10.6667" />
    </svg>
  );
}
