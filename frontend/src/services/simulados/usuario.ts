// Datos simulados del usuario actual y del resumen de casos recibidos.
// Se aíslan aquí porque la API todavía no expone el rol ni el nombre del usuario (el login solo
// devuelve el token). No se decodifica el JWT para obtenerlos. Formatos propuestos en
// CONTRATOS_API.md; mientras el backend no los confirme, no son endpoints existentes.
import type { ResumenCasosRecibidos, UsuarioActual } from "../../types";

/**
 * Casos recibidos por traslado sin revisar. Es el único lugar donde vive este dato: el
 * contador del menú y el indicador del dashboard W-15 deben leerlo de aquí.
 */
const CASOS_RECIBIDOS_SIN_REVISAR = 4;

// Nombres ficticios tomados de los ejemplos de Figma (W-15 y W-19).
const USUARIO_DOCTOR: UsuarioActual = {
  full_name: "Dra. Ana Pérez",
  email: "ana.perez@ejemplo.test",
  role: "doctor",
};

const USUARIO_ADMIN: UsuarioActual = {
  full_name: "Marta Ríos",
  email: "marta.rios@ejemplo.test",
  role: "admin",
};

/** VITE_ROL_SIMULADO=admin (en frontend/.env.local) muestra el menú del administrador. */
function usuarioSimulado(): UsuarioActual {
  return import.meta.env.VITE_ROL_SIMULADO === "admin" ? USUARIO_ADMIN : USUARIO_DOCTOR;
}

// SIMULADO: falta endpoint GET /api/auth/me
export async function obtenerUsuarioActual(): Promise<UsuarioActual> {
  return { ...usuarioSimulado() };
}

// SIMULADO: falta endpoint GET /api/casos-recibidos/resumen
export async function obtenerResumenCasosRecibidos(): Promise<ResumenCasosRecibidos> {
  return { sin_revisar: CASOS_RECIBIDOS_SIN_REVISAR };
}
