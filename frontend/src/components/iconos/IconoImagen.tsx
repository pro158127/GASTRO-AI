// Ícono/imagen (Figma 12:580). Marcador de la miniatura en la zona de carga.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoImagen({ className }: PropiedadesIcono) {
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
      <path d="M2.5 5C2.5 4.07953 3.24619 3.33333 4.16667 3.33333H15.8333C16.7538 3.33333 17.5 4.07953 17.5 5V15C17.5 15.9205 16.7538 16.6667 15.8333 16.6667H4.16667C3.24619 16.6667 2.5 15.9205 2.5 15V5Z" />
      <path d="M7.91667 8.33333C7.91667 9.02369 7.35702 9.58333 6.66667 9.58333C5.97631 9.58333 5.41667 9.02369 5.41667 8.33333C5.41667 7.64298 5.97631 7.08333 6.66667 7.08333C7.35702 7.08333 7.91667 7.64298 7.91667 8.33333Z" />
      <path d="M17.5 12.5L13.3333 8.33333L4.16667 16.6667" />
    </svg>
  );
}
