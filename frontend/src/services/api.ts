// Cliente HTTP de la API (../ARCHITECTURE.md § 3.5). La sesión viaja en la cookie HttpOnly
// `gastro_sesion`: el frontend nunca la lee ni la guarda, y no hay header Authorization.
import type { HealthResponse, RespuestaEtapa, RespuestaSesion } from "../types";

const BASE = "/api/v1";

/**
 * Error de una llamada a la API. `estado` es el código HTTP, o `null` si no hubo respuesta
 * (fallo de red). `codigo` e `idError` vienen del cuerpo `{error: {codigo, mensaje, id_error}}`
 * y son `null` si el cuerpo no tiene esa forma (por ejemplo, un 502 de nginx).
 *
 * Las pantallas eligen el texto según `codigo` con los textos de Figma; nunca muestran el
 * mensaje del servidor. `idError` es el código que W-31 le pide al usuario dictar al
 * administrador.
 */
export class ErrorApi extends Error {
  readonly estado: number | null;
  readonly codigo: string | null;
  readonly idError: string | null;

  constructor(estado: number | null, codigo: string | null = null, idError: string | null = null) {
    super(codigo ?? "Error de la API");
    this.name = "ErrorApi";
    this.estado = estado;
    this.codigo = codigo;
    this.idError = idError;
  }
}

/** Reacciones globales a los errores que no dependen de la pantalla que hizo la llamada. */
export interface ManejadoresGlobales {
  /** 401 SIN_SESION o SESION_VENCIDA. */
  alSinSesion?: () => void;
  /** 403 SIN_PERMISO. */
  alSinPermiso?: () => void;
  /** 403 ETAPA_INVALIDA: falta un paso del inicio de sesión. */
  alEtapaInvalida?: () => void;
}

let manejadores: ManejadoresGlobales | null = null;

export function registrarManejadoresGlobales(nuevos: ManejadoresGlobales | null): void {
  manejadores = nuevos;
}

interface OpcionesSolicitud {
  metodo?: "GET" | "POST";
  cuerpo?: unknown;
  /** Consulta automática: no renueva la inactividad de la sesión (header X-Actividad: pasiva). */
  pasiva?: boolean;
  /** Si es `false`, el error no dispara los manejadores globales (lo atiende quien llama). */
  global?: boolean;
}

async function leerCuerpoJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json();
  } catch {
    return null;
  }
}

function errorDesdeCuerpo(estado: number, cuerpo: unknown): ErrorApi {
  const detalle = (cuerpo as { error?: { codigo?: unknown; id_error?: unknown } } | null)?.error;
  const codigo = typeof detalle?.codigo === "string" ? detalle.codigo : null;
  const idError = typeof detalle?.id_error === "string" ? detalle.id_error : null;
  return new ErrorApi(estado, codigo, idError);
}

async function solicitar<T>(ruta: string, opciones: OpcionesSolicitud = {}): Promise<T> {
  const { metodo = "GET", cuerpo, pasiva = false, global = true } = opciones;
  const headers: Record<string, string> = {};
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  if (pasiva) headers["X-Actividad"] = "pasiva";

  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      credentials: "same-origin",
    });
  } catch {
    throw new ErrorApi(null);
  }

  if (!respuesta.ok) {
    const error = errorDesdeCuerpo(respuesta.status, await leerCuerpoJson(respuesta));
    if (global) {
      if (error.codigo === "SIN_SESION" || error.codigo === "SESION_VENCIDA") {
        manejadores?.alSinSesion?.();
      } else if (error.codigo === "SIN_PERMISO") {
        manejadores?.alSinPermiso?.();
      } else if (error.codigo === "ETAPA_INVALIDA") {
        manejadores?.alEtapaInvalida?.();
      }
    }
    throw error;
  }

  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

/** POST /auth/login. Deja la cookie puesta y responde la etapa que sigue. */
export function login(correo: string, contrasena: string): Promise<RespuestaEtapa> {
  // Los 401 de aquí son CREDENCIALES_INVALIDAS o TEMPORAL_EXPIRADA: los atiende el formulario.
  return solicitar<RespuestaEtapa>("/auth/login", {
    metodo: "POST",
    cuerpo: { correo, contrasena },
    global: false,
  });
}

/**
 * GET /auth/sesion. Quién es el usuario, en qué etapa va y cuándo vence. Sirve en cualquier
 * etapa. Quien llama decide qué hacer con un 401 (es lo normal si no hay sesión).
 */
export function obtenerSesion(opciones: { pasiva?: boolean } = {}): Promise<RespuestaSesion> {
  return solicitar<RespuestaSesion>("/auth/sesion", { ...opciones, global: false });
}

export function fetchHealth(): Promise<HealthResponse> {
  return solicitar<HealthResponse>("/health");
}
