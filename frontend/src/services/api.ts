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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function login(
  email: string,
  password: string
): Promise<TokenResponse> {
  return request<TokenResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
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
