// Tipos del contrato de la API (../ARCHITECTURE.md § 3.5). Los campos JSON conservan los
// nombres que define el backend.

/** Etapas del inicio de sesión: cada una solo abre sus endpoints; el resto exige ACTIVA. */
export type EtapaSesion = "CAMBIO_CONTRASENA" | "VINCULAR_TOTP" | "PENDIENTE_2FA" | "ACTIVA";

/** Roles del backend, leídos de la base en cada petición. */
export type RolUsuario = "DOCTOR" | "ADMINISTRADOR";

/** `usuario` de `GET /auth/sesion`. */
export interface UsuarioActual {
  id: string;
  nombre: string;
  apellido: string;
  rol: RolUsuario;
}

/** Respuesta de `POST /auth/login`. */
export interface RespuestaEtapa {
  etapa: EtapaSesion;
}

/** Respuesta de `GET /auth/sesion`. `vence_en` es una fecha ISO 8601. */
export interface RespuestaSesion {
  etapa: EtapaSesion;
  vence_en: string;
  usuario: UsuarioActual;
}

/** Respuesta de `GET /health`. */
export interface HealthResponse {
  status: string;
  database: boolean;
}

/** Propuesta `GET /api/v1/casos-recibidos/resumen` (ver CONTRATOS_API.md). */
export interface ResumenCasosRecibidos {
  sin_revisar: number;
}
