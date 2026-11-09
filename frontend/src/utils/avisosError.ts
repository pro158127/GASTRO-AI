// Textos de los estados globales W-30 (sin conexión) y W-31 (error inesperado) de Figma, para
// los lugares donde se muestran en una alerta. Se eligen por el tipo de fallo, nunca con el
// mensaje del servidor.
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";

export interface AvisoError {
  titulo: string;
  mensaje: string;
}

const SIN_CONEXION: AvisoError = {
  titulo: "Sin conexión a internet",
  mensaje: "Revise su conexión e intente de nuevo.",
};

/**
 * No está en Figma (pendiente de agregar): 429 DEMASIADOS_INTENTOS (límite de 10 por minuto por IP
 * en login y códigos; el servidor manda Retry-After: 60). Lo comparten las pantallas de acceso.
 */
export const AVISO_DEMASIADOS_INTENTOS: AvisoError = {
  titulo: "",
  mensaje: "Demasiados intentos. Espere un minuto e intente de nuevo.",
};

/** El 429 puede venir de nginx sin cuerpo JSON, por eso también se mira el estado. */
export function esDemasiadosIntentos(error: unknown): boolean {
  return (
    error instanceof ErrorApi &&
    (error.estado === 429 || error.codigo === CodigoErrorApi.DEMASIADOS_INTENTOS)
  );
}

/** W-31. Con `idError` (el `ERR-xxxx` de los 5xx), agrega la frase del código que el usuario dicta al administrador. */
export function avisoInesperado(idError: string | null): AvisoError {
  const base = "Ocurrió un error inesperado. Intente de nuevo.";
  return {
    titulo: "Algo salió mal",
    mensaje: idError
      ? `${base} Si continúa, informe al administrador este código: ${idError}.`
      : base,
  };
}

/** Aviso para un fallo sin tratamiento propio: red caída (W-30) o cualquier otro (W-31). */
export function avisoDeError(error: unknown): AvisoError {
  if (error instanceof ErrorApi) {
    return error.estado === null ? SIN_CONEXION : avisoInesperado(error.idError);
  }
  return avisoInesperado(null);
}
