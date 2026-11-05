import { Navigate } from "react-router";
import type { ReactNode } from "react";
import { useSesion } from "./ProveedorSesion";

/** Con sesión iniciada, no se muestra el inicio de sesión: lleva a la pantalla principal. */
export default function RutaPublica({ children }: { children: ReactNode }) {
  const { autenticado } = useSesion();
  if (autenticado) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
