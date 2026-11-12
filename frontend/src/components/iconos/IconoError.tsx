// Ícono/error (Figma 12:511). Tamaño 20 px en las alertas y 16 px en el mensaje de error de un campo.
import type { PropiedadesIcono } from "./PropiedadesIcono";

interface PropiedadesIconoError extends PropiedadesIcono {
  tamano?: 16 | 20;
}

export default function IconoError({ className, tamano = 20 }: PropiedadesIconoError) {
  return (
    <svg
      className={className}
      width={tamano}
      height={tamano}
      viewBox={`0 0 ${tamano} ${tamano}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {tamano === 16 ? (
        <>
          <path d="M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z" />
          <path d="M10 6L8 8M8 8L6 10M8 8L6 6M8 8L10 10" />
        </>
      ) : (
        <>
          <path d="M17.5 10C17.5 14.1421 14.1421 17.5 10 17.5C5.85786 17.5 2.5 14.1421 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5C14.1421 2.5 17.5 5.85786 17.5 10Z" />
          <path d="M12.5 7.5L10 10M10 10L7.5 12.5M10 10L7.5 7.5M10 10L12.5 12.5" />
        </>
      )}
    </svg>
  );
}
