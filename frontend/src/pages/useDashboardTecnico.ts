// Carga del dashboard técnico (W-19): `GET /admin/dashboard`.
//
// Mismo ciclo que `useDashboardDoctor` (W-15) y por el mismo motivo: una sola consulta que no
// cambia sola, sin filtros ni paginación, que solo se vuelve a pedir cuando la persona lo pide.
//
// Tampoco hay sondeo: el dashboard no se actualiza solo, así que la llamada nunca es pasiva.
import { useCallback, useEffect, useState } from "react";
import { obtenerDashboardTecnico } from "../services/dashboardTecnico";
import type { DashboardTecnico } from "../types";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";

export interface CargaDashboardTecnico {
  /** Los datos, o `null` mientras no ha llegado ninguno. */
  datos: DashboardTecnico | null;
  /** Primera carga o recarga: se pinta el esqueleto de W-19b. */
  cargando: boolean;
  /** Fallo de red (W-30) o error inesperado (W-31); `null` si no hay. */
  aviso: AvisoError | null;
  /** Vuelve a pedir el dashboard: el «Reintentar» de la alerta. */
  recargar: () => void;
}

export function useDashboardTecnico(): CargaDashboardTecnico {
  const [datos, setDatos] = useState<DashboardTecnico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<AvisoError | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setAviso(null);

    obtenerDashboardTecnico()
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
