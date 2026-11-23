// Ícono/subir (Figma 12:528).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoSubir({ className }: PropiedadesIcono) {
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
      <path d="M10 13.3333V3.33333" />
      <path d="M6.25 7.08333L10 3.33333L13.75 7.08333" />
      <path d="M3.33333 13.3333V15.8333C3.33333 16.2936 3.70643 16.6667 4.16667 16.6667H15.8333C16.2936 16.6667 16.6667 16.2936 16.6667 15.8333V13.3333" />
    </svg>
  );
}
