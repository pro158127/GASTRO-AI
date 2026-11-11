// Enlace «Saltar al contenido» (WCAG 2.4.1). Figma no lo dibuja: es lo único de esta estructura
// que no está en el diseño. Queda oculto hasta recibir el foco con teclado.
import estilos from "./EnlaceSaltarContenido.module.css";

export default function EnlaceSaltarContenido({ onActivar }: { onActivar: () => void }) {
  return (
    <a
      href="#contenido"
      className={estilos.enlace}
      onClick={(evento) => {
        // Se evita cambiar la URL (el hash no aporta nada en esta SPA).
        evento.preventDefault();
        onActivar();
      }}
    >
      Saltar al contenido
    </a>
  );
}
