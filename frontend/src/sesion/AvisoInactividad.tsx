// Pantalla W-05 · Aviso de inactividad (Figma 45:623, diálogo 45:681; RF-U10 CA 3–5, WCAG 2.2.1).
// Aparece en el aviso que marca el servidor (`aviso_en_s`) y cuenta hasta el cierre (`cierre_en_s`).
// Es un alertdialog modal: el foco empieza en «Seguir conectado», queda atrapado y vuelve a donde
// estaba al cerrar. Esc equivale a «Seguir conectado». Tocar fuera no hace nada.
//
// El texto visible cambia cada segundo pero no es una región viva (saturaría el lector de
// pantalla): se lee completo al abrir (aria-describedby) y la región oculta solo anuncia los
// 30 y los 10 segundos.
import { useId, useRef } from "react";
import Boton from "../components/Boton";
import { useAtraparFoco } from "../disposicion/useAtraparFoco";
import estilos from "./AvisoInactividad.module.css";

/** Momentos en que el lector de pantalla anuncia el tiempo que queda (de mayor a menor). */
const ANUNCIOS_S = [30, 10];

interface PropiedadesAvisoInactividad {
  /** Segundos que faltan para el cierre. */
  segundos: number;
  /** POST /auth/sesion/continuar en curso. */
  continuando: boolean;
  onSeguirConectado: () => void;
  onCerrarSesion: () => void;
}

function textoSegundos(segundos: number): string {
  return segundos === 1 ? "1 segundo" : `${segundos} segundos`;
}

export default function AvisoInactividad({
  segundos,
  continuando,
  onSeguirConectado,
  onCerrarSesion,
}: PropiedadesAvisoInactividad) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idMensaje = useId();
  useAtraparFoco(dialogoRef, onSeguirConectado);

  const umbral = ANUNCIOS_S.filter((s) => segundos <= s).pop();
  const anuncio = umbral === undefined ? "" : `Quedan ${textoSegundos(umbral)} para que se cierre la sesión.`;

  return (
    // La capa cubre la pantalla; tocarla no hace nada (solo actúan los botones y Esc).
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
          ¿Sigue ahí?
        </h2>
        <p id={idMensaje} className={estilos.mensaje}>
          Por seguridad, su sesión se cerrará en {textoSegundos(segundos)} por inactividad. Lo que no
          haya guardado se perderá.
        </p>
        <p role="status" className={estilos.soloLector}>
          {anuncio}
        </p>
        <div className={estilos.acciones}>
          <Boton jerarquia="secundario" onClick={onCerrarSesion}>
            Cerrar sesión
          </Boton>
          <Boton
            jerarquia="primario"
            cargando={continuando}
            etiquetaCargando="Conectando…"
            onClick={onSeguirConectado}
            data-foco-inicial=""
          >
            Seguir conectado
          </Boton>
        </div>
      </div>
    </div>
  );
}
