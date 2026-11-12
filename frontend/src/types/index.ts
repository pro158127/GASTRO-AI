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
 * UTC) para el aviso (`aviso_en_s`) y el cierre (`cierre_en_s`). La usa el aviso de W-05
 * (ver `sesion/relojInactividad.ts`); los valores salen siempre del servidor.
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

/** Respuesta de `POST /auth/sesion/continuar` (W-05, «Seguir conectado»). */
export interface RespuestaContinuar {
  ultima_actividad_en: string;
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

/** `rol` de `GET /perfil`: el código y el nombre que se muestra («Doctor/Gastroenterólogo»). */
export interface RolPerfil {
  codigo: RolUsuario;
  nombre: string;
}

/** Respuesta de `GET /perfil` y `PATCH /perfil` (RF-U04). */
export interface Perfil {
  id: string;
  nombre: string;
  apellido: string;
  correo: string | null;
  telefono: string | null;
  rol: RolPerfil;
  estado: string;
  creado_en: string;
  totp_vinculado: boolean;
}

/**
 * Cuerpo de `PATCH /perfil`. Solo se editan nombre, apellido y teléfono; el correo y el rol
 * no se envían (solo los cambia el administrador). `telefono: null` borra el teléfono.
 */
export interface EdicionPerfil {
  nombre: string;
  apellido: string;
  telefono: string | null;
}

/** Estado de una cuenta (`estado` de los usuarios del administrador). */
export type EstadoUsuario = "PENDIENTE" | "ACTIVO" | "INACTIVO" | "ELIMINADO";

/** Solo en cuentas PENDIENTE: si la contraseña temporal sigue vigente o ya venció (RF-U06). */
export type EstadoActivacion = "PENDIENTE" | "EXPIRADA";

/**
 * `usuario` de las rutas `/admin/usuarios` (../ARCHITECTURE.md § 3.5, «Usuarios»). `bloqueado` va
 * aparte de `estado`: una cuenta ACTIVO puede estar bloqueada por intentos fallidos (RF-U12).
 * Contiene datos personales: no se registran ni se guardan fuera del estado de la pantalla.
 */
export interface UsuarioResumen {
  id: string;
  nombre: string;
  apellido: string;
  correo: string | null;
  telefono: string | null;
  rol: RolUsuario;
  estado: EstadoUsuario;
  bloqueado: boolean;
  creado_en: string;
  activado_en: string | null;
  /** Solo en cuentas PENDIENTE. */
  estado_activacion?: EstadoActivacion | null;
  /** Solo en cuentas PENDIENTE. */
  temporal_expira_en?: string | null;
}

/** Paginación de las listas: `?pagina&por_pagina` (máximo 100). */
export interface Paginacion {
  pagina: number;
  por_pagina: number;
  total: number;
}

/** Respuesta de `GET /admin/usuarios`. */
export interface PaginaUsuarios {
  items: UsuarioResumen[];
  paginacion: Paginacion;
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
