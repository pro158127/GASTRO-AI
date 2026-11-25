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

/**
 * Un rol de `GET /catalogos/roles` (consulta U-16, resuelta). `nombre` es el mismo texto que
 * viaja como `rol_nombre` en `/admin/usuarios`: sale de la base, no de una tabla del frontend.
 */
export interface RolCatalogo {
  codigo: RolUsuario;
  nombre: string;
}

/** Respuesta de `GET /catalogos/roles`. */
export interface ListaRoles {
  items: RolCatalogo[];
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
 * El `traslado` que devuelven una baja y una reasignación (../ARCHITECTURE.md § 3.5): el
 * identificador del movimiento, su tipo y cuántos **casos** se movieron. No trae el destino ni la
 * fecha; eso es `ultimo_traslado` del detalle.
 */
export interface TrasladoResumen {
  id: string;
  tipo: TipoTraslado;
  casos_trasladados: number;
}

/**
 * Respuesta de `POST /{id}/desactivar` y `POST /{id}/eliminar` (D-01, D-08). `traslado` es `null`
 * cuando la cuenta no tenía casos activos, que desde el frontend es siempre: nunca se manda
 * `destino_id` en una baja, porque reasignar es un paso propio y visible (W-25).
 */
export interface RespuestaBaja {
  usuario: UsuarioResumen;
  traslado?: TrasladoResumen | null;
}

/** Respuesta de `POST /{id}/reasignar-casos` (W-25 → D-10). Aquí el traslado siempre existe. */
export interface RespuestaTraslado {
  traslado: TrasladoResumen;
}

/**
 * Un análisis de un caso activo (W-25, paso 2). Solo el código y la fecha: nada clínico ni del
 * paciente (RF-A06 CA 2). El servidor no entrega nada más.
 */
export interface AnalisisCasoActivo {
  id: string;
  codigo: string;
  solicitado_en: string;
}

/** Un caso activo del doctor, con sus análisis. */
export interface CasoActivoDoctor {
  caso_id: string;
  analisis: AnalisisCasoActivo[];
}

/**
 * Respuesta de `GET /admin/usuarios/{id}/casos-activos` (W-25). Sin paginación: vienen todos.
 * `total_casos` es el mismo número que `UsuarioDetalle.casos_activos` y que el `casos_activos` del
 * 409 DESTINO_REQUERIDO; `total_analisis` puede ser mayor, porque un caso puede tener varios.
 */
export interface CasosActivosDoctor {
  total_casos: number;
  total_analisis: number;
  casos: CasoActivoDoctor[];
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

// ---------------------------------------------------- Imagen, paciente y análisis (W-06, W-07)
// ../ARCHITECTURE.md § 3.5, «Paciente y documento» e «Imagen y análisis». Ningún tipo de salida
// lleva el documento ni el seudónimo del paciente: el documento solo viaja en el cuerpo de un
// POST y en el frontend vive únicamente en el estado de la pantalla.

/** Un tipo de documento de `GET /catalogos/tipos-documento` (W-06a). */
export interface TipoDocumento {
  codigo: string;
  /** Nombre visible, como lo da el servidor («Cédula de ciudadanía»). */
  nombre: string;
  /** Dígitos que acepta el servidor para este tipo (CC 10, TI 11, CE 6). */
  longitud_maxima: number;
}

/** Respuesta de `GET /catalogos/tipos-documento`. */
export interface ListaTiposDocumento {
  items: TipoDocumento[];
}

/**
 * Respuesta de `POST /pacientes/consulta` (W-06h). Solo cuenta los casos **de quien pregunta**
 * (propios o recibidos por traslado): no revela si el paciente tiene análisis con otro doctor
 * (RF-H01 CA 5). Por eso los textos dicen «con usted» y no «en el sistema».
 */
export interface HistorialPaciente {
  tiene_historial: boolean;
  caso_id: string | null;
  total_analisis: number;
  ultimo_analisis_en: string | null;
}

/**
 * Respuesta 201 de `POST /imagenes` (W-06g). La imagen queda en un área temporal que **vence**
 * (`expira_en`) y cada `imagen_id` sirve una sola vez: después, `POST /analisis` responde 410
 * IMAGEN_EXPIRADA y hay que cargarla de nuevo.
 */
export interface ImagenCargada {
  imagen_id: string;
  /** Nombre del archivo que mandó el navegador; el servidor lo devuelve pero no lo guarda. */
  nombre: string;
  formato: string;
  ancho: number;
  alto: number;
  peso_bytes: number;
  sha256: string;
  expira_en: string;
}

/** Cuerpo de `POST /analisis` (W-06). */
export interface SolicitudAnalisis {
  imagen_id: string;
  tipo_documento: string;
  numero_documento: string;
  /**
   * El número escrito por segunda vez. Solo hace falta cuando `/pacientes/consulta` dijo
   * `tiene_historial: false` (RF-D01 CA 12, W-06i a W-06k); con historial se omite.
   */
  confirmacion_documento?: string;
}

/** Estado de un análisis (`EstadoAnalisis` del backend). */
export type EstadoAnalisis = "PROCESANDO" | "COMPLETADO" | "FALLIDO";

/** `analisis` del 202 de `POST /analisis` y de `POST /analisis/{id}/reintento`. */
export interface AnalisisResumen {
  id: string;
  /** `A-AAAA-NNNNNN`, el código que ve la persona. */
  codigo: string;
  estado: EstadoAnalisis;
  solicitado_en: string;
}

/** Respuesta de `POST /analisis` y de `POST /analisis/{id}/reintento`. */
export interface AnalisisCreado {
  analisis: AnalisisResumen;
}

/** Las cuatro etapas que pinta W-07 (`EtapaProceso` del backend). */
export type CodigoEtapa = "ANONIMIZAR" | "CALIDAD" | "CLASIFICAR" | "GRAD_CAM";

/** Estado de una etapa. W-07 lo dice siempre en texto, no solo con el ícono (WCAG 1.4.1). */
export type EstadoEtapa = "LISTO" | "EN_CURSO" | "PENDIENTE" | "ERROR";

/** Una entrada de `etapas`. `codigo` llega como texto: el servidor puede añadir etapas. */
export interface EtapaAnalisis {
  codigo: string;
  estado: EstadoEtapa;
}

/** Causas de calidad insuficiente (`CausaCalidad` del backend) → los tres textos de W-07b. */
export type CausaCalidad = "BORROSA" | "OSCURA" | "MUY_CLARA_O_REFLEJOS";

/**
 * `calidad` del análisis FALLIDO por `ERR-1001`. Las medidas las calcula el servidor con los
 * umbrales de RF-D02 CA 8; el frontend solo nombra las `causas`, nunca recalcula nada.
 */
export interface CalidadImagen {
  suficiente: boolean | null;
  causas: string[];
  nitidez?: number | null;
  brillo?: number | null;
  saturados_pct?: number | null;
}

/** Respuesta de `GET /analisis/{id}/estado` (W-07). Lo que no aplica al estado no se manda. */
export interface EstadoAnalisisRespuesta {
  estado: EstadoAnalisis;
  etapas: EtapaAnalisis[];
  /**
   * Solo en FALLIDO: `ERR-1001` calidad insuficiente (W-07b), `ERR-1002` servicio de inferencia
   * no disponible (W-07c), `ERR-1003` cola no disponible, `ERR-1004` error interno.
   */
  codigo_error?: string | null;
  /** Solo en FALLIDO por calidad (`ERR-1001`) → W-07b. */
  calidad?: CalidadImagen | null;
  /**
   * Solo en COMPLETADO. Es la ruta **de la API** (`/api/v1/analisis/{id}`), no una ruta de la
   * interfaz: la navegación del frontend no sale de aquí.
   */
  resultado_url?: string | null;
}

// --------------------------------------------- Detalle del resultado (W-08, W-08b, W-17b)
// `GET /analisis/{id}` → `AnalisisSalida` (../ARCHITECTURE.md § 3.5).
//
// **Dos escalas distintas en la misma respuesta.** `probabilidad`, `umbral_aplicado`,
// `confianza` y las cuatro medidas de `caja` van de 0 a 1; `area_porcentaje` va de 0 a 100
// (la base de datos lo obliga: `caja_* BETWEEN 0 AND 1` y `area_porcentaje BETWEEN 0 AND
// 100`). Por eso `src/utils/numeros.ts` tiene dos funciones y no una.

/** Modelo que produjo el resultado. `revision_corta` son los 7 primeros del sha (RNF-25). */
export interface ModeloUsado {
  repositorio_hf: string;
  revision_sha: string;
  revision_corta: string;
}

/** La imagen del análisis, ya anonimizada. `url` es firmada y vence a los 5 minutos. */
export interface ImagenAnalisis {
  url: string;
  formato: string;
  ancho: number;
  alto: number;
}

/**
 * Mapa de calor principal: el de la primera región de la característica más probable. Llega
 * `null` exactamente cuando `regiones` está vacío, que es el caso de W-08b.
 */
export interface MapaCalor {
  url: string;
  /**
   * Texto del servidor que aclara que Grad-CAM es una visualización y no una segmentación
   * clínica. **Se pinta tal cual**, junto al mapa: es una advertencia sobre el modelo, no
   * texto de interfaz, y si cambia con una revisión cambia en el servidor sin tocar el
   * frontend. Es la excepción a `CLAUDE.md` § 7; lo decidió Mónica.
   */
  aviso: string;
}

/** Una característica evaluada, con la probabilidad y el umbral que se le aplicó. */
export interface CaracteristicaResultado {
  id: number;
  codigo: string;
  nombre: string;
  /** 0 a 1. */
  probabilidad: number;
  /**
   * 0 a 1. **Es el umbral del momento en que se hizo el análisis, no el de hoy**
   * (RF-A01 CA 2): nunca se presenta como «el umbral actual».
   */
  umbral_aplicado: number;
  supera_umbral: boolean;
}

/** Caja normalizada (0 a 1) de una región. Figma no la dibuja sobre la imagen. */
export interface CajaRegion {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Una región de interés. Solo llegan las de las características que superan el umbral. */
export interface RegionInteres {
  orden: number;
  caracteristica_id: number;
  caja: CajaRegion;
  /** 0 a 100. */
  area_porcentaje: number;
  /**
   * 0 a 1. **Es la misma `probabilidad` de su característica, copiada por el servidor**, no
   * una segunda medición. No se muestra: repetir el número con otro nombre haría creer que
   * son dos medidas que coinciden.
   */
  confianza: number;
  mapa_calor_url: string;
}

/**
 * Los cuatro estados de la explicación (`EstadoExplicacion` del backend,
 * `backend/app/models/analisis.py`). No hay más.
 */
export type EstadoExplicacion = "PENDIENTE" | "GENERADA" | "FALLIDA" | "RECHAZADA";

/** Explicación del LLM tal como viene dentro de `GET /analisis/{id}`. */
export interface ExplicacionAnalisis {
  estado: EstadoExplicacion;
  texto: string | null;
  generada_en: string | null;
  intentos: number;
}

/**
 * Respuesta de `GET /analisis/{id}/explicacion` (W-08c, W-08d).
 *
 * El endpoint usa `response_model_exclude_none=True`: **los campos nulos no vienen en el
 * JSON**, así que aquí son opcionales de verdad. Si todavía no hay fila de explicación, la
 * respuesta es `{estado: "PENDIENTE"}` a secas.
 */
export interface ExplicacionEstado {
  estado: EstadoExplicacion;
  texto?: string | null;
  generada_en?: string | null;
  /** `ERR-3001` (no disponible) o `ERR-3002` (texto rechazado). No se le muestra a la persona. */
  codigo_error?: string | null;
  /**
   * Mensaje estándar de indisponibilidad (RF-R05 CA 5). Solo llega en FALLIDA y RECHAZADA.
   * **Se pinta tal cual**, como `MapaCalor.aviso`: lo escribe el servidor, no el frontend.
   */
  mensaje?: string | null;
  intentos: number;
  /**
   * Lo calcula el servidor (`estado ∈ (FALLIDA, RECHAZADA)` y `intentos < 3`). **Es lo que
   * habilita el botón «Reintentar»**; el frontend no repite esa cuenta.
   */
  puede_reintentar: boolean;
}

/** Respuesta de `POST /analisis/{id}/explicacion/reintentar` (202). */
export interface ExplicacionReintentada {
  estado: EstadoExplicacion;
  intentos: number;
}

/** Las tres valoraciones posibles (`Valoracion` del backend). */
export type Valoracion = "COINCIDE" | "NO_COINCIDE" | "NO_CONCLUYENTE";

/** Tope de `texto` en una observación (`TEXTO_OBSERVACION_MAXIMO` del backend). */
export const TEXTO_OBSERVACION_MAXIMO = 2000;

/** Cuerpo de `POST /analisis/{id}/observaciones`. */
export interface ObservacionEntrada {
  valoracion: Valoracion;
  texto?: string;
}

/** La observación tal como la devuelve el 201. El autor trae `id`, a diferencia del detalle. */
export interface ObservacionGuardada {
  id: string;
  valoracion: Valoracion;
  texto: string | null;
  autor: { id: string; nombre: string; apellido: string };
  registrada_en: string;
}

/** Respuesta de `POST /analisis/{id}/observaciones` (201). */
export interface ObservacionCreada {
  observacion: ObservacionGuardada;
}

// ------------------------------------------------------------ Historial (W-16, contrato §4)
// Dos endpoints con la misma fila: `GET /analisis` («Mis análisis») y
// `POST /pacientes/analisis/buscar` («Buscar por paciente»).
//
// **`GET /analisis` nunca lleva datos del paciente**: lo dice su docstring en el backend.
// Ninguna de las dos respuestas trae documento ni seudónimo.

/** `origen` de «Mis análisis» (RF-A07 CA 5). Van en minúscula: es un `StrEnum` del backend. */
export type OrigenHistorial = "todos" | "propios" | "recibidos";

/** `orden` de las dos consultas. Con «-» delante, del más reciente al más antiguo. */
export type OrdenHistorial = "solicitado_en" | "-solicitado_en";

/** Quién hizo el análisis, en una fila del historial. */
export interface RealizadoPorResumen {
  nombre: string;
  apellido: string;
  /** «(cuenta eliminada)» junto al nombre (RF-A07 CA 4). */
  cuenta_eliminada: boolean;
}

/** Una fila de «Mis análisis» o de «Buscar por paciente». */
export interface FilaHistorial {
  id: string;
  codigo: string;
  solicitado_en: string;
  estado: EstadoAnalisis;
  /** Nombres de las que superan el umbral, de mayor a menor probabilidad. */
  caracteristicas_que_superan: string[];
  /** `null` significa «sin característica sobre el umbral»; no se pinta en blanco. */
  caracteristica_principal: string | null;
  /** 0 a 1, como el resto de probabilidades de la API. */
  probabilidad_principal: number | null;
  /** La del doctor que consulta, no la de otros. */
  tiene_observacion: boolean;
  observacion: string | null;
  modelo_revision: string;
  /** Lo hizo otro doctor y llegó por traslado (RF-A07 CA 5). */
  trasladado: boolean;
  realizado_por: RealizadoPorResumen;
}

/** Respuesta de `GET /analisis`. */
export interface PaginaHistorial {
  items: FilaHistorial[];
  paginacion: Paginacion;
}

/**
 * Respuesta de `POST /pacientes/analisis/buscar`: lo mismo más los casos del paciente.
 *
 * Un paciente ajeno o inexistente responde **200 con `items: []`**, no 404 (RF-H01 CA 5):
 * el vacío no puede dejar deducir si el paciente existe.
 */
export interface PaginaHistorialPaciente extends PaginaHistorial {
  /** El caso más reciente; es lo que usaría «Descargar reporte de este paciente». */
  caso_id: string | null;
  /** Todos, si recibió por traslado un paciente que ya tenía. */
  caso_ids: string[];
}

/**
 * Observación de un profesional dentro de `GET /analisis/{id}`. `es_mia` es lo que decide si
 * W-08 muestra el formulario o la valoración ya registrada en solo lectura.
 */
export interface ObservacionAnalisis {
  id: string;
  es_mia: boolean;
  valoracion: Valoracion;
  texto: string | null;
  autor: { nombre: string; apellido: string };
  registrada_en: string;
}

/** Quién hizo el análisis. No está dibujado en W-08 (es de W-17b). */
export interface RealizadoPor {
  nombre: string;
  apellido: string;
  cuenta_eliminada: boolean;
  es_propio: boolean;
}

/** De quién llegó el caso por traslado. No está dibujado en W-08 (es de W-17b). */
export interface TrasladoAnalisis {
  desde: { nombre: string; apellido: string };
  cuenta_eliminada: boolean;
  fecha: string;
}

/** El aviso experimental de RF-R04 tal como lo manda la API. */
export interface AvisoApi {
  etiqueta: string;
  texto: string;
}

/**
 * Respuesta de `GET /analisis/{id}`. Se tipa completa aunque W-08 no dibuje todo, para que
 * la tarea 6b (explicación y observaciones) no tenga que tocar los tipos.
 *
 * `caracteristicas` viene ordenada por probabilidad descendente y `regiones` por la
 * probabilidad de su característica: el frontend no reordena.
 */
export interface AnalisisDetalle {
  id: string;
  codigo: string;
  estado: EstadoAnalisis;
  solicitado_en: string;
  completado_en: string | null;
  codigo_error: string | null;
  modelo: ModeloUsado;
  imagen: ImagenAnalisis;
  mapa_calor: MapaCalor | null;
  calidad: CalidadImagen;
  caracteristicas: CaracteristicaResultado[];
  /**
   * Activa el aviso de W-08b. Ojo: es `false` cuando `caracteristicas` llega vacía, así que
   * «lista vacía» no es W-08b y se atiende aparte.
   */
  ninguna_supera_umbral: boolean;
  regiones: RegionInteres[];
  explicacion: ExplicacionAnalisis | null;
  observaciones: ObservacionAnalisis[];
  realizado_por: RealizadoPor;
  trasladado: TrasladoAnalisis | null;
  aviso: AvisoApi;
}
