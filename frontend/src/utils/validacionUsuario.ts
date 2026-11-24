// Normalización y validación de los datos de una cuenta, espejo de lo que hace el servidor
// (backend/app/schemas/usuarios.py). Es solo ayuda para el usuario: la autoridad es el servidor,
// que vuelve a validar y responde 422 DATOS_INVALIDOS con `campos`.
//
// Lo usan el formulario de W-10 (crear usuario), W-18 (Mi perfil) y los servicios que arman el
// cuerpo de la petición, para que no haya dos copias de las mismas reglas.

/** Longitud máxima de `nombre` y `apellido` en el servidor (`StringConstraints(max_length=100)`). */
export const LONGITUD_MAXIMA_NOMBRE = 100;

/** Longitud máxima del correo en el servidor (`Field(max_length=254)`). */
export const LONGITUD_MAXIMA_CORREO = 254;

/** Longitud máxima del teléfono *antes* de normalizar (`Field(max_length=30)`). */
export const LONGITUD_MAXIMA_TELEFONO = 30;

/** Mismo patrón que el servidor: no se valida más de lo que el servidor acepta. */
const PATRON_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** `^\+?[0-9]{7,15}$`: `[0-9]` y no `\d`, igual que el servidor (que excluye dígitos Unicode). */
const PATRON_TELEFONO = /^\+?[0-9]{7,15}$/;

/** Igual que el servidor: quita espacios, guiones, puntos y paréntesis («300 123-4567» → «3001234567»). */
export function normalizarTelefono(valor: string): string {
  return valor.replace(/[\s\-().]/g, "");
}

/** Igual que el servidor: sin espacios a los lados y en minúsculas. */
export function normalizarCorreo(valor: string): string {
  return valor.trim().toLowerCase();
}

/** Un nombre o apellido válido: con los espacios quitados, entre 1 y 100 caracteres. */
export function esNombreValido(valor: string): boolean {
  const limpio = valor.trim();
  return limpio.length >= 1 && limpio.length <= LONGITUD_MAXIMA_NOMBRE;
}

/** Un correo válido: normalizado, hasta 254 caracteres y con el patrón del servidor. */
export function esCorreoValido(valor: string): boolean {
  const limpio = normalizarCorreo(valor);
  return limpio.length <= LONGITUD_MAXIMA_CORREO && PATRON_CORREO.test(limpio);
}

/** Un teléfono ya normalizado y no vacío. El teléfono es opcional: el vacío se valida aparte. */
export function esTelefonoValido(valorNormalizado: string): boolean {
  return PATRON_TELEFONO.test(valorNormalizado);
}
