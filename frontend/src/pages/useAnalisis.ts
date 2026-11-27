// Carga del resultado del análisis para W-08 (`GET /analisis/{id}`).
//
// A diferencia de `useSondeoAnalisis`, aquí **no hay sondeo**: el resultado ya está
// terminado y no cambia solo. Se pide una vez al abrir la pantalla y se vuelve a pedir
// únicamente cuando la persona lo pide, que en la práctica es por dos motivos: reintentar
// tras un fallo de red, o recuperar una imagen cuya URL firmada venció (vencen a los 5
// minutos y la única forma de conseguir otras es volver a pedir el análisis).
//
// Por eso la llamada no es pasiva: las dos son acciones de la persona y deben renovar la
// inactividad de la sesión.
import { useCallback, useEffect, useState } from "react";
import { obtenerAnalisis } from "../services/analisis";
import { ErrorApi } from "../services/api";
import type { AnalisisDetalle } from "../types";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";

export interface CargaAnalisis {
  /** El resultado, o `null` mientras no ha llegado ninguno. */
  detalle: AnalisisDetalle | null;
  /** Primera carga: todavía no hay nada que mostrar. */
  cargando: boolean;
  /** Recarga con un resultado ya en pantalla; no se vacía lo que se está leyendo. */
  recargando: boolean;
  /** El análisis no existe o no es de este doctor (404). */
  noEncontrado: boolean;
  /** Fallo de red (W-30) o error inesperado (W-31); `null` si no hay. */
  aviso: AvisoError | null;
  /** Vuelve a pedir el análisis: «Reintentar» y «Volver a cargar» la imagen. */
  recargar: () => void;
}

export function useAnalisis(id: string): CargaAnalisis {
  const [detalle, setDetalle] = useState<AnalisisDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [aviso, setAviso] = useState<AvisoError | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setAviso(null);
    setNoEncontrado(false);
    // La primera vez se muestra el esqueleto; después se conserva lo que ya se lee.
    if (intento === 0) setCargando(true);
    else setRecargando(true);

    async function consultar() {
      try {
        const respuesta = await obtenerAnalisis(id);
        if (!vigente) return;
        setDetalle(respuesta);
      } catch (causa) {
        if (!vigente) return;
        // La sesión o los permisos: el proveedor ya está llevando a otra pantalla.
        if (esErrorGlobal(causa)) return;
        if (causa instanceof ErrorApi && causa.estado === 404) {
          setNoEncontrado(true);
          return;
        }
        setAviso(avisoDeError(causa));
      } finally {
        if (vigente) {
          setCargando(false);
          setRecargando(false);
        }
      }
    }

    void consultar();
    return () => {
      vigente = false;
    };
  }, [id, intento]);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);
  return { detalle, cargando, recargando, noEncontrado, aviso, recargar };
}
