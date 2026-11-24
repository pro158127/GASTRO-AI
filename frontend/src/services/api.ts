// Cliente HTTP de la API (../ARCHITECTURE.md § 3.5). La sesión viaja en la cookie HttpOnly
// `gastro_sesion`: el frontend nunca la lee ni la guarda, y no hay header Authorization.
//
// **Este módulo solo entiende respuestas JSON.** Los dos transportes (`solicitarCompleta` con
// fetch y `enviarMultipart` con XMLHttpRequest) leen el cuerpo como JSON antes de pasárselo a
// `atenderRespuesta`, y un 2xx que no es 204 y no trae JSON se trata como error inesperado
// (W-31). El envío sí puede no ser JSON: por eso existe `enviarMultipart`.
//
// Consecuencia para quien venga después: un endpoint que devuelva otra cosa —el reporte en
// PDF (`/analisis/{id}/reporte`) o el CSV de la auditoría son los candidatos— necesita un
// transporte propio. Ese transporte debe seguir usando `atenderRespuesta` para los errores
// (el cuerpo de error sí es JSON) y quedarse solo con la lectura del cuerpo bueno; si no,
// se pierde el manejo global de sesión y permisos.
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

/**
 * Tamaño de una imagen en píxeles. Lo trae `minimo` en IMAGEN_RESOLUCION_INSUFICIENTE: el
 * lado mínimo lo dice el servidor, no una constante escrita en el frontend.
 */
export interface TamanoImagen {
  ancho: number;
  alto: number;
}

/** Datos del cuerpo de error `{error: {codigo, mensaje, id_solicitud, ...}}` que usa el frontend. */
interface DetalleError {
  codigo?: string | null;
  idSolicitud?: string | null;
  /** `motivo` de SESION_EXPIRADA (`INACTIVIDAD` o `DEMASIADOS_INTENTOS`, ver `MotivoSesionExpirada`). */
  motivo?: string | null;
  /** `etapa` de ETAPA_INVALIDA: la etapa actual de la sesión. */
  etapa?: EtapaSesion | null;
  /** `casos_activos` de DESTINO_REQUERIDO: cuántos casos activos tiene el doctor (D-02). */
  casosActivos?: number | null;
  /** Campos con error (por ejemplo `contrasena_nueva` o `confirmacion`). */
  campos?: CampoConError[];
  /** Requisitos de la política de contraseñas (CONTRASENA_NO_CUMPLE_POLITICA). */
  requisitos?: RequisitoContrasena[];
  /** `max_bytes` de IMAGEN_DEMASIADO_PESADA: el peso máximo que acepta el servidor. */
  maxBytes?: number | null;
  /** `permitidos` de IMAGEN_FORMATO_NO_PERMITIDO: los formatos que sí se aceptan. */
  permitidos?: string[];
  /** `minimo` de IMAGEN_RESOLUCION_INSUFICIENTE: el tamaño mínimo en píxeles. */
  minimo?: TamanoImagen | null;
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
  /**
   * Cuántos casos activos tiene el doctor, en el 409 DESTINO_REQUERIDO. Lo manda el servidor
   * junto al código para no tener que preguntarlo otra vez: es el número que dice D-02, y es el
   * número **de ahora**, que puede no ser el que se vio al abrir el detalle (RF-A06).
   */
  readonly casosActivos: number | null;
  readonly campos: CampoConError[];
  readonly requisitos: RequisitoContrasena[];
  /**
   * Peso máximo en bytes del 413 IMAGEN_DEMASIADO_PESADA (W-06d). Lo dice el servidor para
   * que el texto no repita un «10 MB» escrito aquí que mañana puede no ser cierto.
   */
  readonly maxBytes: number | null;
  /** Formatos aceptados del 415 IMAGEN_FORMATO_NO_PERMITIDO (W-06c); vacío si no vinieron. */
  readonly permitidos: string[];
  /** Tamaño mínimo del 422 IMAGEN_RESOLUCION_INSUFICIENTE, en píxeles. */
  readonly minimo: TamanoImagen | null;

