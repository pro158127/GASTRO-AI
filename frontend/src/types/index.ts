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
