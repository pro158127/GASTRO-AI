// Sondeo de la explicación del LLM para W-08c (../ARCHITECTURE.md § 3.5, «Explicación»).
//
// **Es un hook aparte y no una generalización de `useSondeoAnalisis`**, que sigue siendo de
// W-07 y no se toca. Los dos sondeos se diferencian justo en las cuatro cosas que un hook
// genérico tendría que parametrizar:
//
// - cuándo parar: aquí al salir de `PENDIENTE`; allá al llegar a `COMPLETADO` o `FALLIDO`;
// - el tope de espera: este lo tiene, W-07 no;
// - qué significa un 404: aquí «este análisis no tiene explicación» (el router lo lanza con
//   el análisis FALLIDO), allá «el análisis no existe o no es suyo», que sí cambia la
//   pantalla entera;
// - qué lo reinicia: aquí el POST de reintento, allá el de reencolar el análisis.
//
// Un `useSondeo` con esos cuatro parámetros sería más complejo que los dos concretos, y
// migrar W-07 —ya entregada— no le daría nada nuevo a nadie. Con un tercer sondeo se
// generaliza con tres ejemplos reales delante.
//
// **Las consultas son siempre pasivas** (`X-Actividad-Pasiva: 1`, en `obtenerExplicacion`).
// El POST de «Reintentar» no lo es: eso lo pulsa una persona y va en la pantalla, no aquí.
import { useCallback, useEffect, useRef, useState } from "react";
import { obtenerExplicacion } from "../services/analisis";
import { ErrorApi } from "../services/api";
import type { ExplicacionAnalisis, ExplicacionEstado, ExplicacionReintentada } from "../types";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";

/** Cadencia normal. La explicación tarda segundos, no minutos. */
const CADENCIA_MS = 1000;
/** Tope de la espera creciente entre fallos de red. */
const ESPERA_MAXIMA_MS = 8000;
/** Fallos seguidos tras los cuales el sondeo se detiene y pide volver a consultar. */
const FALLOS_PARA_DETENER = 4;

/**
 * Cuánto se sondea antes de rendirse, medido desde que empieza el sondeo.
 *
 * **Son 20 s y no los 15 del contrato a propósito.** Los 15 s son el tiempo límite de Gemini
 * medido en el servidor desde que arrancó la tarea, no desde que se abrió esta pantalla:
 * son dos relojes distintos y la pantalla puede abrirse antes o después. Con 20 s se le deja
 * margen al servidor para marcar la explicación como FALLIDA él solo, que es lo que permite
 * mostrar W-08d de verdad en vez de un estado inventado aquí.
 */
const TOPE_ESPERA_MS = 20000;

export interface SondeoExplicacion {
  /** Última respuesta buena, o la semilla del detalle mientras no ha llegado ninguna. */
  explicacion: ExplicacionEstado | null;
  /** Se agotaron los 20 s y la explicación sigue PENDIENTE: tarda, no ha fallado. */
  tardando: boolean;
  /**
   * El servidor respondió 404: este análisis no tiene explicación. No debería pasar en W-08,
   * que solo se pinta con el análisis COMPLETADO, pero si pasa la tarjeta lo dice en vez de
   * quedarse «generando» para siempre.
   */
  sinExplicacion: boolean;
  /** El sondeo se detuvo tras varios fallos de red seguidos. */
  detenido: AvisoError | null;
  /** Vuelve a consultar desde cero, con el reloj del tope reiniciado. */
  volverAConsultar: () => void;
  /** Tras un reintento aceptado (202): deja el estado en PENDIENTE y reanuda el sondeo. */
  reanudarTrasReintento: (reintentada: ExplicacionReintentada) => void;
}

/**
 * La copia de la explicación que trae `GET /analisis/{id}` sirve de semilla para no parpadear
 * en W-08c cuando ya está generada, pero **no trae `mensaje` ni `puede_reintentar`**, así que
 * se marca como no reintentable hasta que conteste el endpoint propio, que es el que manda.
 */
function desdeDetalle(semilla: ExplicacionAnalisis | null): ExplicacionEstado | null {
  if (semilla === null) return null;
  return {
    estado: semilla.estado,
    texto: semilla.texto,
    generada_en: semilla.generada_en,
    intentos: semilla.intentos,
    puede_reintentar: false,
  };
}

export function useSondeoExplicacion(
  id: string,
  semilla: ExplicacionAnalisis | null
): SondeoExplicacion {
  const [explicacion, setExplicacion] = useState<ExplicacionEstado | null>(() =>
    desdeDetalle(semilla)
  );
  const [tardando, setTardando] = useState(false);
  const [sinExplicacion, setSinExplicacion] = useState(false);
  const [detenido, setDetenido] = useState<AvisoError | null>(null);
  const [intento, setIntento] = useState(0);
  const terminadoRef = useRef(false);

  useEffect(() => {
    let vigente = true;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let fallos = 0;
    let consultando = false;
    const comenzo = performance.now();
    terminadoRef.current = false;
    setDetenido(null);
    setTardando(false);
    setSinExplicacion(false);

    function cancelar() {
      if (temporizador !== null) clearTimeout(temporizador);
      temporizador = null;
    }

    function programar(ms: number) {
      cancelar();
      temporizador = setTimeout(() => void consultar(), ms);
    }

    async function consultar() {
      if (!vigente || consultando || terminadoRef.current) return;
      consultando = true;
      try {
        const respuesta = await obtenerExplicacion(id);
        if (!vigente) return;
        fallos = 0;
        setDetenido(null);
        setExplicacion(respuesta);
        if (respuesta.estado !== "PENDIENTE") {
          terminadoRef.current = true;
          return;
        }
        // Sigue pendiente: se insiste mientras quede tiempo del tope.
        if (performance.now() - comenzo >= TOPE_ESPERA_MS) {
          terminadoRef.current = true;
          setTardando(true);
          return;
        }
        programar(CADENCIA_MS);
      } catch (causa) {
        if (!vigente) return;
        // La sesión o los permisos: el proveedor ya está llevando a otra pantalla.
        if (esErrorGlobal(causa)) {
          terminadoRef.current = true;
          return;
        }
        // Un 404 aquí es «este análisis no tiene explicación», no «no existe el análisis»:
        // se deja de preguntar y la tarjeta lo dice, sin tocar el resto de la pantalla.
        if (causa instanceof ErrorApi && causa.estado === 404) {
          terminadoRef.current = true;
          setExplicacion(null);
          setSinExplicacion(true);
          return;
        }
        fallos += 1;
        if (fallos >= FALLOS_PARA_DETENER) {
          setDetenido(avisoDeError(causa));
          return;
        }
        programar(Math.min(CADENCIA_MS * 2 ** fallos, ESPERA_MAXIMA_MS));
      } finally {
        consultando = false;
      }
    }

    void consultar();
    return () => {
      vigente = false;
      cancelar();
    };
  }, [id, intento]);

  const volverAConsultar = useCallback(() => setIntento((n) => n + 1), []);

  const reanudarTrasReintento = useCallback((reintentada: ExplicacionReintentada) => {
    // El 202 ya dice que volvió a PENDIENTE: se pinta de inmediato para que el botón no
    // quede un segundo más invitando a reintentar lo que ya se reintentó.
    setExplicacion({
      estado: reintentada.estado,
      intentos: reintentada.intentos,
      puede_reintentar: false,
    });
    setIntento((n) => n + 1);
  }, []);

  return {
    explicacion,
    tardando,
    sinExplicacion,
    detenido,
    volverAConsultar,
    reanudarTrasReintento,
  };
}
