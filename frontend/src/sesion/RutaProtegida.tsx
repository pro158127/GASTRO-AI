import { Navigate } from "react-router";
import type { ReactNode } from "react";
import { useSesion } from "./ProveedorSesion";

/** Sin sesión, lleva a /iniciar-sesion. */
export default function RutaProtegida({ children }: { children: ReactNode }) {
  const { autenticado } = useSesion();
  if (!autenticado) {
    return <Navigate to="/iniciar-sesion" replace />;
  }
  return <>{children}</>;
}
