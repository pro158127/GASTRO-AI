// Reporte en PDF del detalle de un análisis (W-17 y sus estados W-17d, W-17e y W-17f; RF-H02).
// Dos peticiones, las dos solo DOCTOR:
//
// 1. `POST /reportes` → 201 `{id, formato, generado_en, analisis, descarga_url}`.
// 2. `GET /reportes/{id}/archivo` → el PDF, con `Content-Disposition: attachment` y
//    `Cache-Control: no-store`. **Solo lo descarga el doctor que lo generó; si no, 404.**
//
// El cuerpo del POST admite `analisis_ids` **o** `caso_id`, exactamente uno de los dos: un
// validador del servidor rechaza con 422 tanto mandar los dos como no mandar ninguno. Desde
// esta pantalla siempre va `analisis_ids` con un solo identificador. El reporte de todo un
// paciente (`caso_id`, «Descargar reporte de este paciente») es de la pestaña «Buscar por
// paciente» de W-16 y todavía no se construye.
//
// Nota para esa tarea: tres de los cinco errores del POST no están en `codigosError.ts`
// porque por este camino no se pueden provocar, y añadir texto a un archivo compartido para
// algo que nadie puede ver es peor que no añadirlo.
//
// - `SIN_ANALISIS` (422): el paciente no tiene ningún análisis con resultado. Solo por
//   `caso_id`; con `analisis_ids` la lista elegida nunca queda vacía.
// - `DEMASIADOS_ANALISIS` (422): más de 50 análisis (`MAXIMO_ANALISIS` del servicio). Aquí
//   siempre va uno.
// - `ANALISIS_SIN_RESULTADO` (422): algún análisis no está COMPLETADO. Aquí el botón solo
//   existe en la rama COMPLETADO, y un análisis completado no vuelve atrás.
//
// Los dos que sí pueden llegar —`NO_ENCONTRADO` (404) y `SERVICIO_NO_DISPONIBLE` (503)— ya
// están en el enum. Ojo con el 503: lo lanzan **las dos** peticiones, el POST cuando el
// almacén no puede guardar el PDF y el GET cuando no puede leerlo.
import { ErrorApi, solicitarBinario, solicitar } from "./api";
import type { ReporteCreado } from "../types";

const TIPO_PDF = "application/pdf";

/** Los cinco primeros bytes de un PDF son `%PDF-` (ISO 32000-1 § 7.5.2). */
const FIRMA_PDF = "%PDF-";

/** El PDF ya en memoria y el nombre que mandó el servidor (`null` si no se pudo leer). */
export interface ArchivoReporte {
  blob: Blob;
  nombreArchivo: string | null;
}

/**
 * `POST /reportes` con un solo análisis. Genera un reporte **nuevo** cada vez que se llama:
 * no hay forma de recuperar uno ya generado, y por eso reintentar una descarga fallida pasa
 * por volver a generarlo.
 */
export function generarReporteDeAnalisis(idAnalisis: string): Promise<ReporteCreado> {
  return solicitar<ReporteCreado>("/reportes", {
    metodo: "POST",
    cuerpo: { analisis_ids: [idAnalisis] },
  });
}

/**
 * `GET /reportes/{id}/archivo`. La ruta se arma aquí con el `id` y **no** con el
 * `descarga_url` de la respuesta: ese campo ya trae `/api/v1` del servidor y `solicitarBinario`
 * antepone el suyo (ver el comentario de `ReporteCreado.descarga_url`).
 *
 * `solicitarBinario` ya exigió que la respuesta declare `application/pdf` y que no venga
 * vacía. Lo que falta es lo que solo sabe quien pidió un PDF: que los bytes empiecen por su
 * firma. Un 200 con `Content-Type: application/pdf` y una página de error dentro es raro, pero
 * si pasa, el archivo se abre roto días después y nadie sabe por qué; aquí se corta antes y se
 * trata como el error inesperado que es.
 */
export async function descargarArchivoReporte(idReporte: string): Promise<ArchivoReporte> {
  const { datos, nombreArchivo } = await solicitarBinario(
    `/reportes/${encodeURIComponent(idReporte)}/archivo`,
    { tipoEsperado: TIPO_PDF }
  );
  const firma = await datos.slice(0, FIRMA_PDF.length).text();
  if (firma !== FIRMA_PDF) throw new ErrorApi(200);
  return { blob: datos, nombreArchivo };
}
