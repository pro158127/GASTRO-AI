// Componente «Diálogo de confirmación» del sistema de diseño (Figma 14:602; celular M-D01; RNF-08).
// alertdialog modal: el foco empieza en el botón marcado como inicial (la acción segura), queda
// atrapado, Esc equivale a «cancelar» y al cerrar vuelve a donde estaba (useAtraparFoco). Tocar
// fuera no hace nada.
//
// El foco inicial está SIEMPRE en «Cancelar», también cuando confirmar se dibuja como primario
// (`confirmarEsPrimario`): así Enter significa lo mismo en todos los diálogos de la aplicación.
// La jerarquía visual y el foco son dos decisiones distintas.
import { useId, useRef } from "react";
import Boton from "./Boton";
import { useAtraparFoco } from "../disposicion/useAtraparFoco";
import estilos from "./DialogoConfirmacion.module.css";

interface PropiedadesDialogoConfirmacion {
  /** Pregunta con el objeto concreto («¿Descartar los cambios?»). */
  titulo: string;
  /** Consecuencia de confirmar. */
  mensaje: string;
  /** Verbo específico de la acción (nunca «Aceptar»). */
  etiquetaConfirmar: string;
  /** Acción segura: tiene el foco inicial; también la ejecuta Esc. */
  etiquetaCancelar: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  /**
   * Solo jerarquía visual. Por omisión confirmar es secundario y cancelar primario (diálogos
   * destructivos o de descarte, como D-11). Con `true`, confirmar pasa a primario y cancelar a
   * secundario, como dibuja D-06. **No cambia dónde empieza el foco.**
   */
  confirmarEsPrimario?: boolean;
  /**
   * La acción está en curso: confirmar muestra el indicador y la etiqueta en gerundio, cancelar
   * queda no disponible (sin perder el foco) y Esc no cierra.
   */
  enviando?: boolean;
  /** Etiqueta en gerundio mientras `enviando` («Enviando…»). */
  etiquetaEnviando?: string;
}

export default function DialogoConfirmacion({
  titulo,
  mensaje,
  etiquetaConfirmar,
  etiquetaCancelar,
  onConfirmar,
  onCancelar,
  confirmarEsPrimario = false,
  enviando = false,
  etiquetaEnviando,
}: PropiedadesDialogoConfirmacion) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idMensaje = useId();
  // Mientras se envía, Esc no cierra: la petición ya salió y cerrar dejaría la pantalla mintiendo.
  useAtraparFoco(dialogoRef, () => {
    if (!enviando) onCancelar();
  });

  const confirmar = (
    <Boton
      key="confirmar"
      jerarquia={confirmarEsPrimario ? "primario" : "secundario"}
      cargando={enviando}
      etiquetaCargando={etiquetaEnviando}
      onClick={onConfirmar}
    >
      {etiquetaConfirmar}
    </Boton>
  );

  // aria-disabled y no `disabled`: el botón conserva el foco, que es donde empieza.
  const cancelar = (
    <Boton
      key="cancelar"
      jerarquia={confirmarEsPrimario ? "secundario" : "primario"}
      aria-disabled={enviando || undefined}
      onClick={onCancelar}
      data-foco-inicial=""
    >
      {etiquetaCancelar}
    </Boton>
  );

  return (
    <div className={estilos.capa}>
      <div
        ref={dialogoRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idMensaje}
        aria-busy={enviando || undefined}
        className={estilos.dialogo}
      >
        <h2 id={idTitulo} className={estilos.titulo}>
          {titulo}
        </h2>
        <p id={idMensaje} className={estilos.mensaje}>
          {mensaje}
        </p>
        {/* El botón primario va a la derecha en los dos casos, y el orden del DOM es el visual
            para que el recorrido con Tab coincida con lo que se ve (WCAG 2.4.3). */}
        <div className={estilos.acciones}>{confirmarEsPrimario ? [cancelar, confirmar] : [confirmar, cancelar]}</div>
      </div>
    </div>
  );
}
