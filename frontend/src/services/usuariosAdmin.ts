// Usuarios del administrador (../ARCHITECTURE.md § 3.5, «Usuarios»). Solo el rol ADMINISTRADOR;
// la autorización la hace el servidor (403 PERMISO_DENEGADO → W-28 por los manejadores globales).
import type {
  EdicionUsuario,
  NuevoUsuario,
  PaginaUsuarios,
  RespuestaCredencial,
  RespuestaEdicion,
  RespuestaUsuario,
  RolUsuario,
  UsuarioDetalle,
} from "../types";
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
 * GET /admin/usuarios?estado=PENDIENTE (W-20, RF-U06): las cuentas creadas que todavía no
 * completan su primer ingreso. Incluye tanto las de contraseña temporal vigente
 * (`estado_activacion: "PENDIENTE"`) como las vencidas (`"EXPIRADA"`): las dos tienen
 * `estado: "PENDIENTE"`.
 *
 * Sin `orden`: el servidor solo ordena por `nombre`, `correo`, `rol` o `estado`, y ninguno separa
 * expirada de pendiente (consulta U-17 en CONTRATOS_API.md). W-20 pide las expiradas primero, así
 * que la pantalla las ordena en el navegador dentro de la página y muestra el total real de
 * expiradas que viene en `conteos`.
 */
