// Comportamiento de diálogo modal (menú del celular, aviso de inactividad W-05): lleva el foco
// al panel, lo mantiene dentro mientras está abierto (Tab y Mayús+Tab dan la vuelta), cierra con
// Esc y devuelve el foco al elemento que lo tenía antes de abrir cuando se cierra.
//
// El foco inicial va al elemento marcado con `data-foco-inicial` —que puede ser el panel mismo,
// si no tiene nada enfocable dentro— y, si no hay ninguno, al primero enfocable.
// Si hay dos diálogos abiertos (W-05 sobre el menú del celular), solo el último atiende el teclado.
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const SELECTOR_ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Diálogos abiertos, del más antiguo al más reciente. */
const pilaDialogos: symbol[] = [];

export function useAtraparFoco(panel: RefObject<HTMLElement>, alCerrar: () => void): void {
  // La función de cierre cambia en cada render; el listener usa siempre la última.
  const alCerrarRef = useRef(alCerrar);
  alCerrarRef.current = alCerrar;

  useEffect(() => {
    const contenedor = panel.current;
    if (!contenedor) return;
    const quienAbrio = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const enfocables = () => Array.from(contenedor.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES));
    // El propio panel cuenta como foco inicial: `querySelector` solo mira descendientes, y un
    // diálogo sin botones (D-09, mientras se elimina) no tiene a quién dárselo más que a sí
    // mismo. Sin esto el foco se quedaba en el botón del fondo y el lector de pantalla no
    // anunciaba nada de lo que estaba pasando.
    const marcado = contenedor.matches("[data-foco-inicial]")
      ? contenedor
      : contenedor.querySelector<HTMLElement>("[data-foco-inicial]");
    const inicial = marcado ?? enfocables()[0];
    inicial?.focus();

    const identificador = Symbol("dialogo");
    pilaDialogos.push(identificador);

    function alPulsarTecla(evento: KeyboardEvent) {
      if (pilaDialogos[pilaDialogos.length - 1] !== identificador) return;
      if (evento.key === "Escape") {
        evento.preventDefault();
        alCerrarRef.current();
        return;
      }
      if (evento.key !== "Tab") return;
      const lista = enfocables();
      if (lista.length === 0) {
        evento.preventDefault();
        return;
      }
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      const actual = document.activeElement;
      if (!contenedor!.contains(actual)) {
        evento.preventDefault();
        primero.focus();
      } else if (evento.shiftKey && actual === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && actual === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", alPulsarTecla);
    return () => {
      document.removeEventListener("keydown", alPulsarTecla);
      pilaDialogos.splice(pilaDialogos.indexOf(identificador), 1);
      // Si el cierre fue por navegar, DisposicionInterna lleva después el foco al título nuevo.
      quienAbrio?.focus();
    };
  }, [panel]);
}
