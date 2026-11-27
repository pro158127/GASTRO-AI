// Recorrido guiado de TOPOLOGO. **Sirve a los dos roles**: el del doctor (W-13 y W-14b…W-14h,
// 9 pasos, sobre el dashboard clínico) y el del administrador (W-19e a W-19p, 12 pasos, sobre el
// dashboard técnico). Por eso ya no se llama `RecorridoDoctor`: lo único que cambia entre los
// dos es la lista de `pasos`, que llega por propiedad.
//
// Ningún recorrido navega entre rutas: todos sus pasos ocurren sobre la pantalla que lo monta.
// Se lanza desde «Ver recorrido» en Mi perfil (W-18 / W-18f), que navega a /dashboard con el
// estado de navegación `{ recorrido: true }`, y también arranca solo en el primer ingreso,
// cuando el dashboard ya tiene datos en pantalla. Las dos puertas de entrada están en
// `useRecorridoGuiado.ts` (ver también `recorridoVisto.ts`).
//
// Los pasos no son un componente cada uno: este es el único, y los pasos son datos
// (`pasosRecorridoDoctor.ts`, `pasosRecorridoAdministrador.ts`).
//
// Accesibilidad:
//
// - Es un `role="dialog"` `aria-modal` que se queda montado todos los pasos. Su nombre accesible
//   son **dos** nodos, «Paso N de M» y el título, para que el número le llegue también a quien
//   no ve la tarjeta.
// - Al cambiar de paso el contenido cambia dentro del mismo diálogo, y eso no se anuncia solo:
//   el foco vuelve al `<h2>`, y al enfocar dentro del diálogo el lector lee su nombre (paso y
//   título) y el contenido. Es el mismo recurso que usa `DisposicionInterna.tsx:54-57` al
//   cambiar de pantalla. **No hay ninguna región `role="status"`**: diría exactamente lo mismo
//   un instante después, y nueve o doce veces seguidas sobra. Tampoco hay `aria-busy` en ningún
//   nodo de la capa.
// - `useAtraparFoco` atrapa el tabulador y hace que Esc omita el recorrido, que es la salida que
//   ofrece el propio diseño. En celular no hay tecla Esc, y por eso «Omitir recorrido» está
//   siempre a la vista en el panel (nota de reglas 132:8705).
// - La mascota es decorativa (`alt=""`).
//
// `aria-modal="true"` deja **inerte todo lo que está fuera de la tarjeta**, también para la
// navegación virtual de un lector de pantalla. Eso incluye el ítem que el paso está resaltando:
// en celular, el del panel del menú que el recorrido abre. No es una regresión ni algo propio del
// celular: en escritorio pasa exactamente lo mismo con la barra lateral y con la barra superior,
// y el texto de cada paso nombra el ítem del que habla.
//
// En celular, además, el recorrido **abre y cierra el menú ☰** en los pasos que lo necesitan (ver
// `TipoPaso` y `necesitaMenu`), por el contexto `ContextoMenuMovil`.
//
// Lo iluminado no es pulsable: la capa cubre toda la ventana y captura los clics; el hueco está
// **pintado, no recortado** (es la sombra de un `div`, no un agujero), así que ese `div` sigue
// capturando el clic y nada llega al elemento de debajo.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import mascota from "../assets/mascota-topologo.svg";
import Boton from "../components/Boton";
import { useMenuMovil } from "../disposicion/ContextoMenuMovil";
import { useAtraparFoco } from "../disposicion/useAtraparFoco";
import { marcarRecorridoVisto } from "./recorridoVisto";
import { useAnclaRecorrido } from "./useAnclaRecorrido";
import estilos from "./RecorridoGuiado.module.css";

/**
 * Los cuatro tipos de paso que define Figma (nota de reglas 132:8705). El tipo no cambia nada en
 * escritorio ni en tableta: **en celular decide si el menú ☰ tiene que estar abierto**, porque los
 * pasos que hablan de un módulo o de la cuenta resaltan un ítem que solo existe con el menú
 * abierto (M-14g, M-14h, M-19f, M-19p). La regla se cumple en las 21 filas de la tabla 132:8706.
 */
export type TipoPaso = "sin-zona" | "zona" | "item-menu" | "cuenta";

/**
 * Un paso del recorrido. El tipo vive aquí, con el componente que lo consume, y no en un archivo
 * propio: los dos archivos de pasos lo importan de aquí.
 */
