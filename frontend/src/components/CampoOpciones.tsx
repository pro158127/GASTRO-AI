// Grupo de opciones excluyentes (radios) del sistema de diseño. Lo dibuja W-10 para el Rol
// (Figma 48:1132, «Rol (grupo de opciones)»): no es una lista desplegable.
//
// Tiene la misma forma que CampoTexto (13:705): etiqueta visible y persistente, ayuda, mensaje de
// error con icono y `aria-describedby` apuntando a uno u otro. La navegación entre opciones es la
// nativa del grupo de radios (flechas), sin JavaScript propio.
import { useId } from "react";
import IconoError from "./iconos/IconoError";
import estilos from "./CampoOpciones.module.css";

export interface Opcion {
  valor: string;
  etiqueta: string;
}

interface PropiedadesCampoOpciones {
  /** Etiqueta visible y persistente del grupo (va en el `legend`). */
  etiqueta: string;
  /** Nombre del grupo de radios; debe ser único dentro del formulario. */
  nombre: string;
  /**
   * Base de los identificadores. Cada opción queda en `${id}-${valor}`, para poder llevarle el
   * foco desde fuera (por ejemplo, al primer campo con error).
   */
  id?: string;
  opciones: readonly Opcion[];
  valor: string;
  onCambio: (valor: string) => void;
  ayuda?: string;
  /** Si existe, el grupo pasa al estado «Error» (icono + texto) y no se pierde la selección. */
  mensajeError?: string;
  /**
   * Deshabilita todas las opciones. Los radios no admiten `readonly`, así que este es el único
   * modo de bloquearlos (a diferencia de CampoTexto, que sí usa `readOnly`).
   */
  disabled?: boolean;
}

export default function CampoOpciones({
  etiqueta,
  nombre,
  id,
  opciones,
  valor,
  onCambio,
  ayuda,
  mensajeError,
  disabled = false,
}: PropiedadesCampoOpciones) {
  const idGenerado = useId();
  const idBase = id ?? idGenerado;
  const idAyuda = `${idBase}-ayuda`;
  const idError = `${idBase}-error`;
  const hayError = Boolean(mensajeError);
  const describedBy = hayError ? idError : ayuda ? idAyuda : undefined;

  return (
    <fieldset className={estilos.campo} aria-describedby={describedBy}>
      <legend
        className={[estilos.etiqueta, disabled ? estilos.etiquetaDeshabilitada : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {etiqueta}
      </legend>
      <div className={estilos.opciones}>
        {opciones.map((opcion) => {
          const idOpcion = `${idBase}-${opcion.valor}`;
          const seleccionada = opcion.valor === valor;
          return (
            <div
              key={opcion.valor}
              className={estilos.opcion}
              data-seleccionada={seleccionada || undefined}
              data-error={hayError || undefined}
              data-deshabilitada={disabled || undefined}
            >
              <input
                type="radio"
                id={idOpcion}
                name={nombre}
                value={opcion.valor}
                checked={seleccionada}
                disabled={disabled}
                aria-invalid={hayError || undefined}
                className={estilos.radio}
                onChange={() => onCambio(opcion.valor)}
              />
              <label htmlFor={idOpcion} className={estilos.textoOpcion}>
                {opcion.etiqueta}
              </label>
            </div>
          );
        })}
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
            className={[estilos.ayuda, disabled ? estilos.ayudaDeshabilitada : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {ayuda}
          </p>
        )
      )}
    </fieldset>
  );
}
