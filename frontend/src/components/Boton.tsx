// Componente «Botón» del sistema de diseño (Figma 13:606).
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import IndicadorCarga from "./iconos/IndicadorCarga";
import estilos from "./Boton.module.css";

export type JerarquiaBoton = "primario" | "secundario" | "terciario" | "destructivo";

interface PropiedadesBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  jerarquia?: JerarquiaBoton;
  /** Estado «Cargando»: indicador giratorio y etiqueta en gerundio; no responde a clics. */
  cargando?: boolean;
  /** Etiqueta que se muestra mientras `cargando` es verdadero. */
  etiquetaCargando?: string;
  icono?: ReactNode;
  anchoCompleto?: boolean;
}

export default function Boton({
  jerarquia = "primario",
  cargando = false,
  etiquetaCargando = "Procesando…",
  icono,
  anchoCompleto = false,
  type = "button",
  className,
  children,
  onClick,
  ...resto
}: PropiedadesBoton) {
  const clases = [
    estilos.boton,
    estilos[jerarquia],
    cargando ? estilos.cargando : "",
    anchoCompleto ? estilos.anchoCompleto : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // Se usa aria-disabled (no `disabled`) para que el botón conserve el foco; los clics se
  // ignoran aquí, incluido el envío implícito del formulario con Enter.
  function manejarClic(evento: MouseEvent<HTMLButtonElement>) {
    if (cargando) {
      evento.preventDefault();
      return;
    }
    onClick?.(evento);
  }

  return (
    <button
      {...resto}
      type={type}
      className={clases}
      onClick={manejarClic}
      aria-busy={cargando || undefined}
      aria-disabled={cargando || undefined}
    >
      {cargando ? (
        <>
          {/* Hereda el color de la etiqueta de cada jerarquía. */}
          <IndicadorCarga className={estilos.indicador} />
          <span>{etiquetaCargando}</span>
        </>
      ) : (
        <>
          {icono}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}
