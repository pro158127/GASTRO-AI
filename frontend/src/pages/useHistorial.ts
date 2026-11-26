// Ciclo de carga de una lista del historial (W-16), para las dos pestañas.
//
// Es el patrón que `src/pages/Usuarios.tsx` ya dejó resuelto para W-09 (líneas 133-180),
// recogido aquí porque esta pantalla lo necesita dos veces. Lo que conserva, y por qué:
//
// - **`vigente`**: una respuesta que llega tarde, después de haber cambiado de filtro, se
//   descarta en vez de pisar la página buena.
// - **Esqueleto con dos tiempos**: inmediato en la primera carga (W-16g), y al refiltrar
//   solo si la espera pasa de ~1 s. Las filas anteriores se quedan mientras tanto, que es
//   menos brusco que vaciar la tabla en cada tecleo.
// - **Errores**: W-30 o W-31 con «Reintentar»; los globales (401, 403) no se pintan porque
//   el proveedor de sesión ya está llevando a otra pantalla.
//
// No se parametriza más de la cuenta: recibe una función que consulta y devuelve la página.
// Quién arma los filtros, y de dónde salen, es cosa de cada pestaña.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Paginacion } from "../types";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";

/** Al refiltrar, el esqueleto solo aparece si la espera supera esto. */
const ESPERA_ESQUELETO_MS = 1000;

export interface CargaHistorial<T extends { paginacion: Paginacion }> {
  /** Última página buena; `null` mientras no ha llegado ninguna. */
  pagina: T | null;
  /** Hay una consulta en curso. */
  cargando: boolean;
  /** Hay que pintar el esqueleto (primera carga, o espera larga al refiltrar). */
  mostrarEsqueleto: boolean;
  error: AvisoError | null;
  /** Vuelve a lanzar la misma consulta: el «Reintentar» de la alerta. */
  reintentar: () => void;
}

export interface OpcionesHistorial {
  /**
   * `false` deja el hook quieto: lo usa la pestaña de paciente, que no consulta nada hasta
   * que alguien busca.
   */
  activa?: boolean;
  /**
   * Oportunidad de quedarse con un error antes de que se convierta en la alerta genérica.
   * Devolver `true` significa «ya lo atendí»: el hook no pinta nada. Lo usa la pestaña de
   * paciente con el 422 del documento, que va en el campo y no en una alerta suelta.
   */
  alFallar?: (causa: unknown) => boolean;
}

/**
 * @param consultar función que trae la página. **Tiene que ser estable** (envuelta en
 *   `useCallback` por quien llama) o el efecto se repetiría en cada render.
 */
export function useHistorial<T extends { paginacion: Paginacion }>(
  consultar: () => Promise<T>,
  { activa = true, alFallar }: OpcionesHistorial = {}
): CargaHistorial<T> {
  const [pagina, setPagina] = useState<T | null>(null);
  const [cargando, setCargando] = useState(activa);
  const [mostrarEsqueleto, setMostrarEsqueleto] = useState(activa);
  const [error, setError] = useState<AvisoError | null>(null);
  const [intento, setIntento] = useState(0);
  const hayPaginaRef = useRef(false);
  // En un ref para que cambiar el manejador no vuelva a lanzar la consulta.
  const alFallarRef = useRef(alFallar);
  alFallarRef.current = alFallar;

  useEffect(() => {
    if (!activa) {
      setCargando(false);
      setMostrarEsqueleto(false);
      return;
    }

    let vigente = true;
    let temporizador: number | undefined;
    setCargando(true);
    setError(null);
    if (!hayPaginaRef.current) {
      setMostrarEsqueleto(true);
    } else {
      temporizador = window.setTimeout(() => {
        if (vigente) setMostrarEsqueleto(true);
      }, ESPERA_ESQUELETO_MS);
    }

    consultar()
      .then((respuesta) => {
        if (!vigente) return;
        hayPaginaRef.current = true;
        setPagina(respuesta);
      })
      .catch((causa: unknown) => {
        if (!vigente) return;
        hayPaginaRef.current = false;
        // Los globales (401, 403) no se pintan: el proveedor de sesión ya está llevando a
        // otra pantalla. Lo que reclame quien llama tampoco.
        if (esErrorGlobal(causa)) return;
        if (alFallarRef.current?.(causa)) return;
        setError(avisoDeError(causa));
      })
      .finally(() => {
        if (!vigente) return;
        window.clearTimeout(temporizador);
        setCargando(false);
        setMostrarEsqueleto(false);
      });

    return () => {
      vigente = false;
      window.clearTimeout(temporizador);
    };
  }, [consultar, intento, activa]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { pagina, cargando, mostrarEsqueleto, error, reintentar };
}
