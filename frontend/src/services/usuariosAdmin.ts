// Usuarios del administrador (../ARCHITECTURE.md § 3.5, «Usuarios»). Solo el rol ADMINISTRADOR;
// la autorización la hace el servidor (403 PERMISO_DENEGADO → W-28 por los manejadores globales).
import type { NuevoUsuario, PaginaUsuarios, RespuestaCredencial } from "../types";
import { normalizarCorreo, normalizarTelefono } from "../utils/validacionUsuario";
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

/**
 * POST /admin/usuarios (W-10, RF-U05). Crea la cuenta en estado PENDIENTE y manda la contraseña
 * temporal al correo registrado.
 *
 * **La contraseña temporal nunca viene en la respuesta**: solo llega por correo (CA 5). Si el
 * correo falla, la cuenta queda creada igual y `credencial.estado` es `FALLIDO` con
 * `codigo_error: "CORREO_NO_ENVIADO"` → W-10d ofrece reenviar.
 *
 * Los valores se normalizan igual que en el servidor antes de enviarlos; el `telefono` vacío se
 * omite del cuerpo. Los errores de campo (409 CORREO_YA_REGISTRADO y 422 DATOS_INVALIDOS) los
 * atiende la pantalla; los globales (401, 403) siguen yendo a los manejadores de `api.ts`.
 *
 * Contiene datos personales: no se registran ni se guardan fuera del estado de la pantalla.
 */
export function crearUsuario(nuevo: NuevoUsuario): Promise<RespuestaCredencial> {
  const telefono = normalizarTelefono(nuevo.telefono ?? "");
  return solicitar<RespuestaCredencial>("/admin/usuarios", {
    metodo: "POST",
    cuerpo: {
      nombre: nuevo.nombre.trim(),
      apellido: nuevo.apellido.trim(),
      correo: normalizarCorreo(nuevo.correo),
      ...(telefono === "" ? {} : { telefono }),
      rol: nuevo.rol,
    },
  });
}

/**
 * POST /admin/usuarios/{id}/reenviar-credencial (W-10d, RF-U06). Genera una contraseña temporal
 * nueva, vigente 72 horas, y anula la anterior.
 *
 * Solo aplica a cuentas PENDIENTE: en una cuenta ya activa responde 409 TRANSICION_INVALIDA.
 */
export function reenviarCredencial(id: string): Promise<RespuestaCredencial> {
  return solicitar<RespuestaCredencial>(
    `/admin/usuarios/${encodeURIComponent(id)}/reenviar-credencial`,
    { metodo: "POST" }
  );
}