  constructor(estado: number | null, detalle: DetalleError = {}) {
    super(detalle.codigo ?? "Error de la API");
    this.name = "ErrorApi";
    this.estado = estado;
    this.codigo = detalle.codigo ?? null;
    this.idSolicitud = detalle.idSolicitud ?? null;
    this.motivo = detalle.motivo ?? null;
    this.etapa = detalle.etapa ?? null;
    this.casosActivos = detalle.casosActivos ?? null;
    this.campos = detalle.campos ?? [];
    this.requisitos = detalle.requisitos ?? [];
    this.maxBytes = detalle.maxBytes ?? null;
    this.permitidos = detalle.permitidos ?? [];
    this.minimo = detalle.minimo ?? null;
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

/** Entero finito o `null`: un conteo que llegue como texto o como `NaN` no sirve para contar. */
function numeroONulo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
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

function esTexto(x: unknown): x is string {
  return typeof x === "string";
}

/** `{ancho, alto}` con los dos lados numéricos, o `null` si falta alguno o no son números. */
function tamanoONulo(valor: unknown): TamanoImagen | null {
  const t = valor as Partial<TamanoImagen> | null;
  const ancho = numeroONulo(t?.ancho);
  const alto = numeroONulo(t?.alto);
  return ancho === null || alto === null ? null : { ancho, alto };
}

function errorDesdeCuerpo(estado: number, cuerpo: unknown): ErrorApi {
  const detalle = (cuerpo as { error?: Record<string, unknown> } | null)?.error ?? {};
  return new ErrorApi(estado, {
    codigo: textoONulo(detalle.codigo),
    idSolicitud: textoONulo(detalle.id_solicitud),
    motivo: textoONulo(detalle.motivo),
    etapa: esEtapaSesion(detalle.etapa) ? detalle.etapa : null,
    casosActivos: numeroONulo(detalle.casos_activos),
    campos: listaDe(detalle.campos, esCampoConError),
    requisitos: listaDe(detalle.requisitos, esRequisito),
    // Los datos propios de cada error van al mismo nivel que `codigo`: el servidor hace
    // `cuerpo.update(extra)` (backend/app/core/errores.py), no los anida bajo `extra`.
    maxBytes: numeroONulo(detalle.max_bytes),
    permitidos: listaDe(detalle.permitidos, esTexto),
    minimo: tamanoONulo(detalle.minimo),
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

/**
 * Lo que cualquier transporte entrega cuando el servidor respondió, sea `fetch` o
 * `XMLHttpRequest`. Lo único que los diferencia es cómo llegan hasta aquí.
 */
interface RespuestaCruda {
  estado: number;
  ok: boolean;
  /** Cuerpo ya leído como JSON, o `null` si venía vacío o no era JSON (un 502 de nginx, un 204). */
  cuerpo: unknown;
  /** Cabecera `Date` tal cual la mandó el servidor, o `null` si no vino. */
  fechaCabecera: string | null;
  /** `performance.now()` en cuanto llegó la respuesta, antes de leer el cuerpo. */
  instanteRecibido: number;
}

/**
 * Único lugar donde una respuesta se convierte en datos o en `ErrorApi`. Lo usan los dos
 * transportes a propósito: así ningún camino nuevo puede saltarse los manejadores globales
 * (un 401 a mitad de una subida lleva al inicio de sesión igual que cualquier otra petición)
 * ni equivocarse sobre si la petición renueva la inactividad de la sesión.
 */
function atenderRespuesta<T>(
  cruda: RespuestaCruda,
  opciones: { pasiva: boolean; global: boolean },
  instanteEnvio: number
): RespuestaCompleta<T> {
  if (!cruda.ok) {
    const error = errorDesdeCuerpo(cruda.estado, cruda.cuerpo);
    if (opciones.global) {
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

  const fecha = Date.parse(cruda.fechaCabecera ?? "");
  if (!opciones.pasiva) manejadores?.alActividadRenovada?.(instanteEnvio);

  // Un 2xx que no es 204 y cuyo cuerpo no se pudo leer como JSON está fuera del contrato:
  // se trata como error inesperado (W-31) en vez de devolver `null` y romper a quien llamó.
  if (cruda.estado !== 204 && cruda.cuerpo === null) throw new ErrorApi(cruda.estado);

  const datos = cruda.estado === 204 ? (undefined as T) : (cruda.cuerpo as T);
  return {
    datos,
    fechaServidorMs: Number.isNaN(fecha) ? null : fecha,
    instanteRecibido: cruda.instanteRecibido,
  };
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
  const instanteRecibido = performance.now();

  return atenderRespuesta<T>(
    {
      estado: respuesta.status,
      ok: respuesta.ok,
      cuerpo: await leerCuerpoJson(respuesta),
      fechaCabecera: respuesta.headers.get("Date"),
      instanteRecibido,
    },
    { pasiva, global },
    instanteEnvio
  );
}

export interface OpcionesMultipart {
  /**
   * Avance de la subida, de 0 a 1. Solo se llama cuando el navegador puede calcular el
   * total: sin eso no se inventa un porcentaje y la pantalla muestra el texto sin número.
   */
  alProgreso?: (fraccion: number) => void;
  /** Si es `false`, el error no dispara los manejadores globales (lo atiende quien llama). */
  global?: boolean;
}

/**
 * Tiempo límite de una subida, de principio a fin: `XMLHttpRequest.timeout` no mide inactividad,
 * mide la petición entera, así que tiene que cubrir el caso lento legítimo.
 *
 * Cinco minutos. El tope de subida son 10 MB, que por una conexión móvil mala de unos 300 kbps
 * tardan algo más de cuatro minutos; cortar antes sería cortar subidas válidas. Y pasarse
 * tampoco sirve: la sesión se cierra por inactividad a los 10 minutos y una subida solo cuenta
 * como actividad cuando termina, así que esperar más llevaría a una sesión que ya no existe.
 *
 * Lo que esto evita es el cuelgue eterno: sin `timeout`, el valor por omisión de XHR es 0 —sin
 * límite— y una subida que se queda a medias deja la pantalla en «Subiendo… N %» para siempre.
 * Al agotarse, `ontimeout` lanza el mismo `ErrorApi(null)` que un fallo de red, que las
 * pantallas muestran como W-30 con su «intente de nuevo».
 */
const TIEMPO_LIMITE_SUBIDA_MS = 5 * 60 * 1000;

/**
 * POST multipart con la cookie de sesión, para `POST /imagenes` (W-06f).
 *
 * Va por `XMLHttpRequest` y no por `fetch` por una sola razón: `fetch` no informa del avance
 * de la subida, y W-06f muestra el porcentaje. **El transporte es lo único que cambia**: la
 * respuesta la trata `atenderRespuesta`, igual que las peticiones JSON, así que un 401 a
 * mitad de la subida lleva al inicio de sesión como cualquier otra petición y el 2xx renueva
 * la inactividad (subir una imagen es una acción del usuario, nunca una consulta automática:
 * por eso aquí no hay `pasiva`).
 *
 * No se fija `Content-Type`: lo pone el navegador con el `boundary` del FormData. Tampoco se
 * toca `withCredentials`, que solo afecta a peticiones de otro origen; la cookie
 * `gastro_sesion` viaja sola por ser del mismo origen, igual que con `credentials:
 * "same-origin"`.
 */
export function enviarMultipart<T>(
  ruta: string,
  formulario: FormData,
  opciones: OpcionesMultipart = {}
): Promise<T> {
  const { alProgreso, global = true } = opciones;
  return new Promise<T>((resolver, rechazar) => {
    const instanteEnvio = performance.now();
    const peticion = new XMLHttpRequest();
    peticion.open("POST", `${BASE}${ruta}`);
    peticion.responseType = "text";
    // Después de `open`: antes, algunos navegadores lo descartan.
    peticion.timeout = TIEMPO_LIMITE_SUBIDA_MS;

    if (alProgreso) {
      peticion.upload.onprogress = (evento) => {
        if (evento.lengthComputable && evento.total > 0) alProgreso(evento.loaded / evento.total);
      };
    }

    // Sin respuesta del servidor (red caída, tiempo agotado, cancelado): el mismo error que
    // lanza el `catch` del `fetch`, para que `avisoDeError` lo lea como W-30.
    const alFallar = () => rechazar(new ErrorApi(null));
    peticion.onerror = alFallar;
    peticion.ontimeout = alFallar;
    peticion.onabort = alFallar;

    peticion.onload = () => {
      const instanteRecibido = performance.now();
      // `status === 0` es «no hubo respuesta», no un código HTTP.
      if (peticion.status === 0) {
        alFallar();
        return;
      }
      let cuerpo: unknown = null;
      try {
        cuerpo = JSON.parse(peticion.responseText) as unknown;
      } catch {
        cuerpo = null;
      }
      try {
        resolver(
          atenderRespuesta<T>(
            {
              estado: peticion.status,
              ok: peticion.status >= 200 && peticion.status < 300,
              cuerpo,
              fechaCabecera: peticion.getResponseHeader("Date"),
              instanteRecibido,
            },
            { pasiva: false, global },
            instanteEnvio
          ).datos
        );
      } catch (error) {
        rechazar(error);
      }
    };

    peticion.send(formulario);
  });
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
