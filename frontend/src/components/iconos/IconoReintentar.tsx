// Ícono/reintentar (Figma 12:654). Lo llevan los botones de acción de W-20 («Nueva contraseña» y
// «Reintentar envío»). Decorativo: la etiqueta del botón es el nombre accesible.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoReintentar({ className }: PropiedadesIcono) {
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
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1.06 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
