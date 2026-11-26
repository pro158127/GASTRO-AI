// Pantallas W-13 y W-14b…W-14h · Recorrido guiado de TOPOLOGO del doctor (9 pasos).
//
// Los nueve pasos ocurren sobre el dashboard clínico: el recorrido no navega. Se lanza desde
// «Ver recorrido» en Mi perfil (W-18), que navega a /dashboard con el estado de navegación
// `{ recorrido: true }`, y también arranca solo en el primer ingreso, cuando el dashboard ya
// tiene datos en pantalla (ver `recorridoVisto.ts` y el efecto de `Dashboard.tsx`).
//
// Los nueve pasos no son nueve componentes: este es el único, y los pasos son datos
// (`pasosRecorridoDoctor.ts`).
//
// Accesibilidad:
//
// - Es un `role="dialog"` `aria-modal` que se queda montado los nueve pasos. Su nombre accesible
//   son **dos** nodos, «Paso N de 9» y el título, para que el número le llegue también a quien
//   no ve la tarjeta.
// - Al cambiar de paso el contenido cambia dentro del mismo diálogo, y eso no se anuncia solo:
//   el foco vuelve al `<h2>`, y al enfocar dentro del diálogo el lector lee su nombre (paso y
//   título) y el contenido. Es el mismo recurso que usa `DisposicionInterna.tsx:54-57` al
//   cambiar de pantalla. **No hay ninguna región `role="status"`**: diría exactamente lo mismo
//   un instante después, y nueve veces seguidas sobra. Tampoco hay `aria-busy` en ningún nodo
//   de la capa.
// - `useAtraparFoco` atrapa el tabulador y hace que Esc omita el recorrido, que es la salida que
//   ofrece el propio diseño.
// - La mascota es decorativa (`alt=""`).
//
// Lo iluminado no es pulsable: la capa cubre toda la ventana y captura los clics; el hueco está
// **pintado, no recortado** (es la sombra de un `div`, no un agujero), así que ese `div` sigue
// capturando el clic y nada llega al elemento de debajo.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import mascota from "../assets/mascota-topologo.svg";
import Boton from "../components/Boton";
import { useAtraparFoco } from "../disposicion/useAtraparFoco";
import { PASOS_RECORRIDO_DOCTOR } from "./pasosRecorridoDoctor";
import { marcarRecorridoVisto } from "./recorridoVisto";
import { useAnclaRecorrido } from "./useAnclaRecorrido";
import estilos from "./RecorridoDoctor.module.css";

/** Separación entre el elemento iluminado y la tarjeta, y margen mínimo con el borde. */
const SEPARACION = 12;
const MARGEN_VENTANA = 16;

const CELULAR = "(max-width: 767px)";

interface PropiedadesRecorridoDoctor {
  /** Se llama al terminar, al omitir y con Esc. Quien llama devuelve el foco a la pantalla. */
  alCerrar: () => void;
}

export default function RecorridoDoctor({ alCerrar }: PropiedadesRecorridoDoctor) {
  const [indice, setIndice] = useState(0);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const idPaso = useId();
  const idTitulo = useId();

  const paso = PASOS_RECORRIDO_DOCTOR[indice];
  const total = PASOS_RECORRIDO_DOCTOR.length;
  const esUltimo = indice === total - 1;
  const rectangulo = useAnclaRecorrido(paso.ancla);

  // En celular la tarjeta no flota junto al elemento: se ancla al pie de la ventana (CSS). Sin
  // esta condición el estilo en línea ganaría a la media query.
  const [esCelular, setEsCelular] = useState(() => window.matchMedia(CELULAR).matches);
  useEffect(() => {
    const consulta = window.matchMedia(CELULAR);
    const alCambiar = () => setEsCelular(consulta.matches);
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, []);

  function cerrar() {
    // Ya se llama hoy, aunque todavía no haga nada: el día del endpoint no hay que buscar dónde.
    void marcarRecorridoVisto();
    alCerrar();
  }

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
            {indice > 0 && (
              <Boton jerarquia="secundario" onClick={() => setIndice((n) => n - 1)}>
                Anterior
              </Boton>
            )}
            <Boton onClick={() => (esUltimo ? cerrar() : setIndice((n) => n + 1))}>
              {esUltimo ? "Terminar" : "Siguiente"}
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}
