// Pestañas del sistema de diseño, como las dibuja W-16 («Mis análisis» / «Buscar por
// paciente»). Sigue el patrón «tabs» de WAI-ARIA:
//
// - `role="tablist"` con nombre, cada pestaña `role="tab"` con `aria-selected` y
//   `aria-controls`, y el panel `role="tabpanel"` con `aria-labelledby`.
// - **Foco móvil** (roving tabindex): solo la pestaña activa es tabulable, y dentro del
//   grupo se cambia con ← → Inicio Fin. Así un Tab entra y sale del grupo de una vez, en
//   lugar de recorrer una pestaña por pulsación.
// - Activación automática: moverse con las flechas cambia de pestaña. Es lo correcto cuando
//   el panel ya está en la página y no cuesta nada mostrarlo.
//
// Quien lo usa decide dónde vive el estado; aquí no se guarda nada. En W-16 vive en la
// query string, para que volver del detalle con «atrás» caiga en la pestaña correcta.
import { useRef } from "react";
import type { KeyboardEvent } from "react";
import estilos from "./Pestanas.module.css";

export interface Pestana {
  /** Identificador estable; en W-16 es también el valor de `?pestana=`. */
  id: string;
  etiqueta: string;
}

interface PropiedadesPestanas {
  /** Nombre del grupo para el lector de pantalla («Secciones del historial»). */
  etiqueta: string;
  pestanas: readonly Pestana[];
  activa: string;
  onCambio: (id: string) => void;
  /** Base de los identificadores, para enlazar cada pestaña con su panel. */
  idBase: string;
}

export function idDePestana(idBase: string, id: string): string {
  return `${idBase}-pestana-${id}`;
}

/**
 * Un **único** panel para todas las pestañas, y por eso no lleva el id de ninguna: solo se
 * monta el de la pestaña activa, así que si cada pestaña apuntara con `aria-controls` a un
 * panel propio, las inactivas señalarían a un elemento que no existe. El patrón admite un
 * panel compartido mientras `aria-labelledby` diga cuál es la pestaña que lo titula.
 */
export function idDePanel(idBase: string): string {
  return `${idBase}-panel`;
}

export default function Pestanas({
  etiqueta,
  pestanas,
  activa,
  onCambio,
  idBase,
}: PropiedadesPestanas) {
  const listaRef = useRef<HTMLDivElement>(null);

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    const indice = pestanas.findIndex((p) => p.id === activa);
    if (indice === -1) return;

    let destino: number | null = null;
    if (evento.key === "ArrowRight") destino = (indice + 1) % pestanas.length;
    else if (evento.key === "ArrowLeft") destino = (indice - 1 + pestanas.length) % pestanas.length;
    else if (evento.key === "Home") destino = 0;
    else if (evento.key === "End") destino = pestanas.length - 1;
    if (destino === null) return;

    evento.preventDefault();
    const siguiente = pestanas[destino];
    onCambio(siguiente.id);
    // El foco sigue a la selección: si se quedara atrás, la pestaña activa y la enfocada
    // serían distintas y el lector anunciaría una y actuaría sobre la otra.
    listaRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(idDePestana(idBase, siguiente.id))}`)
      ?.focus();
  }

  return (
    <div
      ref={listaRef}
      role="tablist"
      aria-label={etiqueta}
      className={estilos.lista}
      onKeyDown={alTeclear}
    >
      {pestanas.map((pestana) => {
        const seleccionada = pestana.id === activa;
        return (
          <button
            key={pestana.id}
            type="button"
            role="tab"
            id={idDePestana(idBase, pestana.id)}
            aria-selected={seleccionada}
            aria-controls={idDePanel(idBase)}
            // Roving tabindex: fuera del grupo, Tab solo encuentra la pestaña activa.
            tabIndex={seleccionada ? 0 : -1}
            className={estilos.pestana}
            data-activa={seleccionada || undefined}
            onClick={() => onCambio(pestana.id)}
          >
            {pestana.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
