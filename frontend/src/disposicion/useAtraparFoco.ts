// Comportamiento de diálogo modal para el panel de navegación del celular: lleva el foco al
// panel, lo mantiene dentro mientras está abierto (Tab y Mayús+Tab dan la vuelta), cierra con Esc
// y devuelve el foco al elemento que abrió el diálogo cuando se cierra.
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const SELECTOR_ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useAtraparFoco(panel: RefObject<HTMLElement>, alCerrar: () => void): void {
  // La función de cierre cambia en cada render; el listener usa siempre la última.
  const alCerrarRef = useRef(alCerrar);
  alCerrarRef.current = alCerrar;

  useEffect(() => {
    const contenedor = panel.current;
    if (!contenedor) return;
    const quienAbrio = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const enfocables = () => Array.from(contenedor.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES));
    enfocables()[0]?.focus();

    function alPulsarTecla(evento: KeyboardEvent) {
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
      // Si el cierre fue por navegar, DisposicionInterna lleva después el foco al título nuevo.
      quienAbrio?.focus();
    };
  }, [panel]);
}
