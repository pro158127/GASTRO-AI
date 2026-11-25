// Códigos de error de la API, tomados de la tabla de errores de ../ARCHITECTURE.md § 3.5.
// Es el único lugar donde se escriben: el resto del código usa `CodigoErrorApi.X`, nunca cadenas
// sueltas. En los 5xx el `codigo` no está aquí: es un `ERR-xxxx` genérico (ver `ErrorApi.idError`).
export const CodigoErrorApi = {
  PETICION_INVALIDA: "PETICION_INVALIDA",
  /**
   * 401 · Sin cookie, sesión cerrada o vencida. Puede traer `motivo` (ver `MotivoSesionExpirada`):
   * `INACTIVIDAD` → W-01d; `DEMASIADOS_INTENTOS` → W-01b genérico.
   */
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
  /**
   * 410 · `POST /analisis`: la imagen temporal venció o ese `imagen_id` ya se usó. Lo único que
   * destraba el flujo es volver a cargarla; el documento escrito se conserva.
   */
  IMAGEN_EXPIRADA: "IMAGEN_EXPIRADA",
  /** 413 · `POST /imagenes`: más de 10 MB. Trae `max_bytes` → W-06d. */
  IMAGEN_DEMASIADO_PESADA: "IMAGEN_DEMASIADO_PESADA",
  /** 415 · `POST /imagenes`: no es JPEG ni PNG (DICOM incluido). Trae `permitidos` → W-06c. */
  IMAGEN_FORMATO_NO_PERMITIDO: "IMAGEN_FORMATO_NO_PERMITIDO",
  /** 422 · `POST /imagenes`: archivo dañado o imagen desmesurada. */
  IMAGEN_ILEGIBLE: "IMAGEN_ILEGIBLE",
  /** 422 · `POST /imagenes`: menos de 224 × 224 px. Trae `minimo` con los dos lados. */
  IMAGEN_RESOLUCION_INSUFICIENTE: "IMAGEN_RESOLUCION_INSUFICIENTE",
  /**
   * 422 · Tipo o número de documento mal escrito. Trae `campos` (`tipo_documento` o
   * `numero_documento`), así que el error se pinta en ese campo → W-06e.
   */
  DOCUMENTO_INVALIDO: "DOCUMENTO_INVALIDO",
  /**
   * 422 · Paciente sin análisis con este doctor: falta `confirmacion_documento` o no coincide
   * con el número. El error se pinta en el campo de confirmación → W-06k.
   */
  DOCUMENTO_NO_COINCIDE: "DOCUMENTO_NO_COINCIDE",
  /** 503 · `POST /analisis`: no hay modelo vigente o la cola no responde. */
  SERVICIO_NO_DISPONIBLE: "SERVICIO_NO_DISPONIBLE",
  /**
   * 409 · `POST /analisis/{id}/reintento` sobre un análisis que no está FALLIDO, o que falló
   * por calidad (`ERR-1001`): ahí no se reintenta, se carga otra imagen.
   */
  NO_REINTENTABLE: "NO_REINTENTABLE",
  /**
   * 409 · Crear una cuenta (o cambiarle el correo) con un correo que ya usa otra. Trae `campos`
   * con `{campo: "correo"}`, así que el error se pinta en ese campo → W-10c.
   */
  CORREO_YA_REGISTRADO: "CORREO_YA_REGISTRADO",
  /**
   * 409 · La acción no aplica al estado de la cuenta (por ejemplo, reenviar la credencial de una
   * cuenta que ya se activó, o restablecer la contraseña de una cuenta inactiva).
   */
  TRANSICION_INVALIDA: "TRANSICION_INVALIDA",
  /**
   * 409 · Desactivar, eliminar o quitarle el rol al último administrador activo (RF-U07 CA 6,
   * RF-U08 CA 4) → D-05. El servidor lo rechaza aunque la interfaz ya deshabilite la acción.
   */
  ULTIMO_ADMINISTRADOR: "ULTIMO_ADMINISTRADOR",
  /** 409 · Pasar a administrador a un doctor que todavía tiene casos activos (W-11, D-04). */
  CASOS_SIN_REASIGNAR: "CASOS_SIN_REASIGNAR",
  /**
   * 409 · Desactivar o eliminar a un doctor con casos activos sin mandar `destino_id` (RF-A06)
   * → D-02. Trae `campos` con `{campo: "destino_id"}` y, además, `casos_activos` con cuántos son
   * (ver `ErrorApi.casosActivos`): ese número es el que dice D-02, sin volver a consultar.
   */
  DESTINO_REQUERIDO: "DESTINO_REQUERIDO",
  /**
   * 409 · Reasignar los casos de un doctor que ya no tiene ninguno (W-25): se los reasignaron
   * desde otra sesión mientras esta pantalla estaba abierta.
   */
  SIN_CASOS_ACTIVOS: "SIN_CASOS_ACTIVOS",
  DATOS_INVALIDOS: "DATOS_INVALIDOS",
  /**
   * 422 · El destino no es otro doctor con la cuenta activa (también si es el propio origen).
   * Trae `campos` con `{campo: "destino_id"}`, así que se pinta en el desplegable de destino.
   */
  DESTINO_INVALIDO: "DESTINO_INVALIDO",
  /**
   * 422 · Algún `caso_id` no es un caso activo de ese doctor. Trae `campos` con
   * `{campo: "caso_ids"}`. W-25 reasigna siempre todos (`caso_ids: null`), así que solo puede
   * aparecer si el envío deja de hacerlo.
   */
  CASOS_INVALIDOS: "CASOS_INVALIDOS",
  /** 422 · W-02b: trae `campos` y `requisitos`. */
  CONTRASENA_NO_CUMPLE_POLITICA: "CONTRASENA_NO_CUMPLE_POLITICA",
  /**
   * 409 · `POST /analisis/{id}/observaciones`: este doctor ya registró su valoración de este
   * análisis. **No se sobrescribe**: hay una por análisis y por persona, y no se edita
   * (RF-D04). Pasa, por ejemplo, con dos pestañas abiertas → W-08.
   */
  OBSERVACION_YA_REGISTRADA: "OBSERVACION_YA_REGISTRADA",
  /** 409 · Valorar un análisis que todavía no tiene resultado. W-08 solo se pinta COMPLETADO. */
  ANALISIS_NO_COMPLETADO: "ANALISIS_NO_COMPLETADO",
  /**
   * 409 · `POST /analisis/{id}/explicacion/reintentar` cuando la explicación ya está GENERADA
   * o sigue PENDIENTE. `puede_reintentar` del GET evita llegar aquí; queda por si el estado
   * cambió entre la consulta y el clic.
   */
  EXPLICACION_NO_REINTENTABLE: "EXPLICACION_NO_REINTENTABLE",
  /**
   * 429 · Ya se hicieron los tres intentos de la explicación (ANA-04). Trae `max_intentos`
   * (ver `ErrorApi.maxIntentos`): el número lo dice el servidor, no una constante de aquí.
   */
  REINTENTOS_AGOTADOS: "REINTENTOS_AGOTADOS",
  /** 429 · Límite por IP en login y códigos (10/min); trae `Retry-After`. */
  DEMASIADOS_INTENTOS: "DEMASIADOS_INTENTOS",
} as const;

