// Área de texto de varias líneas, con la misma forma que «Campo de texto» (Figma 13:705):
// etiqueta visible y persistente, ayuda, y estado de error con icono y texto. Es la variante
// del sistema de diseño que faltaba; la dibuja W-08 en «Observación profesional».
//
// **No lleva `maxLength`.** Truncaría en silencio un texto pegado y la persona perdería lo
// que escribió sin enterarse. El proyecto ya tomó esta decisión en `CampoCodigo.tsx` por el
// mismo motivo. En su lugar, quien usa el campo le pasa `maximo`: el contador avisa, al
// pasarse el campo entra en error con un texto que dice cuánto sobra, **lo escrito se
// conserva** y es quien llama el que bloquea el envío (CLAUDE.md § 5).
//
// El contador va en `aria-describedby`, no en una región viva: anunciarlo en cada tecla
// sería ruido. El lector lo lee al entrar al campo, y lo que sí se anuncia al pasarse es el
// mensaje de error.
import { useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import IconoError from "./iconos/IconoError";
import estilos from "./CampoAreaTexto.module.css";

const FORMATO_NUMERO = new Intl.NumberFormat("es-CO");

export interface PropiedadesCampoAreaTexto
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "maxLength"> {
  /** Etiqueta visible y persistente; el placeholder nunca la reemplaza. */
  etiqueta: string;
  ayuda?: string;
  /** Si existe, el campo pasa al estado «Error» (icono + texto) y no se borra lo escrito. */
  mensajeError?: string;
  id?: string;
  /** Máximo de caracteres. Con él aparece el contador «N / M». No trunca. */
  maximo?: number;
}

export default function CampoAreaTexto({
  etiqueta,
  ayuda,
  mensajeError,
  id,
  maximo,
  className,
  value,
  ...resto
}: PropiedadesCampoAreaTexto) {
  const idGenerado = useId();
  const idCampo = id ?? idGenerado;
  const idAyuda = `${idCampo}-ayuda`;
  const idError = `${idCampo}-error`;
  const idContador = `${idCampo}-contador`;

  const escrito = typeof value === "string" ? value.length : 0;
  const sobrepasado = maximo !== undefined && escrito > maximo;
  const hayError = Boolean(mensajeError);

  // El contador se describe siempre que exista; el error manda sobre la ayuda.
  const describedBy =
    [maximo !== undefined ? idContador : null, hayError ? idError : ayuda ? idAyuda : null]
      .filter(Boolean)
      .join(" ") || undefined;

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
        <textarea
          {...resto}
          value={value}
          id={idCampo}
          className={estilos.entrada}
          aria-invalid={hayError || undefined}
          aria-describedby={describedBy}
        />
      </div>

      <div className={estilos.pie}>
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
        {maximo !== undefined && (
          <p
            id={idContador}
            className={[estilos.contador, sobrepasado ? estilos.contadorExcedido : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {FORMATO_NUMERO.format(escrito)} / {FORMATO_NUMERO.format(maximo)}
          </p>
        )}
      </div>
    </div>
  );
}
