// Cliente HTTP de la API (../ARCHITECTURE.md § 3.5). La sesión viaja en la cookie HttpOnly
// `gastro_sesion`: el frontend nunca la lee ni la guarda, y no hay header Authorization.
import type {
  CampoConError,
  EdicionPerfil,
  EtapaSesion,
  HealthResponse,
  Perfil,
  RequisitoContrasena,
  RespuestaContinuar,
  RespuestaEtapa,
  RespuestaIngreso,
  RespuestaSesion,
} from "../types";
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
  /** `motivo` de SESION_EXPIRADA (`INACTIVIDAD` o `DEMASIADOS_INTENTOS`, ver `MotivoSesionExpirada`). */
  motivo?: string | null;
  /** `etapa` de ETAPA_INVALIDA: la etapa actual de la sesión. */
  etapa?: EtapaSesion | null;
  /** Campos con error (por ejemplo `contrasena_nueva` o `confirmacion`). */
  campos?: CampoConError[];
  /** Requisitos de la política de contraseñas (CONTRASENA_NO_CUMPLE_POLITICA). */
  requisitos?: RequisitoContrasena[];
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
  readonly campos: CampoConError[];
  readonly requisitos: RequisitoContrasena[];

  constructor(estado: number | null, detalle: DetalleError = {}) {
    super(detalle.codigo ?? "Error de la API");
    this.name = "ErrorApi";
    this.estado = estado;
    this.codigo = detalle.codigo ?? null;
    this.idSolicitud = detalle.idSolicitud ?? null;
    this.motivo = detalle.motivo ?? null;
    this.etapa = detalle.etapa ?? null;
    this.campos = detalle.campos ?? [];
    this.requisitos = detalle.requisitos ?? [];
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
  /**
   * 401 SESION_EXPIRADA. Trae el `motivo`, si vino (`INACTIVIDAD` o `DEMASIADOS_INTENTOS`, ver
   * `MotivoSesionExpirada`).
   */
  alSinSesion?: (motivo: string | null) => void;
  /** 403 PERMISO_DENEGADO. */
  alSinPermiso?: () => void;
  /** 403 ETAPA_INVALIDA: falta un paso del inicio de sesión. Trae la etapa actual, si vino. */
  alEtapaInvalida?: (etapa: EtapaSesion | null) => void;
  /**
   * Respuesta 2xx de una petición NO pasiva: el servidor renovó la inactividad de la sesión.
   * Trae el instante de envío (`performance.now()`): el servidor renovó entre el envío y la
   * respuesta, así que contar desde el envío nunca da más tiempo del que queda.
   */
  alActividadRenovada?: (instanteEnvio: number) => void;
}

let manejadores: ManejadoresGlobales | null = null;

export function registrarManejadoresGlobales(nuevos: ManejadoresGlobales | null): void {
  manejadores = nuevos;
}

