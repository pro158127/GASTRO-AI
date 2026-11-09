// Cliente HTTP de la API (../ARCHITECTURE.md § 3.5). La sesión viaja en la cookie HttpOnly
// `gastro_sesion`: el frontend nunca la lee ni la guarda, y no hay header Authorization.
import type { EtapaSesion, HealthResponse, RespuestaEtapa, RespuestaSesion } from "../types";
import { CodigoErrorApi } from "./codigosError";

const BASE = "/api/v1";

const ETAPAS: readonly string[] = ["CAMBIO_CONTRASENA", "VINCULAR_TOTP", "PENDIENTE_2FA", "ACTIVA"];

function esEtapaSesion(valor: unknown): valor is EtapaSesion {
  return typeof valor === "string" && ETAPAS.includes(valor);
}

/** Datos del cuerpo de error `{error: {codigo, mensaje, id_solicitud, ...}}` que usa el frontend. */
interface DetalleError {
  codigo?: string | null;
  idSolicitud?: string | null;
  /** `motivo` de SESION_EXPIRADA (por ejemplo `INACTIVIDAD`). */
  motivo?: string | null;
  /** `etapa` de ETAPA_INVALIDA: la etapa actual de la sesión. */
  etapa?: EtapaSesion | null;
}

/**
 * Error de una llamada a la API. `estado` es el código HTTP, o `null` si no hubo respuesta
 * (fallo de red). El resto sale del cuerpo y es `null` si el cuerpo no tiene esa forma (por
 * ejemplo, un 502 de nginx).
 *
 * Las pantallas eligen el texto según `codigo` con los textos de Figma; nunca muestran el
 * mensaje del servidor.
 */
export class ErrorApi extends Error {
  readonly estado: number | null;
  readonly codigo: string | null;
  /** Identifica la petición; queda en el log del servidor. */
  readonly idSolicitud: string | null;
  readonly motivo: string | null;
  readonly etapa: EtapaSesion | null;

  constructor(estado: number | null, detalle: DetalleError = {}) {
    super(detalle.codigo ?? "Error de la API");
    this.name = "ErrorApi";
    this.estado = estado;
    this.codigo = detalle.codigo ?? null;
    this.idSolicitud = detalle.idSolicitud ?? null;
    this.motivo = detalle.motivo ?? null;
    this.etapa = detalle.etapa ?? null;
  }

  /**
   * Código de referencia de W-31 («informe al administrador este código»). En los 5xx el
   * servidor manda un `ERR-xxxx` en `codigo`; en cualquier otro error no hay.
   */
  get idError(): string | null {
    if (this.estado === null || this.estado < 500 || this.codigo === null) return null;
    return /^ERR-[0-9A-Z]{4}$/.test(this.codigo) ? this.codigo : null;
  }
}

/** Reacciones globales a los errores que no dependen de la pantalla que hizo la llamada. */
export interface ManejadoresGlobales {
  /** 401 SESION_EXPIRADA. */
  alSinSesion?: () => void;
  /** 403 PERMISO_DENEGADO. */
  alSinPermiso?: () => void;
  /** 403 ETAPA_INVALIDA: falta un paso del inicio de sesión. Trae la etapa actual, si vino. */
  alEtapaInvalida?: (etapa: EtapaSesion | null) => void;
}

let manejadores: ManejadoresGlobales | null = null;

export function registrarManejadoresGlobales(nuevos: ManejadoresGlobales | null): void {
  manejadores = nuevos;
}

interface OpcionesSolicitud {
  metodo?: "GET" | "POST";
  cuerpo?: unknown;
  /** Consulta automática: no renueva la inactividad de la sesión (header X-Actividad-Pasiva: 1). */
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

function textoONulo(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function errorDesdeCuerpo(estado: number, cuerpo: unknown): ErrorApi {
  const detalle = (cuerpo as { error?: Record<string, unknown> } | null)?.error ?? {};
  return new ErrorApi(estado, {
    codigo: textoONulo(detalle.codigo),
    idSolicitud: textoONulo(detalle.id_solicitud),
    motivo: textoONulo(detalle.motivo),
    etapa: esEtapaSesion(detalle.etapa) ? detalle.etapa : null,
  });
}

async function solicitar<T>(ruta: string, opciones: OpcionesSolicitud = {}): Promise<T> {
  const { metodo = "GET", cuerpo, pasiva = false, global = true } = opciones;
  const headers: Record<string, string> = {};
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  if (pasiva) headers["X-Actividad-Pasiva"] = "1";

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
      if (error.codigo === CodigoErrorApi.SESION_EXPIRADA) {
        manejadores?.alSinSesion?.();
      } else if (error.codigo === CodigoErrorApi.PERMISO_DENEGADO) {
        manejadores?.alSinPermiso?.();
      } else if (error.codigo === CodigoErrorApi.ETAPA_INVALIDA) {
        manejadores?.alEtapaInvalida?.(error.etapa);
      }
    }
    throw error;
  }

  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

/** POST /auth/login. Deja la cookie puesta y responde la etapa que sigue. */
export function login(correo: string, contrasena: string): Promise<RespuestaEtapa> {
  // Los errores de aquí (AUTH_CREDENCIALES_INVALIDAS, AUTH_TEMPORAL_EXPIRADA y 429) los atiende
  // el formulario.
  return solicitar<RespuestaEtapa>("/auth/login", {
    metodo: "POST",
    cuerpo: { correo, contrasena },
    global: false,
  });
}

/**
 * GET /auth/sesion. Quién es el usuario, en qué etapa va y cómo va la inactividad. Sirve en
 * cualquier etapa. Quien llama decide qué hacer con un 401 (es lo normal si no hay sesión).
 */
export function obtenerSesion(opciones: { pasiva?: boolean } = {}): Promise<RespuestaSesion> {
  return solicitar<RespuestaSesion>("/auth/sesion", { ...opciones, global: false });
}

/**
 * POST /auth/logout. Cierra la sesión en el servidor y borra la cookie. Siempre responde 204,
 * incluso si la sesión ya había vencido. Funciona en cualquier etapa.
 */
export function cerrarSesionEnServidor(): Promise<void> {
  return solicitar<void>("/auth/logout", {
    metodo: "POST",
    cuerpo: { motivo: "manual" },
    global: false,
  });
}

export function fetchHealth(): Promise<HealthResponse> {
  return solicitar<HealthResponse>("/health");
}
