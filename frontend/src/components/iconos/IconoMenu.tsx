// Ícono/menu (Figma 106:2295).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoMenu({ className }: PropiedadesIcono) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.6 6H20.4" />
      <path d="M3.6 12H20.4" />
      <path d="M3.6 18H20.4" />
    </svg>
  );
}
