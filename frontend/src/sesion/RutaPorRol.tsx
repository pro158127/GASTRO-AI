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
  // Rol sin diseño en Figma (`tecnico`): no hay pantallas que mostrar. Se devuelve null y no un
  // Navigate, porque redirigir a /dashboard desde /dashboard sería un bucle.
  if (rol === null) {
    return null;
  }
  if (!roles.includes(rol)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
