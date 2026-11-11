// Ícono/salir (Figma 12:557).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoSalir({ className }: PropiedadesIcono) {
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
      <path d="M7.5 17.5H4.16667C3.94565 17.5 3.73369 17.4122 3.57741 17.2559C3.42113 17.0996 3.33333 16.8877 3.33333 16.6667V3.33333C3.33333 3.11232 3.42113 2.90036 3.57741 2.74408C3.73369 2.5878 3.94565 2.5 4.16667 2.5H7.5" />
      <path d="M13.3333 14.1667L17.5 10L13.3333 5.83333" />
      <path d="M17.5 10H7.5" />
    </svg>
  );
}
