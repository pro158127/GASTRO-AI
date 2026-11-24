// Diálogo de aviso con un solo botón (Figma D-05, 100:3484, que es el componente «Diálogo de
// confirmación» 14:602 con una sola acción). Informa de algo que el usuario no puede cambiar
// desde aquí, así que no hay nada que confirmar ni que cancelar: solo enterarse y cerrar.
//
// Es un componente aparte de DialogoConfirmacion a propósito: aquel garantiza que el foco empieza
// siempre en la acción segura («Cancelar») y aquí no existe tal acción. Con un único botón, el
// foco empieza ahí y Esc equivale a cerrarlo.
import { useId, useRef } from "react";
import Boton from "./Boton";
import { useAtraparFoco } from "../disposicion/useAtraparFoco";
import estilos from "./DialogoAviso.module.css";

interface PropiedadesDialogoAviso {
  /** Qué pasó, en afirmativo («No se puede completar esta acción»). */
  titulo: string;
  /** Por qué pasó y qué puede hacer el usuario para resolverlo. */
  mensaje: string;
  /** Etiqueta del único botón; D-05 usa «Entendido». */
  etiquetaCerrar?: string;
  onCerrar: () => void;
}

export default function DialogoAviso({
  titulo,
  mensaje,
  etiquetaCerrar = "Entendido",
  onCerrar,
}: PropiedadesDialogoAviso) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idMensaje = useId();
  useAtraparFoco(dialogoRef, onCerrar);

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
          <Boton onClick={onCerrar}>{etiquetaCerrar}</Boton>
        </div>
      </div>
    </div>
  );
}