export type CodigoErrorApi = (typeof CodigoErrorApi)[keyof typeof CodigoErrorApi];

/**
 * Valores de `motivo` en 401 SESION_EXPIRADA (tabla de errores de ../ARCHITECTURE.md § 3.5). No son
 * códigos de error: `DEMASIADOS_INTENTOS` aquí no es el 429 por IP de `CodigoErrorApi`.
 */
export const MotivoSesionExpirada = {
  /** La sesión venció por inactividad → W-01d. */
  INACTIVIDAD: "INACTIVIDAD",
  /**
   * Cuenta bloqueada tras 5 códigos TOTP fallidos (RF-U12); el servidor lo repite mientras dura el
   * bloqueo → W-01b genérico (nota de W-04b en Figma).
   */
  DEMASIADOS_INTENTOS: "DEMASIADOS_INTENTOS",
} as const;

export type MotivoSesionExpirada = (typeof MotivoSesionExpirada)[keyof typeof MotivoSesionExpirada];

/**
 * `codigo_error` de un análisis FALLIDO (`GET /analisis/{id}/estado`, ../ARCHITECTURE.md § 3.5).
 * No son errores HTTP: la petición responde 200 y el análisis es el que falló. Tienen forma de
 * `ERR-xxxx` igual que los 5xx, pero estos sí están documentados uno por uno.
 */
export const CodigoFalloAnalisis = {
  /** Calidad insuficiente → W-07b. No se reintenta: hay que cargar otra imagen. */
  CALIDAD_INSUFICIENTE: "ERR-1001",
  /** El servicio de inferencia no respondió o contestó fuera del contrato → W-07c. */
  INFERENCIA_NO_DISPONIBLE: "ERR-1002",
  /** La cola no respondió al encolar el análisis. Figma no lo dibuja: se trata como W-07c. */
  COLA_NO_DISPONIBLE: "ERR-1003",
  /** Error interno del worker. Figma no lo dibuja: se trata como W-07c. */
  ERROR_INTERNO: "ERR-1004",
} as const;

export type CodigoFalloAnalisis = (typeof CodigoFalloAnalisis)[keyof typeof CodigoFalloAnalisis];
