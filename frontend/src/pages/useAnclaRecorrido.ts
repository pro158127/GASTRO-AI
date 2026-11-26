// Posición del elemento que ilumina un paso del recorrido (W-14x del doctor, W-19e a W-19p del
// administrador). No sabe de roles: recibe un selector y devuelve un rectángulo.
//
// Devuelve el rectángulo **en coordenadas de la ventana**, que es lo que necesita la capa del
// recorrido, posicionada con `position: fixed`.
//
// **El selector puede encontrar varias copias, y solo una está a la vista.** El mismo
// `nav[aria-label="Principal"]` lo usan la barra lateral (`BarraLateral.tsx:22`) y el panel del
// menú de celular (`PanelMenuMovil.tsx`), y la barra lateral **sigue montada** por debajo de
// 768 px, solo con `display: none` (`BarraLateral.module.css:76-80`). Por eso se recorren todas
// las coincidencias y se usa **la primera que tenga caja**, en vez de `querySelector`, que
// devolvía siempre la primera del DOM —la oculta— y dejaba todos los pasos de menú sin anillo en
// celular.
//
// Devuelve `null` —y entonces el paso se dibuja sin anillo, centrado en escritorio y en el panel
// de abajo en celular— en dos casos, y ninguno es un error:
//
// 1. El paso no ancla a nada (`ancla` es `null`): la bienvenida y, en el doctor, el paso 5.
// 2. Ninguna de las copias tiene caja: todas ocultas por CSS, o elementos que no generan caja.
//
// «Tener caja» es una medida de `getBoundingClientRect`, no visibilidad real: no distingue un
// elemento tapado por otro ni uno con `opacity: 0`. Alcanza porque las dos copias nunca están
// visibles a la vez —la barra lateral se oculta por debajo de 768 px y el panel del menú no se
// monta por encima (`DisposicionInterna.tsx`)—, pero si algún día lo estuvieran, elegiría la
// primera del DOM.
//
// La dependencia del efecto es **el selector**, no el índice del paso, y React la compara por
// valor: dos pasos seguidos que anclen al mismo elemento con la misma cadena (los pasos 4 y 5 del
// administrador, los dos sobre «Usuarios») no vuelven a ejecutar el efecto, así que no hay
// `scrollIntoView` nuevo ni parpadeo del anillo. No conviene «limpiar» uno de esos dos selectores
// para que dejen de ser idénticos.
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

const CELULAR = "(max-width: 767px)";

/**
 * La primera copia del selector que tenga caja, o `null`. Se resuelve **en cada medición** y no
 * una sola vez al entrar al paso: al cambiar de tamaño, la copia visible pasa a ser otra (la
 * barra lateral o el panel del menú) y guardar la de antes dejaría el anillo midiendo un elemento
 * que ya está oculto.
 */
function primeraConCaja(selector: string): { elemento: HTMLElement; caja: DOMRect } | null {
  for (const elemento of document.querySelectorAll<HTMLElement>(selector)) {
    const caja = elemento.getBoundingClientRect();
    if (caja.width > 0 && caja.height > 0) return { elemento, caja };
  }
  return null;
}

export function useAnclaRecorrido(ancla: string | null): RectanguloAncla | null {
  const [rectangulo, setRectangulo] = useState<RectanguloAncla | null>(null);

  useEffect(() => {
    if (ancla === null) {
      setRectangulo(null);
      return;
    }
    // `medir` es una declaración hoisted y no estrecha el tipo de `ancla`: se copia a una
    // constante ya estrechada.
    const selector: string = ancla;

    function medir() {
      const encontrado = primeraConCaja(selector);
      // Ninguna copia a la vista: no se puede iluminar nada.
      if (encontrado === null) {
        setRectangulo(null);
        return;
      }
      const { caja } = encontrado;
      setRectangulo({
        arriba: caja.top - MARGEN,
        izquierda: caja.left - MARGEN,
        ancho: caja.width + MARGEN * 2,
        alto: caja.height + MARGEN * 2,
      });
    }

    // Un recorte sobre algo que no se ve es un agujero en medio de la nada: primero se trae.
    //
    // En celular, al principio de la ventana y no al centro: la tarjeta del recorrido ocupa la
    // parte de abajo (unos 358 px de los 844 del frame), así que una zona centrada puede quedar
    // debajo de ella. Es donde la dibujan M-14e (127:4852) y M-19i (130:8560), justo bajo la
    // barra superior, que no es `sticky` y por eso no hay nada que compensar. En tableta y
    // escritorio sigue siendo `center`, como hasta ahora.
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alPrincipio = window.matchMedia(CELULAR).matches;
    const elemento = primeraConCaja(selector)?.elemento;
    elemento?.scrollIntoView({
      block: alPrincipio ? "start" : "center",
      inline: "nearest",
      behavior: reducido ? "auto" : "smooth",
    });
    medir();

    // Durante el desplazamiento suave la posición cambia en cada cuadro, y `scrollend` todavía
    // no está en todos los navegadores: se mide un segundo y se deja de seguir.
    const hasta = performance.now() + MILISEGUNDOS_SEGUIMIENTO;
    let cuadro = requestAnimationFrame(function seguir() {
      medir();
      if (performance.now() < hasta) cuadro = requestAnimationFrame(seguir);
    });

    // Observa la copia que estaba a la vista al entrar al paso. Si no había ninguna, no hay nada
    // que observar: el paso ya se dibujó sin anillo y `resize` y `scroll` siguen midiendo.
    const observador = new ResizeObserver(medir);
    if (elemento) observador.observe(elemento);
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
