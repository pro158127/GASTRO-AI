// Usuarios del administrador (../ARCHITECTURE.md § 3.5, «Usuarios»). Solo el rol ADMINISTRADOR;
// la autorización la hace el servidor (403 PERMISO_DENEGADO → W-28 por los manejadores globales).
import type { PaginaUsuarios } from "../types";
import { solicitar } from "./api";

/** W-09 pagina de 8 en 8 (decisión del equipo; Figma dibuja 8 filas). */
export const USUARIOS_POR_PAGINA = 8;

/** Igual que el servidor (`Query(max_length=100)`): más largo responde 422 DATOS_INVALIDOS. */
export const LONGITUD_MAXIMA_BUSQUEDA = 100;

export interface ConsultaUsuarios {
  /** Texto de búsqueda por nombre, apellido o correo. Vacío o solo espacios = sin filtro. */
  q: string;
  /** Desde 1. */
  pagina: number;
}

/**
 * GET /admin/usuarios. Las cuentas eliminadas no salen (el servidor las excluye sin `estado`).
 * Orden del servidor: apellido y luego nombre.
 *
 * `q` puede ser un correo: aquí solo viaja en la petición, como pide el contrato (GET con query
 * string); nunca va a la URL del navegador, al almacenamiento ni a la consola. El riesgo de que
 * quede en los logs de acceso está anotado para el backend en CONTRATOS_API.md.
 */
export function listarUsuarios({ q, pagina }: ConsultaUsuarios): Promise<PaginaUsuarios> {
  const parametros = new URLSearchParams();
  const busqueda = q.trim();
  if (busqueda !== "") parametros.set("q", busqueda);
  parametros.set("pagina", String(pagina));
  parametros.set("por_pagina", String(USUARIOS_POR_PAGINA));
  return solicitar<PaginaUsuarios>(`/admin/usuarios?${parametros.toString()}`);
}
