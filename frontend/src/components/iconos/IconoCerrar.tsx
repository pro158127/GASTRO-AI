// Ícono/cerrar (Figma 12:500).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoCerrar({ className }: PropiedadesIcono) {
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
      <path d="M6 6L12 12M12 12L18 18M12 12L18 6M12 12L6 18" />
    </svg>
  );
}
