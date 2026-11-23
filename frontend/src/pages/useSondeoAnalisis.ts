// Sondeo del avance del análisis para W-07 (../ARCHITECTURE.md § 3.9).
//
// Es el primer sondeo periódico del proyecto. Reglas, y por qué:
//
// - **Cadena de `setTimeout`, no `setInterval`.** La siguiente consulta se programa cuando
//   llega la anterior: si el servidor tarda 3 s, no se apilan peticiones esperando.
// - **Consultas pasivas** (`X-Actividad-Pasiva: 1`, en `obtenerEstadoAnalisis`). Si no lo
//   fueran, tener esta pantalla abierta mantendría la sesión viva para siempre y el cierre por
//   inactividad de los 10 minutos dejaría de funcionar.
// - **Se detiene siempre** al llegar a `COMPLETADO` o `FALLIDO`, y al desmontar.
// - **Ante fallos, espacia y luego para.** Un fallo suelto no tumba nada, pero cada fallo
//   consecutivo dobla la espera (1,5 → 3 → 6 → 12 s, con tope de 12 s) y al quinto el sondeo se
//   detiene y deja un aviso con «Reintentar». El análisis tiene un p95 de 10 s (RNF-10): más de
//   veinte segundos sin respuesta no es «va lento», es que algo está roto, y seguir preguntando
//   cada 1,5 s a una API caída gasta batería y llena el servidor de reintentos de cada pestaña
//   abierta. Parar y pedir «Reintentar» deja un estado estable y en manos de la persona.
// - **Un 404 o un error global no cuentan como fallo de red**: paran de inmediato. El 404 lo
//   pinta la pantalla; el 401 y el 403 ya los atendió el proveedor de sesión.
// - Al volver la red (`online`) o al volver a la pestaña (`visibilitychange`) se consulta de
//   inmediato y se reinicia el contador de fallos, igual que hace el vigilante de inactividad.
import { useCallback, useEffect, useRef, useState } from "react";
import { obtenerEstadoAnalisis } from "../services/analisis";
import { ErrorApi } from "../services/api";
import type { EstadoAnalisisRespuesta } from "../types";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";

/** Cadencia normal. El backend recomienda consultar cada 1–2 s. */
const CADENCIA_MS = 1500;
/** Tope de la espera creciente entre fallos. */
const ESPERA_MAXIMA_MS = 12000;
/** Fallos seguidos tras los cuales el sondeo se detiene y pide reintentar a mano. */
const FALLOS_PARA_DETENER = 5;

export interface Sondeo {
  /** Última respuesta buena; `null` mientras no ha llegado ninguna. */
  estado: EstadoAnalisisRespuesta | null;
  /** El análisis no existe o no es de este doctor (404). */
  noEncontrado: boolean;
  /** El sondeo se detuvo tras varios fallos seguidos; `reintentar` lo reanuda. */
  detenido: AvisoError | null;
  /** Vuelve a empezar el sondeo desde cero (botón «Reintentar» del aviso). */
  reintentar: () => void;
}

export function useSondeoAnalisis(id: string): Sondeo {
  const [estado, setEstado] = useState<EstadoAnalisisRespuesta | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [detenido, setDetenido] = useState<AvisoError | null>(null);
  const [intento, setIntento] = useState(0);
  // Lo consulta el efecto para no reprogramar nada cuando ya terminó.
  const terminadoRef = useRef(false);

  useEffect(() => {
    let vigente = true;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let fallos = 0;
    let consultando = false;
    terminadoRef.current = false;
    setDetenido(null);
    setNoEncontrado(false);

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
        const respuesta = await obtenerEstadoAnalisis(id);
        if (!vigente) return;
        fallos = 0;
        setDetenido(null);
        setEstado(respuesta);
        if (respuesta.estado === "PROCESANDO") programar(CADENCIA_MS);
        else terminadoRef.current = true;
      } catch (causa) {
        if (!vigente) return;
        // La sesión o los permisos: el proveedor ya está llevando a otra pantalla.
        if (esErrorGlobal(causa)) {
          terminadoRef.current = true;
          return;
        }
        if (causa instanceof ErrorApi && causa.estado === 404) {
          terminadoRef.current = true;
          setNoEncontrado(true);
          return;
        }
        fallos += 1;
        if (fallos >= FALLOS_PARA_DETENER) {
          setDetenido(avisoDeError(causa));
          return;
        }
        programar(Math.min(CADENCIA_MS * 2 ** (fallos - 1), ESPERA_MAXIMA_MS));
      } finally {
        consultando = false;
      }
    }

    /** Vuelta de la red o de la pestaña: se consulta ya y se perdona lo que falló antes. */
    function reanudar() {
      if (!vigente || terminadoRef.current) return;
      fallos = 0;
      setDetenido(null);
      programar(0);
    }

    function alVolverVisible() {
      if (document.visibilityState === "visible") reanudar();
    }

    void consultar();
    document.addEventListener("visibilitychange", alVolverVisible);
    window.addEventListener("online", reanudar);

    return () => {
      vigente = false;
      cancelar();
      document.removeEventListener("visibilitychange", alVolverVisible);
      window.removeEventListener("online", reanudar);
    };
  }, [id, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { estado, noEncontrado, detenido, reintentar };
}
