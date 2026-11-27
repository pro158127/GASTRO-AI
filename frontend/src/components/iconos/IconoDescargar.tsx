// Ícono/descargar. Es `IconoSubir` con la flecha al revés: misma bandeja, misma retícula de
// 20 px y mismos grosores, para que los dos se lean como el mismo par.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoDescargar({ className }: PropiedadesIcono) {
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
      <path d="M10 3.33333V13.3333" />
      <path d="M6.25 9.58333L10 13.3333L13.75 9.58333" />
      <path d="M3.33333 13.3333V15.8333C3.33333 16.2936 3.70643 16.6667 4.16667 16.6667H15.8333C16.2936 16.6667 16.6667 16.2936 16.6667 15.8333V13.3333" />
    </svg>
  );
}
