export type AnalisisEstado = "PROCESANDO" | "COMPLETADO" | "FALLIDO";

export interface Analisis {
  id: string;
  documento: string;
  tipo_documento: string;
  estado: AnalisisEstado;
  resultado?: Record<string, unknown> | null;
  explicacion?: string | null;
  error?: string | null;
  imagen_url?: string | null;
  grad_cam_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface HealthResponse {
  status: string;
  database: boolean;
  minio: boolean;
}

export interface AnalisisEvent {
  id: string;
  estado: AnalisisEstado;
  explicacion?: string;
}

/** Nombres de rol que guarda el backend (`seed.py`: admin, doctor, tecnico). */
export type RolBackend = "admin" | "doctor" | "tecnico";

/** Propuesta `GET /api/auth/me` (ver CONTRATOS_API.md). Los campos reflejan el modelo `User`. */
export interface UsuarioActual {
  full_name: string;
  email: string;
  role: RolBackend;
}

/** Propuesta `GET /api/casos-recibidos/resumen` (ver CONTRATOS_API.md). */
export interface ResumenCasosRecibidos {
  sin_revisar: number;
}
