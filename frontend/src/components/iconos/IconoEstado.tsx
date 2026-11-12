// Ícono/estado (Figma 12:590).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoEstado({ className }: PropiedadesIcono) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 10H5.83333L8.33333 3.33333L11.6667 16.6667L14.1667 10H17.5" />
    </svg>
  );
}
