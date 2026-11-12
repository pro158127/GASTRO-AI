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

/** Respuesta de `POST /auth/totp/vincular` y `POST /auth/totp/verificar`: la sesión queda ACTIVA. */
export interface RespuestaIngreso {
  etapa: EtapaSesion;
  usuario: UsuarioActual;
  /** El frontend la ignora: navega por rol a `/dashboard`. */
  ruta_inicial: string;
}

/**
 * Inactividad de la sesión: segundos contados desde `ultima_actividad_en` (fecha ISO 8601 en
 * UTC) para el aviso del minuto 9 (`aviso_en_s`: 540) y el cierre (`cierre_en_s`: 600). W-05
 * la usará para el aviso de inactividad.
 */
export interface Inactividad {
  aviso_en_s: number;
  cierre_en_s: number;
  ultima_actividad_en: string;
}

/** Respuesta de `GET /auth/sesion`. */
export interface RespuestaSesion {
  etapa: EtapaSesion;
  usuario: UsuarioActual;
  inactividad: Inactividad;
}

/** Requisito de la política de contraseñas (`requisitos` de CONTRASENA_NO_CUMPLE_POLITICA). */
export interface RequisitoContrasena {
  codigo: string;
  cumple: boolean;
}

/** Campo con error del cuerpo de error (`campos`): `campo` es el nombre del campo del JSON. */
export interface CampoConError {
  campo: string;
  mensaje: string;
}

/** Respuesta de `GET /health`. */
export interface HealthResponse {
  status: "ok" | "degraded";
  database: "ok" | "error";
}

/** Propuesta `GET /api/v1/casos-recibidos/resumen` (ver CONTRATOS_API.md). */
export interface ResumenCasosRecibidos {
  sin_revisar: number;
}
