// Componente «Insignia» del sistema de diseño (Figma 14:574): estado corto de un registro (cuenta
// activa, pendiente, bloqueada…). El significado lo da el texto; el color solo refuerza (WCAG 1.4.1).
import type { TipoInsignia } from "../utils/presentacionUsuario";
import estilos from "./Insignia.module.css";

interface PropiedadesInsignia {
  tipo: TipoInsignia;
  children: string;
}

export default function Insignia({ tipo, children }: PropiedadesInsignia) {
  return <span className={`${estilos.insignia} ${estilos[tipo]}`}>{children}</span>;
}
