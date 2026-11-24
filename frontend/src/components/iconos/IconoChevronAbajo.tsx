// Ícono/chevron-abajo (Figma 12:635). Decorativo: solo indica que el control despliega opciones,
// y quien lo contiene ya tiene etiqueta y rol propios (la lista desplegable es un `<select>`).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoChevronAbajo({ className }: PropiedadesIcono) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 9L12 15L18 9" />
    </svg>
  );
}
