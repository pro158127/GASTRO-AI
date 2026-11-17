// Ícono/advertencia (Figma 12:506).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoAdvertencia({ className }: PropiedadesIcono) {
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
      <path d="M10 2.5L1.66667 16.6667H18.3333L10 2.5Z" />
      <path d="M10 8.33333V11.6667" />
      <path d="M10 14.1667H10.0083" />
    </svg>
  );
}