export interface PasoRecorrido {
  /** Identificador estable, para las claves de React y para depurar. */
  clave: string;
  titulo: string;
  texto: string;
  tipo: TipoPaso;
  /** Selector del elemento que se ilumina, o `null` si el paso no ilumina nada. */
  ancla: string | null;
  /**
   * Solo para los tres pasos en que Figma resalta **otro** elemento en celular, no el mismo en
   * otro sitio. Si no se indica, en celular se usa `ancla`: la ambigüedad entre la barra lateral
   * oculta y el panel del menú la resuelve `useAnclaRecorrido`, no una ancla duplicada.
   */
  anclaCelular?: string;
}

/** El menú ☰ solo hace falta en estos dos tipos. */
export function necesitaMenu(paso: PasoRecorrido): boolean {
  return paso.tipo === "item-menu" || paso.tipo === "cuenta";
}

/** Separación entre el elemento iluminado y la tarjeta, y margen mínimo con el borde. */
const SEPARACION = 12;
const MARGEN_VENTANA = 16;

const CELULAR = "(max-width: 767px)";

interface PropiedadesRecorridoGuiado {
  /** Los pasos del rol que lo abre, en orden. «Paso N de M» sale de su longitud. */
  pasos: PasoRecorrido[];
  /** Se llama al terminar, al omitir y con Esc. Quien llama devuelve el foco a la pantalla. */
  alCerrar: () => void;
}

