// Ícono/orden-asc (Figma 12:662). Columna por la que se está ordenando, de menor a mayor.
// Decorativo: el estado lo dice `aria-sort="ascending"` en el encabezado que lo contiene.
// Retícula de 16, como el resto de los íconos del encabezado de tabla.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoOrdenAsc({ className }: PropiedadesIcono) {
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
      <path d="M8 12.6667V3.33333M12 7.33333L8 3.33333L4 7.33333" />
    </svg>
  );
}
