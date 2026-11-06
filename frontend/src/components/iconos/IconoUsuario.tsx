// Ícono/usuario (Figma 12:544).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoUsuario({ className }: PropiedadesIcono) {
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
      <path d="M13.3333 6.66667C13.3333 8.50762 11.8409 10 10 10C8.15905 10 6.66667 8.50762 6.66667 6.66667C6.66667 4.82572 8.15905 3.33333 10 3.33333C11.8409 3.33333 13.3333 4.82572 13.3333 6.66667Z" />
      <path d="M3.33333 16.6667C3.33333 13.3333 6.66667 11.6667 10 11.6667C13.3333 11.6667 16.6667 13.3333 16.6667 16.6667" />
    </svg>
  );
}
