// Ícono/candado (Figma 12:617). Se dibuja a 24 px, como en el aviso de solo lectura de W-21.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoCandado({ className }: PropiedadesIcono) {
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
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
