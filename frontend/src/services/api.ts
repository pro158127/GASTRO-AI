import type {
  Analisis,
  HealthResponse,
  TokenResponse,
} from "../types";

const TOKEN_KEY = "gastroai_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Error de una llamada a la API. `estado` es el código HTTP, o `null` si no hubo respuesta
 * (fallo de red). Las pantallas deciden el texto según `estado`; no muestran `message`.
 */
export class ErrorApi extends Error {
  readonly estado: number | null;

  constructor(estado: number | null, mensaje: string) {
    super(mensaje);
    this.name = "ErrorApi";
    this.estado = estado;
  }
}

let alVencerSesion: (() => void) | null = null;

/** Registra qué hacer cuando una llamada protegida responde 401 (token vencido o inválido). */
export function registrarAlVencerSesion(manejador: (() => void) | null): void {
  alVencerSesion = manejador;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  protegida = true
): Promise<T> {
  const token = protegida ? getToken() : null;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    throw new ErrorApi(null, "Sin conexión");
  }
  if (!res.ok) {
    if (res.status === 401 && protegida) {
      clearToken();
      alVencerSesion?.();
    }
    throw new ErrorApi(res.status, `${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function login(
  email: string,
  password: string
): Promise<TokenResponse> {
  return request<TokenResponse>(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    false
  );
}

export async function crearAnalisis(
  file: File,
  documento: string,
  tipoDocumento: string
): Promise<Analisis> {
  const form = new FormData();
  form.append("file", file);
  form.append("documento", documento);
  form.append("tipo_documento", tipoDocumento);
  return request<Analisis>("/api/analisis", { method: "POST", body: form });
}

export async function obtenerAnalisis(id: string): Promise<Analisis> {
  return request<Analisis>(`/api/analisis/${id}`);
}

export async function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}
