// Tarjeta «Procedencia de este análisis» del detalle de un análisis (W-17b, etiqueta interna
// de este código, sin maqueta).
//
// **No hay frame de Figma para este bloque.** La página «06 · Doctor · Historial» tiene W-17 y
// los tres frames del reporte descargable (W-17d, W-17e, W-17f), y ninguno lo dibuja. El
// diseño es decisión del equipo: la misma caja que las demás tarjetas de la pantalla, con dos
// pares etiqueta/valor.
//
// Dos datos **independientes**, cada uno con su propia condición:
//
// 1. **Quién realizó el análisis**, solo si `realizado_por.es_propio === false`.
// 2. **De quién llegó el caso y cuándo**, solo si `trasladado !== null`.
//
// Las dos se evalúan por separado a propósito. Hoy el backend no puede emitir `es_propio: true`
// junto con un traslado, porque `services/analisis.py` solo consulta el traslado cuando el
// ejecutor no es quien consulta; pero eso es una decisión revisable del servicio, no una
// invariante del modelo, y el tipo las declara independientes. Si mañana cambia, esta tarjeta
// funciona sin tocarla.
//
// **No se redacta una sola frase con los dos nombres.** `traslado_recibido()` del backend toma
// el *último* traslado, así que el ejecutor y quien trasladó pueden ser dos personas distintas:
// Marcela ejecuta el análisis → el caso pasa a Ana → el administrador lo reasigna a Lucía, y
// Lucía recibe ejecutor Marcela y origen Ana. Cualquier frase que los junte le atribuiría a una
// lo que hizo la otra. Van como dos datos separados, cada uno con su `cuenta_eliminada`, que son
// banderas distintas. Es el mismo escenario que ya reconoce `originalmente_de` en los tipos.
//
// «Recibido de» y no «trasladado por»: el traslado lo ejecuta un administrador desde un doctor
// de origen, y nunca se nombra al administrador (ver `PersonaOrigen` en los tipos).
//
// Con las dos condiciones falsas el componente **no pinta nada**: `return null`, sin
// `<section>`, sin `<h2>` y sin contenedor vacío. Es lo que ocurre al terminar un análisis
// nuevo (W-08: el ejecutor es quien mira y no hay traslado), así que esa pantalla queda igual
// que antes. Como se coloca como hijo directo del `<main>` flex de `DisposicionInterna`, un
// hijo menos tampoco deja hueco: `gap` solo separa hijos que existen.
import type { RealizadoPor, TrasladoAnalisis } from "../types";
import { fechaHoraCorta } from "../utils/fechas";
import { nombreDeOrigen } from "./TablaCasosRecibidos";
import estilos from "./ProcedenciaAnalisis.module.css";

interface PropiedadesProcedenciaAnalisis {
  /** `realizado_por` del detalle. Siempre presente. */
  realizadoPor: RealizadoPor;
  /** `trasladado` del detalle: `null` si el caso no llegó por traslado. */
  trasladado: TrasladoAnalisis | null;
}

export default function ProcedenciaAnalisis({
  realizadoPor,
  trasladado,
}: PropiedadesProcedenciaAnalisis) {
  const muestraEjecutor = realizadoPor.es_propio === false;
  const muestraTraslado = trasladado !== null;
  if (!muestraEjecutor && !muestraTraslado) return null;

  // `fechaHoraCorta` devuelve cadena vacía si la fecha no es válida, a propósito: no se
  // inventa un valor. Sin este guardia quedaría un «Trasladado el» colgando sin fecha, así
  // que la línea no se pinta. Mismo criterio que `lineaDatos` de `ResultadoAnalisis`, que
  // filtra las partes vacías antes de unirlas.
  const fechaTraslado = trasladado ? fechaHoraCorta(trasladado.fecha) : "";

  return (
    <section className={estilos.tarjeta} aria-labelledby="titulo-procedencia">
      <h2 id="titulo-procedencia" className={estilos.titulo}>
        Procedencia de este análisis
      </h2>

      {muestraEjecutor && (
        <div className={estilos.dato}>
          <p className={estilos.etiqueta}>Realizado por</p>
          <p className={estilos.valor}>{nombreDeOrigen(realizadoPor)}</p>
        </div>
      )}

      {trasladado && (
        <div className={estilos.dato}>
          <p className={estilos.etiqueta}>Recibido de</p>
          <p className={estilos.valor}>
            {nombreDeOrigen({
              nombre: trasladado.desde.nombre,
              apellido: trasladado.desde.apellido,
              cuenta_eliminada: trasladado.cuenta_eliminada,
            })}
          </p>
          {fechaTraslado && <p className={estilos.fecha}>Trasladado el {fechaTraslado}</p>}
        </div>
      )}
    </section>
  );
}