export interface OpcionesSolicitud {
  metodo?: "GET" | "POST" | "PATCH";
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

function listaDe<T>(valor: unknown, esElemento: (x: unknown) => x is T): T[] {
  return Array.isArray(valor) ? valor.filter(esElemento) : [];
}

function esCampoConError(x: unknown): x is CampoConError {
  const c = x as Partial<CampoConError> | null;
  return typeof c?.campo === "string" && typeof c?.mensaje === "string";
}

function esRequisito(x: unknown): x is RequisitoContrasena {
  const r = x as Partial<RequisitoContrasena> | null;
  return typeof r?.codigo === "string" && typeof r?.cumple === "boolean";
}

function errorDesdeCuerpo(estado: number, cuerpo: unknown): ErrorApi {
  const detalle = (cuerpo as { error?: Record<string, unknown> } | null)?.error ?? {};
  return new ErrorApi(estado, {
    codigo: textoONulo(detalle.codigo),
    idSolicitud: textoONulo(detalle.id_solicitud),
    motivo: textoONulo(detalle.motivo),
    etapa: esEtapaSesion(detalle.etapa) ? detalle.etapa : null,
    campos: listaDe(detalle.campos, esCampoConError),
    requisitos: listaDe(detalle.requisitos, esRequisito),
  });
}

/** Cuerpo de la respuesta junto con lo que hace falta para medir el tiempo con el reloj del servidor. */
interface RespuestaCompleta<T> {
  datos: T;
  /** Cabecera `Date` en milisegundos (reloj del servidor), o `null` si no vino o no se entiende. */
  fechaServidorMs: number | null;
  /** `performance.now()` al recibir la respuesta. */
  instanteRecibido: number;
}

async function solicitarCompleta<T>(
  ruta: string,
  opciones: OpcionesSolicitud = {}
): Promise<RespuestaCompleta<T>> {
  const { metodo = "GET", cuerpo, pasiva = false, global = true } = opciones;
  const headers: Record<string, string> = {};
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  if (pasiva) headers["X-Actividad-Pasiva"] = "1";

  const instanteEnvio = performance.now();
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
        manejadores?.alSinSesion?.(error.motivo);
      } else if (error.codigo === CodigoErrorApi.PERMISO_DENEGADO) {
        manejadores?.alSinPermiso?.();
      } else if (error.codigo === CodigoErrorApi.ETAPA_INVALIDA) {
        manejadores?.alEtapaInvalida?.(error.etapa);
      }
    }
    throw error;
  }

  const instanteRecibido = performance.now();
  const fecha = Date.parse(respuesta.headers.get("Date") ?? "");
  if (!pasiva) manejadores?.alActividadRenovada?.(instanteEnvio);

  const datos = respuesta.status === 204 ? (undefined as T) : ((await respuesta.json()) as T);
  return { datos, fechaServidorMs: Number.isNaN(fecha) ? null : fecha, instanteRecibido };
}

/**
 * Llamada a la API con la cookie de sesión. La usan los demás módulos de `src/services/`; los
 * componentes nunca la llaman directamente.
 */