export function listarCuentasPendientes({ pagina }: { pagina: number }): Promise<PaginaUsuarios> {
  const parametros = new URLSearchParams();
  parametros.set("estado", "PENDIENTE");
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
 * También cierra las sesiones abiertas de esa cuenta. **No** desvincula la aplicación
 * autenticadora ni quita bloqueos: eso lo hace `restablecer-contrasena`, que es otra acción
 * (W-11) y solo aplica a cuentas activas.
 *
 * Un `200` no significa que el correo haya salido: con el servidor de correo caído responde igual
 * con `credencial.estado: "FALLIDO"` y `codigo_error: "CORREO_NO_ENVIADO"`. Quien llama tiene que
 * mirar `credencial.estado` antes de decir que se envió.
 */
export function reenviarCredencial(id: string): Promise<RespuestaCredencial> {
  return solicitar<RespuestaCredencial>(
    `/admin/usuarios/${encodeURIComponent(id)}/reenviar-credencial`,
    { metodo: "POST" }
  );
}

/** Ruta del detalle y de sus acciones. El id va codificado: nunca se concatena a mano. */
function rutaUsuario(id: string, accion = ""): string {
  return `/admin/usuarios/${encodeURIComponent(id)}${accion}`;
}

/**
 * GET /admin/usuarios/{id} (W-11, RF-U07). La cuenta con sus casos activos, el estado del TOTP,
 * el bloqueo, el último traslado y el historial de envíos de contraseña temporal.
 *
 * Las cuentas eliminadas **sí** se pueden consultar (solo las acciones sobre ellas responden
 * 404). 404 NO_ENCONTRADO si el id no existe.
 *
 * Contiene datos personales: no se registran ni se guardan fuera del estado de la pantalla.
 */
export function obtenerUsuario(id: string): Promise<UsuarioDetalle> {
  return solicitar<UsuarioDetalle>(rutaUsuario(id));
}

/**
 * PATCH /admin/usuarios/{id} (W-11f, RF-U07 CA 4). Nombre, apellido, teléfono y correo.
 *
 * Se mandan siempre los cuatro: el servidor compara con lo que ya tiene y solo toca lo que
 * cambió, así que un valor igual al actual no produce ningún efecto ni queda en la bitácora.
 *
 * **Cambiar el correo** emite una contraseña temporal nueva al correo nuevo y cierra las sesiones
 * abiertas de esa cuenta; por eso la respuesta trae `credencial` solo en ese caso, y un 200 con
 * `credencial.estado` FALLIDO quiere decir que el correo quedó cambiado pero el aviso no salió.
 * **No** desvincula la aplicación autenticadora: eso solo lo hace `restablecerContrasena`.
 *
 * 409 CORREO_YA_REGISTRADO (con `campos`) y 422 DATOS_INVALIDOS los atiende el formulario.
 */
export function editarUsuario(id: string, edicion: EdicionUsuario): Promise<RespuestaEdicion> {
  const telefono = normalizarTelefono(edicion.telefono ?? "");
  return solicitar<RespuestaEdicion>(rutaUsuario(id), {
    metodo: "PATCH",
    cuerpo: {
      nombre: edicion.nombre.trim(),
      apellido: edicion.apellido.trim(),
      // `null` borra el teléfono; es la única forma de dejarlo vacío (el campo es opcional).
      telefono: telefono === "" ? null : telefono,
      correo: normalizarCorreo(edicion.correo),
    },
  });
}

/**
 * POST /admin/usuarios/{id}/rol (W-11, D-04, RF-U08). Un solo rol por cuenta; aplica de inmediato
 * porque el servidor lee el rol de la base en cada petición (CA 2).
 *
 * Rechazos propios de esta acción:
 * - 409 ULTIMO_ADMINISTRADOR al quitarle el rol al único administrador activo → D-05.
 * - 409 CASOS_SIN_REASIGNAR al pasar a administrador a un doctor con casos activos.
 */
export function cambiarRol(id: string, rol: RolUsuario): Promise<RespuestaUsuario> {
  return solicitar<RespuestaUsuario>(rutaUsuario(id, "/rol"), {
    metodo: "POST",
    cuerpo: { rol },
  });
}

/**
 * POST /admin/usuarios/{id}/activar (W-11c → W-11g, RF-U07 CA 1). Un solo clic, sin diálogo
 * (RNF-08: solo se confirma lo crítico).
 *
 * Solo aplica a cuentas INACTIVO; en cualquier otro estado responde 409 TRANSICION_INVALIDA.
 * **El estado resultante no siempre es ACTIVO**: si la cuenta se desactivó antes de su primer
 * ingreso (`activado_en` nulo), vuelve a PENDIENTE y sigue necesitando su contraseña temporal.
 */
export function activarUsuario(id: string): Promise<RespuestaUsuario> {
  return solicitar<RespuestaUsuario>(rutaUsuario(id, "/activar"), { metodo: "POST" });
}

/**
 * POST /admin/usuarios/{id}/desbloquear (W-11b → W-11h, RF-U12 CA 3). Levanta el bloqueo por
 * intentos fallidos antes de los 15 minutos. Un solo clic, sin diálogo (RNF-08).
 *
 * El servidor no comprueba el estado del bloqueo: en una cuenta sin bloqueo responde 200 igual y
 * deja los intentos fallidos en cero. La pantalla solo habilita el botón si hay bloqueo en curso.
 */
export function desbloquearUsuario(id: string): Promise<RespuestaUsuario> {
  return solicitar<RespuestaUsuario>(rutaUsuario(id, "/desbloquear"), { metodo: "POST" });
}

/**
 * POST /admin/usuarios/{id}/restablecer-contrasena (W-11, D-06, RF-U09). Hace cuatro cosas a la
 * vez: emite una contraseña temporal nueva (72 h) al correo registrado, **desvincula la
 * aplicación autenticadora** (CA 9), cierra las sesiones abiertas y quita el bloqueo por intentos
 * fallidos (deja `intentos_fallidos` y `bloqueado_hasta` en cero).
 *
 * Lo admiten las cuentas ACTIVO (siguen ACTIVO) y las PENDIENTE (siguen PENDIENTE); en una cuenta
 * INACTIVO responde 409 TRANSICION_INVALIDA. En las pendientes la pantalla usa
 * `reenviarCredencial`, que es la misma idea con el motivo que corresponde (CREACION).
 *
 * Igual que al crear: un 200 no quiere decir que el correo haya salido. Con el correo caído
 * responde `credencial.estado: "FALLIDO"` y `codigo_error: "CORREO_NO_ENVIADO"`, y lo demás
 * (temporal nueva, app desvinculada, sesiones cerradas) sí pasó.
 */
export function restablecerContrasena(id: string): Promise<RespuestaCredencial> {
  return solicitar<RespuestaCredencial>(rutaUsuario(id, "/restablecer-contrasena"), {
    metodo: "POST",
  });
}

/**
 * ¿Queda algún otro administrador activo además de esta cuenta? (W-11i, RF-U07 CA 6, RF-U08 CA 4).
 *
 * El detalle **no** trae ningún campo que lo diga, así que se deduce con la consulta que el propio
 * contrato indica para listar administradores activos distintos de uno dado
 * (`?rol&estado&excluir`, ../ARCHITECTURE.md § 3.5). Se pide una sola fila: lo único que se mira
 * es el total. Propuesta U-19 en CONTRATOS_API.md para que venga en el detalle.
 *
 * Es solo para deshabilitar la acción y explicar por qué: la autoridad sigue siendo el servidor,
 * que responde 409 ULTIMO_ADMINISTRADOR (RF-U03 CA 4).
 */
export async function hayOtroAdministradorActivo(id: string): Promise<boolean> {
  const parametros = new URLSearchParams({
    rol: "ADMINISTRADOR",
    estado: "ACTIVO",
    excluir: id,
    pagina: "1",
    por_pagina: "1",
  });
  const pagina = await solicitar<PaginaUsuarios>(`/admin/usuarios?${parametros.toString()}`);
  return pagina.paginacion.total > 0;
}
