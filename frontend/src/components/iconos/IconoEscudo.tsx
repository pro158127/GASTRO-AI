// Ícono/escudo (Figma 12:643). Se dibuja a 32 px, como en W-04.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoEscudo({ className }: PropiedadesIcono) {
  return (
    <svg
      className={className}
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 4L26.6667 8V16C26.6667 22.6667 22 26.6667 16 28C10 26.6667 5.33333 22.6667 5.33333 16V8L16 4Z" />
    </svg>
  );
}
