// Componente «Logo/Completo» del sistema de diseño (Figma 66:2279): isotipo arriba y palabra abajo.
// Los SVG oficiales se usan como archivos con <img>; la palabra no se reemplaza por texto en Inter.
import isotipo from "../assets/logo-isotipo.svg";
import palabra from "../assets/logo-palabra.svg";
import estilos from "./Logo.module.css";

export default function Logo() {
  return (
    <div className={estilos.logo}>
      <img src={isotipo} alt="" className={estilos.isotipo} />
      <img src={palabra} alt="Gastro-AI" className={estilos.palabra} />
    </div>
  );
}
