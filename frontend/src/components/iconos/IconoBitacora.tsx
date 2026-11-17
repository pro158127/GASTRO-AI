// Ícono/bitacora (Figma 12:586).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoBitacora({ className }: PropiedadesIcono) {
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
      <path d="M11.6667 2.5H5C4.77899 2.5 4.56702 2.5878 4.41074 2.74408C4.25446 2.90036 4.16667 3.11232 4.16667 3.33333V16.6667C4.16667 16.8877 4.25446 17.0996 4.41074 17.2559C4.56702 17.4122 4.77899 17.5 5 17.5H15C15.221 17.5 15.433 17.4122 15.5893 17.2559C15.7455 17.0996 15.8333 16.8877 15.8333 16.6667V6.66667L11.6667 2.5Z" />
      <path d="M11.6667 2.5V6.66667H15.8333" />
      <path d="M7.5 10.8333H12.5M7.5 14.1667H12.5" />
    </svg>
  );
}
