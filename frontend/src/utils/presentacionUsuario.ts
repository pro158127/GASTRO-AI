// Cómo se muestran el rol y el estado de una cuenta en las pantallas del administrador (W-09 y
// las que siguen). Es el único lugar con estas reglas.
import type { RolUsuario, UsuarioResumen } from "../types";

/**
 * PROVISIONAL: etiquetas de los roles para el selector de W-10 (crear usuario).
 *
 * Las respuestas de `/admin/usuarios` traen `rol_nombre` y es ese el que se muestra en todas las
 * demás pantallas. Pero el formulario de creación necesita las etiquetas *antes* de que la cuenta
 * exista, y **no hay endpoint de catálogo de roles**: `rol` es un enum cerrado del backend
 * (`DOCTOR`, `ADMINISTRADOR`) que nunca llega como lista. Esta tabla se usa SOLO en ese formulario
 * y se elimina cuando exista `GET /catalogos/roles` (consulta U-16 en CONTRATOS_API.md).
 */
export const ETIQUETA_ROL_FORMULARIO: Record<RolUsuario, string> = {
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

/**
 * Insignias de la columna «Estado» de W-20 (cuentas pendientes de activación).
 *
 * Distinta de `insigniaDeEstado`: allí se resume toda la cuenta y aquí todas son PENDIENTE, así
 * que el texto es el corto que dibuja Figma («Expirada», «Pendiente») y cabe en la columna.
 *
 * Devuelve una lista porque **pueden aplicar dos a la vez**: Figma dibuja «Correo no enviado» en
 * lugar de «Expirada»/«Pendiente», pero una cuenta puede tener la temporal vencida *y* el correo
 * caído, y entonces una sola insignia esconde información. Se pintan las dos. Anotado para diseño.
 */
export function insigniasDeCuentaPendiente(usuario: UsuarioResumen): InsigniaEstado[] {
  const insignias: InsigniaEstado[] =
    usuario.estado_activacion === "EXPIRADA"
      ? [{ texto: "Expirada", tipo: "advertencia" }]
      : [{ texto: "Pendiente", tipo: "info" }];

  // `CORREO_NO_ENVIADO` no es un error HTTP: viaja dentro de la respuesta, en `credencial`.
  if (usuario.ultimo_envio?.estado === "FALLIDO") {
    insignias.push({ texto: "Correo no enviado", tipo: "advertencia" });
  }
  return insignias;
}

/** «Ana Pérez». */
export function nombreCompleto(usuario: Pick<UsuarioResumen, "nombre" | "apellido">): string {
  return `${usuario.nombre} ${usuario.apellido}`;
}
