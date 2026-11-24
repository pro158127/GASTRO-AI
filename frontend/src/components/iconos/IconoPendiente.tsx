// Círculo vacío de las etapas que todavía no empezaron (W-07) o que no se realizaron (W-07b).
// Figma lo dibuja como una elipse sin relleno, no como un ícono del catálogo.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoPendiente({ className }: PropiedadesIcono) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.5 10C17.5 14.1421 14.1421 17.5 10 17.5C5.85786 17.5 2.5 14.1421 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5C14.1421 2.5 17.5 5.85786 17.5 10Z" />
    </svg>
  );
}
