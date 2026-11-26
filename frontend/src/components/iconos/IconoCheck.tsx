// Ícono/check (Figma 12:496). Es el visto solo, sin círculo: el del círculo es `IconoExito`,
// que usa la Alerta. W-07 marca con este las etapas que ya terminaron.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoCheck({ className }: PropiedadesIcono) {
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
      <path d="M3.33333 10.8333L7.5 15L16.6667 5" />
    </svg>
  );
}
