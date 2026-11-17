// Componente «Campo de texto» del sistema de diseño (Figma 13:705).
import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import IconoError from "./iconos/IconoError";
import estilos from "./CampoTexto.module.css";

export interface PropiedadesCampoTexto extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Etiqueta visible y persistente; el placeholder nunca la reemplaza. */
  etiqueta: string;
  ayuda?: string;
  /** Si existe, el campo pasa al estado «Error» (icono + texto) y no se borra lo escrito. */
  mensajeError?: string;
  id?: string;
  /** Contenido al final del control, por ejemplo el botón «Mostrar contraseña». */
  accionFinal?: ReactNode;
}

export default function CampoTexto({
  etiqueta,
  ayuda,
  mensajeError,
  id,
  accionFinal,
  className,
  ...resto
}: PropiedadesCampoTexto) {
  const idGenerado = useId();
  const idCampo = id ?? idGenerado;
  const idAyuda = `${idCampo}-ayuda`;
  const idError = `${idCampo}-error`;
  const hayError = Boolean(mensajeError);
  const describedBy = hayError ? idError : ayuda ? idAyuda : undefined;

  return (
    <div className={[estilos.campo, className ?? ""].filter(Boolean).join(" ")}>
      <label
        htmlFor={idCampo}
        className={[estilos.etiqueta, resto.disabled ? estilos.etiquetaDeshabilitada : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {etiqueta}
      </label>
      <div
        className={estilos.control}
        data-error={hayError || undefined}
        data-deshabilitado={resto.disabled || undefined}
        data-solo-lectura={resto.readOnly || undefined}
      >
        <input
          {...resto}
          id={idCampo}
          className={estilos.entrada}
          aria-invalid={hayError || undefined}
          aria-describedby={describedBy}
        />
        {accionFinal}
      </div>
      {hayError ? (
        <div id={idError} className={estilos.mensajeError}>
          <IconoError tamano={16} className={estilos.iconoError} />
          <p className={estilos.textoError}>{mensajeError}</p>
        </div>
      ) : (
        ayuda && (
          <p
            id={idAyuda}
            className={[estilos.ayuda, resto.disabled ? estilos.ayudaDeshabilitada : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}
