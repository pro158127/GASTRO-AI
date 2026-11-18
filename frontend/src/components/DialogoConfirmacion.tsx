// Componente «Diálogo de confirmación» del sistema de diseño (Figma 14:602; celular M-D01; RNF-08).
// alertdialog modal: el foco empieza en el botón marcado como inicial (la acción segura), queda
// atrapado, Esc equivale a «cancelar» y al cerrar vuelve a donde estaba (useAtraparFoco). Tocar
// fuera no hace nada.
import { useId, useRef } from "react";
import Boton from "./Boton";
import { useAtraparFoco } from "../disposicion/useAtraparFoco";
import estilos from "./DialogoConfirmacion.module.css";

interface PropiedadesDialogoConfirmacion {
  /** Pregunta con el objeto concreto («¿Descartar los cambios?»). */
  titulo: string;
  /** Consecuencia de confirmar. */
  mensaje: string;
  /** Verbo específico de la acción (nunca «Aceptar»); botón secundario. */
  etiquetaConfirmar: string;
  /** Acción segura: botón principal con el foco inicial; también la ejecuta Esc. */
  etiquetaCancelar: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}

export default function DialogoConfirmacion({
  titulo,
  mensaje,
  etiquetaConfirmar,
  etiquetaCancelar,
  onConfirmar,
  onCancelar,
}: PropiedadesDialogoConfirmacion) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idMensaje = useId();
  useAtraparFoco(dialogoRef, onCancelar);

  return (
    <div className={estilos.capa}>
      <div
        ref={dialogoRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idMensaje}
        className={estilos.dialogo}
      >
        <h2 id={idTitulo} className={estilos.titulo}>
          {titulo}
        </h2>
        <p id={idMensaje} className={estilos.mensaje}>
          {mensaje}
        </p>
        <div className={estilos.acciones}>
          <Boton jerarquia="secundario" onClick={onConfirmar}>
            {etiquetaConfirmar}
          </Boton>
          <Boton jerarquia="primario" onClick={onCancelar} data-foco-inicial="">
            {etiquetaCancelar}
          </Boton>
        </div>
      </div>
    </div>
  );
}
