import { Navigate } from "react-router";
import type { ReactNode } from "react";
import { rutaDeEtapa } from "./etapas";
import { useSesion } from "./ProveedorSesion";

/** Solo con la sesión ACTIVA. Sin sesión, lleva a /iniciar-sesion; en otra etapa, a su pantalla. */
export default function RutaProtegida({ children }: { children: ReactNode }) {
  const { etapa } = useSesion();
  if (etapa === null) {
    return <Navigate to="/iniciar-sesion" replace />;
  }
  if (etapa !== "ACTIVA") {
    return <Navigate to={rutaDeEtapa[etapa]} replace />;
  }
  return <>{children}</>;
}
