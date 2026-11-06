// Textos de los estados globales W-30 (sin conexión) y W-31 (error inesperado) de Figma, para
// los lugares donde se muestran en una alerta. Se eligen por el tipo de fallo, nunca con el
// mensaje del servidor.
import { ErrorApi } from "../services/api";

export interface AvisoError {
  titulo: string;
  mensaje: string;
}

const SIN_CONEXION: AvisoError = {
  titulo: "Sin conexión a internet",
  mensaje: "Revise su conexión e intente de nuevo.",
};

/** W-31. Con `idError`, agrega la frase del código que el usuario le dicta al administrador. */
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
