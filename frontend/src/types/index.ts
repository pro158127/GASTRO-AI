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

/** Por qué se envió una contraseña temporal (`motivo` de `credencial`). */
export type MotivoCredencial = "CREACION" | "RESTABLECIMIENTO" | "CAMBIO_CORREO";

/** Resultado del envío del correo con la contraseña temporal (`estado` de `credencial`). */
export type EstadoEnvioCredencial = "ENVIADO" | "FALLIDO";

/**
 * `credencial` de las rutas que generan una contraseña temporal (../ARCHITECTURE.md § 3.5,
 * «Usuarios»). **La contraseña temporal nunca viaja aquí**: solo va por correo.
 *
 * Con el correo caído, `estado` es `FALLIDO` y `codigo_error` es `CORREO_NO_ENVIADO`: la cuenta
 * queda creada igual y la interfaz ofrece reenviar (W-10d, RF-U05 CA 9).
 */
export interface Credencial {
  motivo: MotivoCredencial;
  estado: EstadoEnvioCredencial;
  intentado_en: string;
  codigo_error: string | null;
}

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
  /** Nombre visible del rol, tal como lo da el servidor («Doctor/Gastroenterólogo»). */
  rol_nombre: string;
  estado: EstadoUsuario;
  bloqueado: boolean;
  creado_en: string;
  activado_en: string | null;
  /** Solo en cuentas PENDIENTE. */
  estado_activacion?: EstadoActivacion | null;
  /** Solo en cuentas PENDIENTE. */
  temporal_expira_en?: string | null;
  /** Último envío de la contraseña temporal, o `null` si no hubo ninguno. */
  ultimo_envio?: Credencial | null;
}

/** Tipo de un traslado de casos (`tipo` de `ultimo_traslado`). */
export type TipoTraslado = "DESACTIVACION" | "ELIMINACION" | "REASIGNACION";

/** Persona de un traslado: se conserva el nombre aunque la cuenta se haya eliminado (RF-U11). */
export interface PersonaCuenta {
  nombre: string;
  apellido: string;
  cuenta_eliminada: boolean;
}

/** `ultimo_traslado` del detalle: el último movimiento de casos de esta cuenta, o `null`. */
export interface UltimoTrasladoCuenta {
  tipo: TipoTraslado;
  cantidad_casos: number;
  ejecutado_en: string;
  destino: PersonaCuenta;
}

/**
 * Respuesta de `GET /admin/usuarios/{id}` (W-11). Es `UsuarioResumen` con lo que solo existe en
 * el detalle (../ARCHITECTURE.md § 3.5, «Usuarios»).
 *
 * `bloqueado_en` solo viene con un bloqueo en curso y `desactivado_en` solo si está INACTIVO; los
 * dos salen de la bitácora. **La IP del bloqueo no viene aquí**: se consulta en la bitácora
 * filtrando por este usuario (consulta U-18 en CONTRATOS_API.md).
 *
 * `envios_credencial` es el historial de envíos de contraseña temporal, del más reciente al más
 * antiguo; `ultimo_envio` (heredado) es el primero de esa lista.
 *
 * Las acciones (`PATCH`, `/rol`, `/activar`, `/desbloquear`, `/restablecer-contrasena`) responden
 * `UsuarioResumen`, **no** este tipo: tras cada acción hay que volver a pedir el detalle.
 */
export interface UsuarioDetalle extends UsuarioResumen {
  /** Casos del doctor que siguen siendo suyos; 0 en los administradores. */
  casos_activos: number;
  totp_vinculado: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  bloqueado_en?: string | null;
  desactivado_en?: string | null;
  ultimo_traslado?: UltimoTrasladoCuenta | null;
  envios_credencial: Credencial[];
}

/**
 * Cuerpo de `PATCH /admin/usuarios/{id}` (W-11f, RF-U07 CA 4). El servidor solo cambia lo que
 * llega y lo compara con lo que ya tiene, así que mandar un valor igual al actual no hace nada.
 * `telefono: null` borra el teléfono. Cambiar el `correo` emite una contraseña temporal nueva al
 * correo nuevo y cierra las sesiones abiertas (CA 7).
 */
export interface EdicionUsuario {
  nombre: string;
  apellido: string;
  telefono: string | null;
  correo: string;
}

/** Respuesta de `POST /{id}/rol`, `/{id}/activar` y `/{id}/desbloquear`. */
export interface RespuestaUsuario {
  usuario: UsuarioResumen;
}

/**
 * Respuesta de `PATCH /admin/usuarios/{id}`. `credencial` **solo** viene si cambió el correo; un
 * 200 con `credencial.estado` FALLIDO significa que el correo quedó cambiado pero el aviso no
 * salió (ver `Credencial`).
 */
export interface RespuestaEdicion {
  usuario: UsuarioResumen;
  credencial?: Credencial | null;
}

/**
 * Cuerpo de `POST /admin/usuarios` (RF-U05). `telefono` es opcional: se omite cuando está vacío.
 * El servidor normaliza el correo a minúsculas y el teléfono sin separadores.
 */
export interface NuevoUsuario {
  nombre: string;
  apellido: string;
  correo: string;
  telefono?: string;
  rol: RolUsuario;
}

/**
 * Respuesta de `POST /admin/usuarios` (201) y de
 * `POST /admin/usuarios/{id}/reenviar-credencial`.
 */
export interface RespuestaCredencial {
  usuario: UsuarioResumen;
  credencial: Credencial;
}

/** Paginación de las listas: `?pagina&por_pagina` (máximo 100). */
export interface Paginacion {
  pagina: number;
  por_pagina: number;
  total: number;
}

/**
 * `conteos` de `GET /admin/usuarios`: resumen de **todas** las cuentas, sin importar los filtros
 * de la consulta (../ARCHITECTURE.md § 3.5, «Usuarios»).
 *
 * `pendientes` y `expiradas` son conjuntos distintos: «pendientes» son las de contraseña temporal
 * vigente y «expiradas» las de temporal vencida. Las dos tienen `estado: "PENDIENTE"`, así que las
 * cuentas pendientes de activación de W-20 son la suma de ambas.
 */
export interface ConteosUsuarios {
  activos: number;
  pendientes: number;
  expiradas: number;
  inactivos: number;
  bloqueadas: number;
  eliminadas: number;
}

/** Respuesta de `GET /admin/usuarios`. */
export interface PaginaUsuarios {
  items: UsuarioResumen[];
  paginacion: Paginacion;
  conteos: ConteosUsuarios;
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
