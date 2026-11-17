// Cómo se muestran el rol y el estado de una cuenta en las pantallas del administrador (W-09 y
// las que siguen). Es el único lugar con estas reglas.
import type { RolUsuario, UsuarioResumen } from "../types";

/**
 * TEMPORAL: etiqueta del rol por código. Las rutas `/admin/usuarios` solo traen el código
 * (`DOCTOR`, `ADMINISTRADOR`); se pidió al backend que devuelvan `rol.nombre`, como `/perfil`.
 * Cuando llegue, se usa ese nombre y esta tabla se elimina.
 */
export const ETIQUETA_ROL_USUARIO: Record<RolUsuario, string> = {
  DOCTOR: "Doctor/Gastroenterólogo",
  ADMINISTRADOR: "Administrador",
};

/** Variantes del componente Insignia (Figma 14:574). */
export type TipoInsignia = "exito" | "info" | "advertencia" | "error" | "neutral";

export interface InsigniaEstado {
  texto: string;
  tipo: TipoInsignia;
}

/**
 * Insignia única del estado de una cuenta (W-09, T-09, M-09). La API manda el bloqueo aparte del
 * estado (`bloqueado` y `estado`), y una cuenta puede tener las dos cosas a la vez; la lista
 * muestra una sola insignia con esta prioridad:
 *
 *   1. Bloqueada (`bloqueado`), aunque la cuenta esté ACTIVO o INACTIVO: es lo que el
 *      administrador puede tener que resolver ya (RF-U12).
 *   2. PENDIENTE: «Contraseña temporal expirada» si `estado_activacion` es EXPIRADA; si no,
 *      «Pendiente de activación» (RF-U06).
 *   3. INACTIVO: «Inactiva».
 *   4. ACTIVO: «Activa».
 *
 * PENDIENTE DE CONFIRMAR con backend y diseño: Figma no dibuja ninguna cuenta con dos estados a
 * la vez. El significado lo da el texto; el color solo lo refuerza (WCAG 1.4.1).
 */
export function insigniaDeEstado(usuario: UsuarioResumen): InsigniaEstado {
  if (usuario.bloqueado) return { texto: "Bloqueada", tipo: "error" };
  switch (usuario.estado) {
    case "PENDIENTE":
      return usuario.estado_activacion === "EXPIRADA"
        ? { texto: "Contraseña temporal expirada", tipo: "advertencia" }
        : { texto: "Pendiente de activación", tipo: "info" };
    case "INACTIVO":
      return { texto: "Inactiva", tipo: "neutral" };
    case "ACTIVO":
      return { texto: "Activa", tipo: "exito" };
    case "ELIMINADO":
      // No dibujado en Figma. La lista no trae cuentas eliminadas salvo con `estado=ELIMINADO`;
      // se cubre para que la función acepte todos los estados de la API.
      return { texto: "Eliminada", tipo: "neutral" };
  }
}

/** «Ana Pérez». */
export function nombreCompleto(usuario: Pick<UsuarioResumen, "nombre" | "apellido">): string {
  return `${usuario.nombre} ${usuario.apellido}`;
}
