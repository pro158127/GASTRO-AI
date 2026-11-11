// Componente «Logo/Horizontal · sobre oscuro» (Figma 66:2293): isotipo y palabra en fila, para
// la barra lateral azul marino. Es una adaptación derivada del logo oficial (azul a blanco, el
// naranja se conserva); Figma pide validarla con el equipo. Los SVG se usan como archivos y se
// escalan por altura sin deformar (la palabra no se reemplaza por texto en Inter).
import isotipo from "../assets/logo-isotipo-oscuro.svg";
import palabra from "../assets/logo-palabra-oscuro.svg";
import estilos from "./LogoHorizontal.module.css";

interface PropiedadesLogoHorizontal {
  /** Alto del isotipo en px: 36 (barra lateral), 32 (panel de celular) o 28 (barra de celular). */
  alto?: 28 | 32 | 36;
  className?: string;
}

export default function LogoHorizontal({ alto = 36, className }: PropiedadesLogoHorizontal) {
  return (
    <div className={[estilos.logo, estilos[`alto${alto}`], className ?? ""].filter(Boolean).join(" ")}>
      <img src={isotipo} alt="" className={estilos.isotipo} />
      {/* data-palabra: la barra lateral contraída (tableta) la oculta y deja solo el isotipo. */}
      <img src={palabra} alt="Gastro-AI" className={estilos.palabra} data-palabra="" />
    </div>
  );
}
