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
  /**
   * Nivel del título: `h1` cuando el estado vacío es toda la pantalla (W-28); `h2` cuando va
   * dentro de una pantalla que ya tiene su h1 (por ejemplo W-09b y W-09c); `h3` cuando va
   * dentro de una sección que ya tiene su h2, como los vacíos de las dos listas de W-16. El
   * aspecto no cambia: el nivel es solo para que el esquema de encabezados no salte (WCAG
   * 1.3.1).
   */
  nivelTitulo?: "h1" | "h2" | "h3";
}

export default function EstadoVacio({ titulo, mensaje, children, nivelTitulo = "h1" }: PropiedadesEstadoVacio) {
  const Titulo = nivelTitulo;
  return (
    <div className={estilos.estado}>
      <img src={mascota} alt="" className={estilos.mascota} />
      <Titulo className={estilos.titulo}>{titulo}</Titulo>
      <p className={estilos.mensaje}>{mensaje}</p>
      {children}
    </div>
  );
}
