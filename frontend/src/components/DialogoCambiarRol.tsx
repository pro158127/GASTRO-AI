// Diálogo D-04 · Cambiar rol (Figma 100:3379; RF-U08 CA 3). Es el diálogo de confirmación del
// sistema (14:602) con un campo dentro: la elección del rol nuevo se hace aquí mismo, no en la
// pantalla.
//
// Desviación anotada para diseño: Figma dibuja el rol como lista desplegable y aquí son opciones
// (radios). Es la misma elección, con las mismas dos opciones, que W-10 ya pinta como radios; un
// desplegable aquí y radios allá serían dos aspectos para el mismo dato dentro del mismo módulo.
// La lista desplegable del sistema de diseño (70:2295) se construirá cuando haga falta de verdad
// (bitácora, logs técnicos, destino de una reasignación).
//
// Accesibilidad: role="dialog" (no «alertdialog»: hay un campo que rellenar, no una alerta), foco
// atrapado y devuelto al botón que lo abrió, y Esc cancela mientras no se esté enviando.
import { useEffect, useId, useRef } from "react";
import Boton from "./Boton";
import CampoOpciones from "./CampoOpciones";
import type { Opcion } from "./CampoOpciones";
import { useAtraparFoco } from "../disposicion/useAtraparFoco";
import estilos from "./DialogoCambiarRol.module.css";

interface PropiedadesDialogoCambiarRol {
  /** Pregunta con el objeto concreto: «Cambiar el rol de Ana Pérez». */
  titulo: string;
  /** Consecuencia de confirmar. */
  mensaje: string;
  /** Etiqueta del grupo de opciones; D-04 usa «Nuevo rol». */
  etiquetaCampo: string;
  opciones: readonly Opcion[];
  valor: string;
  onCambio: (valor: string) => void;
  /** Explicación bajo el campo, por ejemplo por qué una opción no está disponible. */
  ayuda?: string;
  /** Error del campo (por ejemplo, el 409 del servidor sobre la opción elegida). */
  mensajeError?: string;
  /**
   * Si es `false`, confirmar no está disponible: no se ha elegido nada todavía o lo elegido no
   * cambia nada. El diálogo se abre sin ninguna opción marcada a propósito, para que confirmar
   * nunca sea un cambio que el usuario no eligió.
   */
  puedeConfirmar?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  /** La petición está en curso: confirmar muestra el indicador, cancelar queda inerte y Esc no cierra. */
  enviando?: boolean;
}

export default function DialogoCambiarRol({
  titulo,
  mensaje,
  etiquetaCampo,
  opciones,
  valor,
  onCambio,
  ayuda,
  mensajeError,
  puedeConfirmar = true,
  onConfirmar,
  onCancelar,
  enviando = false,
}: PropiedadesDialogoCambiarRol) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idMensaje = useId();
  const idCampo = useId();
  // Mientras se envía, Esc no cierra: la petición ya salió y cerrar dejaría la pantalla mintiendo.
  useAtraparFoco(dialogoRef, () => {
    if (!enviando) onCancelar();
  });

  // Si hay una opción marcada, el foco inicial va a ella y no a la primera: `useAtraparFoco` lleva
  // el foco al primer elemento enfocable, y en un grupo de radios eso dejaría el anillo de foco en
  // una opción distinta de la seleccionada (dos señales contradictorias, y la barra espaciadora
  // cambiaría el rol sin querer). Este efecto corre después del de `useAtraparFoco`, así que es el
  // que manda.
  //
  // Cuando no hay ninguna marcada, que es como se abre el diálogo, `:checked` no encuentra nada y
  // aquí no pasa nada: el foco se queda donde lo dejó `useAtraparFoco`, en el primer radio, que es
  // justo el comportamiento nativo de un grupo sin selección. El diálogo nunca queda sin foco.
  //
  // Si algún día otro diálogo lleva radios, esta regla debería subir a `useAtraparFoco`, que es
  // donde vive la convención del foco inicial.
  useEffect(() => {
    dialogoRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
  }, []);

  return (
    <div className={estilos.capa}>
      <div
        ref={dialogoRef}
        role="dialog"
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
        <CampoOpciones
          id={idCampo}
          nombre={`${idCampo}-rol`}
          etiqueta={etiquetaCampo}
          opciones={opciones}
          valor={valor}
          onCambio={onCambio}
          ayuda={ayuda}
          mensajeError={mensajeError}
          disabled={enviando}
        />
        {/* El primario va a la derecha y el orden del DOM es el visual, para que Tab coincida
            con lo que se ve (WCAG 2.4.3). */}
        <div className={estilos.acciones}>
          {/* aria-disabled y no `disabled`: el botón conserva el foco mientras se envía. */}
          <Boton jerarquia="secundario" aria-disabled={enviando || undefined} onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton
            cargando={enviando}
            etiquetaCargando="Cambiando rol…"
            aria-disabled={!puedeConfirmar || undefined}
            onClick={onConfirmar}
          >
            Cambiar rol
          </Boton>
        </div>
      </div>
    </div>
  );
}
