// Carga del dashboard clínico (W-15): `GET /dashboard/doctor`.
//
// Mismo ciclo que `useAnalisis` (W-08) y por el mismo motivo: una sola consulta que no cambia
// sola, sin filtros ni paginación, que solo se vuelve a pedir cuando la persona lo pide. No se
// usa `useHistorial`, que está atado a `PaginaHistorial` y trae la maquinaria de refiltrado que
// aquí no hace falta.
//
// Tampoco hay sondeo: el dashboard no se actualiza solo, así que la llamada nunca es pasiva.
import { useCallback, useEffect, useState } from "react";
import { obtenerDashboardDoctor } from "../services/dashboard";
import type { DashboardDoctor } from "../types";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";

export interface CargaDashboard {
  /** Los datos, o `null` mientras no ha llegado ninguno. */
  datos: DashboardDoctor | null;
  /** Primera carga o recarga: se pinta el esqueleto de W-15e. */
  cargando: boolean;
  /** Fallo de red (W-30) o error inesperado (W-31); `null` si no hay. */
  aviso: AvisoError | null;
  /** Vuelve a pedir el dashboard: el «Reintentar» de la alerta. */
  recargar: () => void;
}

export function useDashboardDoctor(): CargaDashboard {
  const [datos, setDatos] = useState<DashboardDoctor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<AvisoError | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setAviso(null);

    obtenerDashboardDoctor()
      .then((respuesta) => {
        if (vigente) setDatos(respuesta);
      })
      .catch((causa: unknown) => {
        if (!vigente) return;
        // La sesión (401) o los permisos (403): el proveedor de sesión ya está llevando a otra
        // pantalla, así que aquí no se pinta nada.
        if (esErrorGlobal(causa)) return;
        setAviso(avisoDeError(causa));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [intento]);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);
  return { datos, cargando, aviso, recargar };
}
