// Normalización y validación del documento del paciente (W-06e, W-06j, W-06k).
//
// Es el espejo de lo que hace el servidor (`backend/app/core/seudonimo.py` y la nota de W-06b:
// antes del HMAC el número se normaliza y debe quedar entre 6 y 10 dígitos, RF-D01 CA 9). Como
// toda validación del cliente, esto es **solo ayuda** para quien escribe: la autoridad es el
// servidor, que además valida el largo por tipo (CC 10, TI 11, CE 6) y lo publica en
// `longitud_maxima` del catálogo de tipos de documento.
//
// Nada de este módulo guarda el número: recibe texto y devuelve texto.

/** Dígitos mínimos y máximos tras normalizar, según la nota de W-06b y W-06e. */
export const DIGITOS_MINIMO = 6;
export const DIGITOS_MAXIMO = 10;

/**
 * Lo que puede escribirse en el campo antes de normalizar: el número más sus separadores.
 * Se deja holgura para «1.144.567.890» (10 dígitos y 3 puntos); el servidor acepta hasta 30.
 */
export const LONGITUD_MAXIMA_CAMPO = 30;

/**
 * Quita puntos, espacios y guiones: «1.144.567-890» → «1144567890» (RF-D01 CA 9).
 * No quita otros caracteres a propósito: si quedan letras, `esDocumentoValido` lo rechaza y el
 * campo lo dice, en vez de borrar en silencio algo que la persona escribió.
 */
export function normalizarDocumento(valor: string): string {
  return valor.replace(/[.\s-]/g, "");
}

/** Entre 6 y 10 dígitos tras normalizar. `[0-9]` y no `\d`: el servidor no acepta dígitos Unicode. */
export function esDocumentoValido(valor: string): boolean {
  const normalizado = normalizarDocumento(valor);
  return new RegExp(`^[0-9]{${DIGITOS_MINIMO},${DIGITOS_MAXIMO}}$`).test(normalizado);
}

/**
 * Compara los dos números **ya normalizados**, como dice la nota de W-06j: «1.144.567.890» y
 * «1144567890» son el mismo documento, así que escribir los separadores de otra forma no es un
 * error. Con alguno vacío devuelve `false`: todavía no hay nada que comparar.
 */
export function documentosCoinciden(numero: string, confirmacion: string): boolean {
  const a = normalizarDocumento(numero);
  const b = normalizarDocumento(confirmacion);
  return a !== "" && a === b;
}
