// Enlace con el aspecto del componente «Botón» (Figma 13:606), para ir a otra pantalla:
// navegar es un enlace, no un botón. Comparte los estilos de Boton.
import { Link } from "react-router";
import type { LinkProps } from "react-router";
import type { JerarquiaBoton } from "./Boton";
import estilos from "./Boton.module.css";

interface PropiedadesEnlaceBoton extends LinkProps {
  jerarquia?: JerarquiaBoton;
}

export default function EnlaceBoton({ jerarquia = "terciario", className, ...resto }: PropiedadesEnlaceBoton) {
  const clases = [estilos.boton, estilos[jerarquia], className ?? ""].filter(Boolean).join(" ");
  return <Link {...resto} className={clases} />;
}
