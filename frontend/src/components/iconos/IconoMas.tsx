// Ícono/mas (Figma 12:639).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoMas({ className }: PropiedadesIcono) {
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
      <path d="M12 5V12M12 12V19M12 12H5M12 12H19" />
    </svg>
  );
}
