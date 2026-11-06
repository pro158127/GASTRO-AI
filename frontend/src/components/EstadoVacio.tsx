// Componente «Estado vacío con TOPOLOGO» del sistema de diseño (Figma 51:1024): estado vacío o de
// error amable con la mascota, un título, un mensaje y una acción. La mascota es decorativa.
import type { ReactNode } from "react";
import mascota from "../assets/mascota-topologo.svg";
import estilos from "./EstadoVacio.module.css";

interface PropiedadesEstadoVacio {
  titulo: string;
  mensaje: string;
  /** Acción (botón o enlace-botón). */
  children?: ReactNode;
}

export default function EstadoVacio({ titulo, mensaje, children }: PropiedadesEstadoVacio) {
  return (
    <div className={estilos.estado}>
      <img src={mascota} alt="" className={estilos.mascota} />
      <h1 className={estilos.titulo}>{titulo}</h1>
      <p className={estilos.mensaje}>{mensaje}</p>
      {children}
    </div>
  );
}
