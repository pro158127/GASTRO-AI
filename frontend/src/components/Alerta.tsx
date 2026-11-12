// Componente «Alerta» del sistema de diseño (Figma 14:548): mensaje en línea y persistente.
// Siempre lleva icono + texto (WCAG 1.4.1). role="alert" para error y role="status" para el resto.
import type { ComponentType, ReactNode } from "react";
import IconoAdvertencia from "./iconos/IconoAdvertencia";
import IconoError from "./iconos/IconoError";
import IconoExito from "./iconos/IconoExito";
import IconoInfo from "./iconos/IconoInfo";
import type { PropiedadesIcono } from "./iconos/PropiedadesIcono";
import estilos from "./Alerta.module.css";

export type TipoAlerta = "info" | "exito" | "advertencia" | "error";

interface PropiedadesAlerta {
  tipo?: TipoAlerta;
  titulo?: string;
  children?: ReactNode;
}

const iconos: Record<TipoAlerta, ComponentType<PropiedadesIcono>> = {
  info: IconoInfo,
  exito: IconoExito,
  advertencia: IconoAdvertencia,
  error: IconoError,
};

export default function Alerta({ tipo = "info", titulo, children }: PropiedadesAlerta) {
  const Icono = iconos[tipo];
  return (
    <div className={`${estilos.alerta} ${estilos[tipo]}`} role={tipo === "error" ? "alert" : "status"}>
      <Icono className={estilos.icono} />
      <div className={estilos.contenido}>
        {titulo && <p className={estilos.titulo}>{titulo}</p>}
        {children && <p className={estilos.mensaje}>{children}</p>}
      </div>
    </div>
  );
}
