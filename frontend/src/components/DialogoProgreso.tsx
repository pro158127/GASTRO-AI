// Diálogo de una acción en curso que no se puede interrumpir (Figma D-09, 100:4031: «Eliminando
// la cuenta de Andrés Vélez…»). No tiene botones a propósito: la petición ya salió y no hay nada
// que elegir hasta que el servidor responda. Por lo mismo, Esc no cierra: cerrar dejaría la
// pantalla mintiendo sobre lo que está pasando.
//
// Diferencias con `DialogoConfirmacion`, que son el motivo de que sea otro componente:
// - `role="dialog"`, no `alertdialog`: no pregunta nada.
// - Sin acciones, así que el foco inicial va al propio diálogo: lleva `tabIndex={-1}` para poder
//   recibirlo y `data-foco-inicial` para que `useAtraparFoco` sepa que es él (el hook acepta que
//   el marcado sea el panel mismo, justo por este caso). Tab no tiene a dónde ir y el mismo hook
//   lo deja quieto dentro. Que el foco entre aquí es lo que hace que un lector de pantalla
//   anuncie el título y el mensaje en vez de dejar al usuario en el botón del fondo.
// - `aria-busy="true"` mientras está abierto, y el avance se anuncia con `role="status"`.
//
// Quien lo abre es responsable de cerrarlo cuando la petición termine: aquí no hay salida.
//
// **Sin barra ni porcentaje.** Figma dibuja una línea de avance («Registros vinculados: 31 de
// 37»), pero el borrado del servidor es una sola llamada que no informa de su progreso (consulta
// U-7, resuelta). Inventar un número sería mentir, así que se dice lo que sí es cierto: que está
// en curso y que no se cierre la ventana.
import { useId, useRef } from "react";
import IndicadorCarga from "./iconos/IndicadorCarga";
import { useAtraparFoco } from "../disposicion/useAtraparFoco";
import estilos from "./DialogoProgreso.module.css";

interface PropiedadesDialogoProgreso {
  /** Qué está pasando, en gerundio y con el objeto concreto («Eliminando la cuenta de X…»). */
  titulo: string;
  /** Qué implica la espera («No cierre esta ventana»). */
  mensaje: string;
  /** Texto del avance, junto al indicador. Se anuncia con `role="status"`. */
  textoProgreso: string;
}

export default function DialogoProgreso({ titulo, mensaje, textoProgreso }: PropiedadesDialogoProgreso) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idMensaje = useId();
  // Esc no cierra: la acción ya está en marcha y no hay forma de cancelarla.
  useAtraparFoco(dialogoRef, () => {});

  return (
    <div className={estilos.capa}>
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idMensaje}
        aria-busy="true"
        tabIndex={-1}
        data-foco-inicial=""
        className={estilos.dialogo}
      >
        <h2 id={idTitulo} className={estilos.titulo}>
          {titulo}
        </h2>
        <p id={idMensaje} className={estilos.mensaje}>
          {mensaje}
        </p>
        <div className={estilos.progreso}>
          <IndicadorCarga className={estilos.indicador} />
          <p className={estilos.textoProgreso} role="status">
            {textoProgreso}
          </p>
        </div>
      </div>
    </div>
  );
}
