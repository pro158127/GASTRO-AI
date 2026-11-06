import { Navigate } from "react-router";
import type { ReactNode } from "react";
import { rutaDeEtapa } from "./etapas";
import { useSesion } from "./ProveedorSesion";

/**
 * Con sesión (activa o a medias) no se muestra el inicio de sesión: lleva a la pantalla
 * principal o a la pantalla de la etapa pendiente.
 */
export default function RutaPublica({ children }: { children: ReactNode }) {
  const { etapa } = useSesion();
  if (etapa !== null) {
    return <Navigate to={rutaDeEtapa[etapa]} replace />;
  }
  return <>{children}</>;
}
