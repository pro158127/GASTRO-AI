import { Navigate } from "react-router";
import type { ReactNode } from "react";
import type { RolInterfaz } from "../navegacion/menus";
import { useUsuarioActual } from "./UsuarioActual";

/**
 * Comodidad de interfaz, NO seguridad: evita mostrar el armazón de una pantalla de otro rol.
 * La autorización real la hace el backend en cada endpoint.
 */
export default function RutaPorRol({ roles, children }: { roles: RolInterfaz[]; children: ReactNode }) {
  const { rol } = useUsuarioActual();
  if (!roles.includes(rol)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
