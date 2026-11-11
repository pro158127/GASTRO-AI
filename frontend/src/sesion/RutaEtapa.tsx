import { Navigate } from "react-router";
import type { ReactNode } from "react";
import type { EtapaSesion } from "../types";
import { rutaDeEtapa } from "./etapas";
import { useSesion } from "./ProveedorSesion";

/** Solo se entra a la pantalla de una etapa cuando esa es la etapa actual de la sesión. */
export default function RutaEtapa({ etapa, children }: { etapa: EtapaSesion; children: ReactNode }) {
  const { etapa: etapaActual } = useSesion();
  if (etapaActual === null) {
    return <Navigate to="/iniciar-sesion" replace />;
  }
  if (etapaActual !== etapa) {
    return <Navigate to={rutaDeEtapa[etapaActual]} replace />;
  }
  return <>{children}</>;
}
