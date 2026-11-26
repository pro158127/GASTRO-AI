// Posición del elemento que ilumina un paso del recorrido (W-14x).
//
// Devuelve el rectángulo **en coordenadas de la ventana**, que es lo que necesita la capa del
// recorrido, posicionada con `position: fixed`.
//
// Devuelve `null` —y entonces el paso se dibuja centrado y sin anillo, igual que los pasos 1 y
// 5— en tres casos, y ninguno es un error:
//
// 1. El paso no ancla a nada (`ancla` es `null`).
// 2. El selector no encuentra nada: por ejemplo, en celular la barra lateral no se pinta, así
//    que los pasos 4, 7 y 8 no tienen a qué agarrarse.
// 3. Lo encuentra, pero su caja mide cero: oculto por CSS, o un elemento que no genera caja.
//
// La posición se recalcula al redimensionar la ventana, al cambiar el zoom (que también dispara
// `resize`), al desplazarse cualquier contenedor y cuando el propio elemento cambia de tamaño.
import { useEffect, useState } from "react";

/** Rectángulo del anillo, ya con el margen que lo separa del elemento. */
export interface RectanguloAncla {
  arriba: number;
  izquierda: number;
  ancho: number;
  alto: number;
}

/** El anillo rodea el elemento sin pegarse a él, como en los frames. */
const MARGEN = 4;

/** Cuánto se sigue midiendo tras cambiar de paso, mientras dura el desplazamiento suave. */
const MILISEGUNDOS_SEGUIMIENTO = 1000;

export function useAnclaRecorrido(ancla: string | null): RectanguloAncla | null {
  const [rectangulo, setRectangulo] = useState<RectanguloAncla | null>(null);

  useEffect(() => {
    if (ancla === null) {
      setRectangulo(null);
      return;
    }
    const encontrado = document.querySelector<HTMLElement>(ancla);
    if (encontrado === null) {
      setRectangulo(null);
      return;
    }
    // `medir` es una declaración hoisted: se copia a una constante ya estrechada.
    const elemento: HTMLElement = encontrado;

    function medir() {
      const caja = elemento.getBoundingClientRect();
      // Un elemento sin caja (oculto, o `display: contents`) no se puede iluminar.
      if (caja.width === 0 || caja.height === 0) {
        setRectangulo(null);
        return;
      }
      setRectangulo({
        arriba: caja.top - MARGEN,
        izquierda: caja.left - MARGEN,
        ancho: caja.width + MARGEN * 2,
        alto: caja.height + MARGEN * 2,
      });
    }

    // Un recorte sobre algo que no se ve es un agujero en medio de la nada: primero se trae.
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    elemento.scrollIntoView({ block: "center", inline: "nearest", behavior: reducido ? "auto" : "smooth" });
    medir();

    // Durante el desplazamiento suave la posición cambia en cada cuadro, y `scrollend` todavía
    // no está en todos los navegadores: se mide un segundo y se deja de seguir.
    const hasta = performance.now() + MILISEGUNDOS_SEGUIMIENTO;
    let cuadro = requestAnimationFrame(function seguir() {
      medir();
      if (performance.now() < hasta) cuadro = requestAnimationFrame(seguir);
    });

    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    window.addEventListener("resize", medir);
    // En captura, para enterarse también del desplazamiento de contenedores internos.
    window.addEventListener("scroll", medir, true);

    return () => {
      cancelAnimationFrame(cuadro);
      observador.disconnect();
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [ancla]);

  return rectangulo;
}