export async function solicitar<T>(ruta: string, opciones: OpcionesSolicitud = {}): Promise<T> {
  return (await solicitarCompleta<T>(ruta, opciones)).datos;
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

/** GET /auth/sesion con lo necesario para medir la inactividad con el reloj del servidor. */
export interface ConsultaSesion {
  sesion: RespuestaSesion;
  /** Cabecera `Date` en milisegundos, o `null` si no vino. */
  fechaServidorMs: number | null;
  /** `performance.now()` al recibir la respuesta. */
  instanteRecibido: number;
}

/**
 * GET /auth/sesion. Quién es el usuario, en qué etapa va y cómo va la inactividad. Sirve en
 * cualquier etapa. Quien llama decide qué hacer con un 401 (es lo normal si no hay sesión).
 * Las consultas automáticas van con `pasiva: true` para no renovar la sesión.
 */
export async function obtenerSesion(opciones: { pasiva?: boolean } = {}): Promise<ConsultaSesion> {
  const { datos, fechaServidorMs, instanteRecibido } = await solicitarCompleta<RespuestaSesion>(
    "/auth/sesion",
    { ...opciones, global: false }
  );
  return { sesion: datos, fechaServidorMs, instanteRecibido };
}

/**
 * POST /auth/sesion/continuar (W-05, «Seguir conectado»). Solo en la etapa ACTIVA. Renueva la
 * inactividad como cualquier petición no pasiva; los errores van a los manejadores globales.
 */
export function continuarSesion(): Promise<RespuestaContinuar> {
  return solicitar<RespuestaContinuar>("/auth/sesion/continuar", { metodo: "POST" });
}

/**
 * POST /auth/contrasena/cambiar (W-02). Cambio obligatorio de la contraseña temporal. Responde
 * la etapa que sigue (`VINCULAR_TOTP` o `PENDIENTE_2FA`). 422 CONTRASENA_NO_CUMPLE_POLITICA trae
 * `campos` y `requisitos`.
 */
export function cambiarContrasena(contrasenaNueva: string, confirmacion: string): Promise<RespuestaEtapa> {
  return solicitar<RespuestaEtapa>("/auth/contrasena/cambiar", {
    metodo: "POST",
    cuerpo: { contrasena_nueva: contrasenaNueva, confirmacion },
  });
}

/** Lo que W-03 muestra para vincular la app. Es un secreto: no se guarda ni se escribe en consola. */
export interface VinculacionTotp {
  /** Clave en grupos de 4 para «¿No puede escanear?». */
  secretoManual: string;
  /** PNG en Base64, SIN el prefijo `data:`. Validar con `urlDeQrPng` antes de mostrarlo. */
  qrPngBase64: string;
}

/**
 * POST /auth/totp/iniciar (W-03). Genera un secreto NUEVO cada vez que se llama (mientras no esté
 * vinculado): no se debe llamar dos veces para una misma pantalla. `otpauth_uri` también contiene
 * el secreto, así que se descarta aquí y no sale de esta función.
 */
export async function iniciarVinculacionTotp(): Promise<VinculacionTotp> {
  const respuesta = await solicitar<{ secreto_manual: string; qr_png_base64: string }>(
    "/auth/totp/iniciar",
    { metodo: "POST" }
  );
  return { secretoManual: respuesta.secreto_manual, qrPngBase64: respuesta.qr_png_base64 };
}

/**
 * POST /auth/totp/vincular (W-03). Primer código válido: la app queda vinculada y la sesión,
 * ACTIVA. 422 TOTP_CODIGO_INVALIDO si el código no corresponde; 409 TOTP_NO_INICIADO si no se
 * llamó antes a /totp/iniciar.
 */
export function vincularTotp(codigo: string): Promise<RespuestaIngreso> {
  return solicitar<RespuestaIngreso>("/auth/totp/vincular", { metodo: "POST", cuerpo: { codigo } });
}

/**
 * POST /auth/totp/verificar (W-04). Código en cada ingreso de una cuenta con la app ya vinculada.
 * 401 TOTP_CODIGO_INVALIDO si es incorrecto, vencido o ya usado.
 */
export function verificarTotp(codigo: string): Promise<RespuestaIngreso> {
  return solicitar<RespuestaIngreso>("/auth/totp/verificar", { metodo: "POST", cuerpo: { codigo } });
}

/**
 * POST /auth/logout. Cierra la sesión en el servidor y borra la cookie. Siempre responde 204,
 * incluso si la sesión ya había vencido. Funciona en cualquier etapa. `motivo` queda en la
 * bitácora: `inactividad` cuando lo cierra el aviso de W-05.
 */
export function cerrarSesionEnServidor(motivo: "manual" | "inactividad" = "manual"): Promise<void> {
  return solicitar<void>("/auth/logout", {
    metodo: "POST",
    cuerpo: { motivo },
    global: false,
  });
}

/** GET /perfil (W-18). Datos del propio usuario; cualquier rol. Contiene datos personales: no se registran. */
export function obtenerPerfil(): Promise<Perfil> {
  return solicitar<Perfil>("/perfil");
}

/**
 * PATCH /perfil (W-18). Envía solo `{nombre, apellido, telefono}`; nunca el correo ni el rol.
 * Responde el perfil con los valores normalizados (por ejemplo, el teléfono sin espacios).
 * 422 DATOS_INVALIDOS trae `campos` (`nombre`, `apellido` o `telefono`).
 */
export function actualizarPerfil(edicion: EdicionPerfil): Promise<Perfil> {
  const { nombre, apellido, telefono } = edicion;
  return solicitar<Perfil>("/perfil", {
    metodo: "PATCH",
    cuerpo: { nombre, apellido, telefono },
  });
}

export function fetchHealth(): Promise<HealthResponse> {
  return solicitar<HealthResponse>("/health");
}