export default function RecorridoGuiado({ pasos, alCerrar }: PropiedadesRecorridoGuiado) {
  const [indice, setIndice] = useState(0);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const idPaso = useId();
  const idTitulo = useId();

  const paso = pasos[indice];
  const total = pasos.length;
  const esUltimo = indice === total - 1;

  // En celular la tarjeta no flota junto al elemento: se ancla al pie de la ventana (CSS). Sin
  // esta condición el estilo en línea ganaría a la media query.
  const [esCelular, setEsCelular] = useState(() => window.matchMedia(CELULAR).matches);
  useEffect(() => {
    const consulta = window.matchMedia(CELULAR);
    const alCambiar = () => setEsCelular(consulta.matches);
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, []);

  const { pedirMenuDelRecorrido } = useMenuMovil();
  const rectangulo = useAnclaRecorrido(esCelular ? (paso.anclaCelular ?? paso.ancla) : paso.ancla);

  /**
   * Cambia de paso **y pide el menú en el mismo manejador**, no en un efecto posterior.
   *
   * Si la petición del menú fuera a un efecto, habría un commit intermedio en el que el ancla ya
   * es la del ítem del menú pero el panel todavía no está montado: `useAnclaRecorrido` no
   * encontraría ninguna copia con caja, devolvería `null` y la tarjeta se dibujaría **sin anillo y
   * en su posición sin anclar** durante un cuadro, antes de saltar a su sitio. No es un parpadeo
   * del anillo: es la tarjeta entera cambiando de disposición. Al hacer las dos actualizaciones
   * en el mismo manejador, React las agrupa en un solo commit y el efecto que mide ya encuentra
   * el panel en el DOM.
   */
  function irAlPaso(siguiente: number) {
    const destino = pasos[siguiente];
    if (esCelular && destino) pedirMenuDelRecorrido(necesitaMenu(destino));
    setIndice(siguiente);
  }

  function cerrar() {
    // El panel se suelta **antes** de desmontar el recorrido, y en el mismo manejador: el último
    // paso de los dos roles es un paso de menú («Su cuenta»), así que al pulsar «Terminar» —y al
    // omitir el recorrido desde cualquier paso de menú— el panel se quedaría abierto, y en modo
    // controlado no tiene foco atrapado, ni Esc, ni cierre al tocar fuera: quedaría encallado.
    // Al ir las dos cosas en el mismo commit, el panel desaparece junto con la capa del
    // recorrido, y el foco que `Dashboard`/`DashboardTecnico` devuelven al <h1> de la pantalla
    // no queda detrás de nada.
    pedirMenuDelRecorrido(false);
    // Ya se llama hoy, aunque todavía no haga nada: el día del endpoint no hay que buscar dónde.
    void marcarRecorridoVisto();
    alCerrar();
  }

  // Respaldo del manejador, para los dos caminos que no pasan por él: el primer paso (que hoy es
  // «sin zona» en los dos roles, así que no pide menú) y un cambio de tamaño en mitad de un paso
  // de menú, cuando la persona gira el teléfono o agranda la ventana. Volver a pedir el mismo
  // valor no produce ningún render: React descarta un `setState` con el valor que ya tenía, así
  // que en el camino normal este efecto no hace nada y el único que manda es `irAlPaso`.
  //
  // **Sin función de limpieza a propósito:** una limpieza aquí correría en cada cambio de paso y
  // soltaría el menú que `irAlPaso` acaba de pedir. El soltar al desmontar va en su propio efecto.
  useEffect(() => {
    pedirMenuDelRecorrido(esCelular && necesitaMenu(paso));
  }, [esCelular, paso, pedirMenuDelRecorrido]);

  // Soltar el menú al desmontarse, para el camino que no pasa por `cerrar`: que la pantalla
  // desmonte el recorrido por su cuenta (una navegación, un cierre de sesión por inactividad).
  // Sin esto el panel se quedaría abierto sin nadie que lo cierre.
  useEffect(() => () => pedirMenuDelRecorrido(false), [pedirMenuDelRecorrido]);

  useAtraparFoco(tarjetaRef, cerrar);

  // El foco vuelve al título en cada paso: es lo que hace que el cambio se anuncie.
  useEffect(() => {
    tituloRef.current?.focus();
  }, [indice]);

  // Posición de la tarjeta: debajo del elemento iluminado y, si no cabe, encima; siempre dentro
  // de la ventana. Se mide la tarjeta ya pintada, porque su alto depende del texto del paso.
  const [posicion, setPosicion] = useState<{ arriba: number; izquierda: number } | null>(null);
  useLayoutEffect(() => {
    const tarjeta = tarjetaRef.current;
    if (esCelular || rectangulo === null || tarjeta === null) {
      setPosicion(null);
      return;
    }
    const caja = tarjeta.getBoundingClientRect();

    let arriba = rectangulo.arriba + rectangulo.alto + SEPARACION;
    if (arriba + caja.height > window.innerHeight - MARGEN_VENTANA) {
      const encima = rectangulo.arriba - SEPARACION - caja.height;
      arriba =
        encima >= MARGEN_VENTANA
          ? encima
          : Math.max(MARGEN_VENTANA, window.innerHeight - MARGEN_VENTANA - caja.height);
    }

    const maximaIzquierda = Math.max(MARGEN_VENTANA, window.innerWidth - MARGEN_VENTANA - caja.width);
    const izquierda = Math.min(Math.max(MARGEN_VENTANA, rectangulo.izquierda), maximaIzquierda);

    setPosicion({ arriba, izquierda });
  }, [rectangulo, indice, esCelular]);

  const flotante = posicion !== null;
  const clases = [estilos.tarjeta, flotante ? estilos.flotante : estilos.centrada].join(" ");

  return (
    // La capa es TRANSPARENTE a propósito: su trabajo es capturar los clics. El oscurecimiento
    // lo hace solo la sombra del hueco (o el velo entero cuando el paso no ilumina nada); si la
    // capa tuviera fondo propio, oscurecería también el agujero y el resaltado no resaltaría.
    <div className={estilos.capa}>
      {rectangulo === null ? (
        <div className={estilos.velo} aria-hidden="true" />
      ) : (
        <div
          className={estilos.hueco}
          aria-hidden="true"
          style={{
            top: `${rectangulo.arriba}px`,
            left: `${rectangulo.izquierda}px`,
            width: `${rectangulo.ancho}px`,
            height: `${rectangulo.alto}px`,
          }}
        />
      )}

      <div
        ref={tarjetaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idPaso} ${idTitulo}`}
        className={clases}
        style={posicion === null ? undefined : { top: `${posicion.arriba}px`, left: `${posicion.izquierda}px` }}
      >
        <img src={mascota} alt="" className={estilos.mascota} />
        <div className={estilos.globo}>
          <p id={idPaso} className={estilos.paso}>
            Paso {indice + 1} de {total}
          </p>
          {/* `data-foco-inicial` es lo que busca useAtraparFoco al abrir. */}
          <h2 id={idTitulo} ref={tituloRef} tabIndex={-1} data-foco-inicial="" className={estilos.titulo}>
            {paso.titulo}
          </h2>
          <p className={estilos.texto}>{paso.texto}</p>
          <div className={estilos.acciones}>
            <Boton jerarquia="terciario" onClick={cerrar}>
              Omitir recorrido
            </Boton>
            <span className={estilos.espacio} />
            {/* «Anterior» y «Siguiente» van en una caja porque en celular son una fila propia
                debajo de «Omitir recorrido», al 50 % cada uno (M-13 127:7705, M-14h 127:8384).
                En tableta y escritorio la caja es `display: contents`: no genera caja y los tres
                botones vuelven a ser hermanos en la misma fila, exactamente como antes. Aquí sí
                se puede, al contrario que en las cajas con `data-recorrido`: a esta no la mide
                nadie. */}
            <div className={estilos.navegacion}>
              {indice > 0 && (
                <Boton jerarquia="secundario" onClick={() => irAlPaso(indice - 1)}>
                  Anterior
                </Boton>
              )}
              <Boton onClick={() => (esUltimo ? cerrar() : irAlPaso(indice + 1))}>
                {esUltimo ? "Terminar" : "Siguiente"}
              </Boton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
