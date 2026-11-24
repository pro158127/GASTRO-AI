// Carga de la imagen endoscópica al área temporal (W-06f, W-06g). Es el paso 1 de los dos que
// pide ../ARCHITECTURE.md § 3.5: primero `POST /imagenes`, después `POST /analisis` con el
// `imagen_id` que devuelve.
//
// La imagen se valida en el servidor **por sus bytes**, no por el nombre ni por el tipo que
// declara el navegador: lo que el `accept` del input filtra es comodidad, no seguridad.
import type { ImagenCargada } from "../types";
import { enviarMultipart } from "./api";

/** Campo del multipart que espera el backend (`archivo: UploadFile`). */
const CAMPO_ARCHIVO = "archivo";

export interface OpcionesCarga {
  /**
   * Avance de la subida, de 0 a 1. No se llama si el navegador no puede calcular el total:
   * entonces W-06f muestra el texto sin porcentaje en vez de inventar un número.
   */
  alProgreso?: (fraccion: number) => void;
}

/**
 * `POST /imagenes` (201). La imagen queda en el área temporal de MinIO y **vence**
 * (`expira_en`); además, cada `imagen_id` sirve una sola vez.
 *
 * Errores que atiende la pantalla: 413 IMAGEN_DEMASIADO_PESADA (W-06d, trae `max_bytes`),
 * 415 IMAGEN_FORMATO_NO_PERMITIDO (W-06c, trae `permitidos`), 422 IMAGEN_ILEGIBLE y
 * 422 IMAGEN_RESOLUCION_INSUFICIENTE (trae `minimo`).
 */
export function cargarImagen(archivo: File, opciones: OpcionesCarga = {}): Promise<ImagenCargada> {
  const formulario = new FormData();
  formulario.append(CAMPO_ARCHIVO, archivo);
  // `global: true`: un 401 a mitad de la subida tiene que llevar al inicio de sesión igual que
  // cualquier otra petición (lo hace `atenderRespuesta`, compartido con el transporte de fetch).
  return enviarMultipart<ImagenCargada>("/imagenes", formulario, {
    alProgreso: opciones.alProgreso,
  });
}
