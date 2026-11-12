// Códigos de error de la API, tomados de la tabla de errores de ../ARCHITECTURE.md § 3.5.
// Es el único lugar donde se escriben: el resto del código usa `CodigoErrorApi.X`, nunca cadenas
// sueltas. En los 5xx el `codigo` no está aquí: es un `ERR-xxxx` genérico (ver `ErrorApi.idError`).
export const CodigoErrorApi = {
  PETICION_INVALIDA: "PETICION_INVALIDA",
  /** 401 · Sin cookie, sesión cerrada o vencida. Con `motivo: "INACTIVIDAD"` → W-01d. */
  SESION_EXPIRADA: "SESION_EXPIRADA",
  /** 401 · Login: correo o contraseña incorrectos, cuenta bloqueada, inactiva o eliminada. */
  AUTH_CREDENCIALES_INVALIDAS: "AUTH_CREDENCIALES_INVALIDAS",
  /** 401 (verificar) o 422 (vincular) · Código TOTP incorrecto, vencido o ya usado. */
  TOTP_CODIGO_INVALIDO: "TOTP_CODIGO_INVALIDO",
  /** 403 · Login con la temporal correcta pero vencida (72 h) → W-01e. */
  AUTH_TEMPORAL_EXPIRADA: "AUTH_TEMPORAL_EXPIRADA",
  /** 403 · Falta un paso del inicio de sesión; trae `etapa`. */
  ETAPA_INVALIDA: "ETAPA_INVALIDA",
  /** 403 · El rol no permite la acción → W-28. */
  PERMISO_DENEGADO: "PERMISO_DENEGADO",
  NO_ENCONTRADO: "NO_ENCONTRADO",
  METODO_NO_PERMITIDO: "METODO_NO_PERMITIDO",
  /** 409 · `/auth/totp/vincular` sin haber llamado `/auth/totp/iniciar`. */
  TOTP_NO_INICIADO: "TOTP_NO_INICIADO",
  ARCHIVO_DEMASIADO_GRANDE: "ARCHIVO_DEMASIADO_GRANDE",
  DATOS_INVALIDOS: "DATOS_INVALIDOS",
  /** 422 · W-02b: trae `campos` y `requisitos`. */
  CONTRASENA_NO_CUMPLE_POLITICA: "CONTRASENA_NO_CUMPLE_POLITICA",
  /** 429 · Límite por IP en login y códigos (10/min); trae `Retry-After`. */
  DEMASIADOS_INTENTOS: "DEMASIADOS_INTENTOS",
} as const;

export type CodigoErrorApi = (typeof CodigoErrorApi)[keyof typeof CodigoErrorApi];
