// Ícono/ocultar (Figma 12:612): ojo tachado. Contraseña oculta.
// Figma lo dibuja en una rejilla de 24; aquí está a 20 px con la misma escala (5/6) y el mismo
// trazo de 2 px que Figma aplicó a «ver», de modo que ambos íconos son idénticos salvo la diagonal.
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoOcultar({ className }: PropiedadesIcono) {
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
      <path d="M1.66667 10C1.66667 10 4.58333 4.16667 10 4.16667C15.4167 4.16667 18.3333 10 18.3333 10C18.3333 10 15.4167 15.8333 10 15.8333C4.58333 15.8333 1.66667 10 1.66667 10Z" />
      <path d="M12.5 10C12.5 11.3807 11.3807 12.5 10 12.5C8.61929 12.5 7.5 11.3807 7.5 10C7.5 8.61929 8.61929 7.5 10 7.5C11.3807 7.5 12.5 8.61929 12.5 10Z" />
      <path d="M2.5 2.5L17.5 17.5" />
    </svg>
  );
}
