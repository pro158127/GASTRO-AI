// Solicitud y seguimiento del análisis (W-06 paso 3 y W-07), ../ARCHITECTURE.md § 3.5 y § 3.9.
//
// No hay WebSocket y el SSE de `GET /eventos` todavía está planeado: el avance se sigue por
// HTTP, consultando `GET /analisis/{id}/estado`. Esa consulta es automática, no una acción de
// la persona, así que va con `pasiva: true` (header `X-Actividad-Pasiva: 1`) para no renovar la
// inactividad de la sesión: si no, tener W-07 abierta mantendría la sesión viva para siempre.
import type {
  AnalisisCreado,
  AnalisisDetalle,
  AnalisisResumen,
  EstadoAnalisisRespuesta,
  SolicitudAnalisis,
} from "../types";
import { solicitar } from "./api";

/**
 * `POST /analisis` (202). Encola el análisis y devuelve su identificador y su código.
 *
 * El documento del paciente va aquí, en el cuerpo, y nunca en la URL: las direcciones quedan
 * en los registros del servidor y en el historial del navegador.
 *
 * Errores que atiende la pantalla: 422 DOCUMENTO_INVALIDO (W-06e), 422 DOCUMENTO_NO_COINCIDE
 * (W-06k), 410 IMAGEN_EXPIRADA (cargar la imagen otra vez) y 503 SERVICIO_NO_DISPONIBLE.
 */
export async function crearAnalisis(solicitud: SolicitudAnalisis): Promise<AnalisisResumen> {
  const { analisis } = await solicitar<AnalisisCreado>("/analisis", {
    metodo: "POST",
    cuerpo: solicitud,
  });
  return analisis;
}

/**
 * `GET /analisis/{id}/estado`. Consulta automática del sondeo de W-07: **siempre pasiva**.
 *
 * El backend recomienda consultarlo cada 1–2 s. Devuelve el estado, las etapas con el suyo y,
 * si falló, el `codigo_error` (más `calidad` cuando fue por `ERR-1001`).
 */
export function obtenerEstadoAnalisis(id: string): Promise<EstadoAnalisisRespuesta> {
  return solicitar<EstadoAnalisisRespuesta>(`/analisis/${encodeURIComponent(id)}/estado`, {
    pasiva: true,
  });
}

/**
 * `GET /analisis/{id}`. El resultado completo que dibuja W-08 y W-08b.
 *
 * **No es pasiva.** Abrir el resultado, reintentar tras un fallo y recuperar una imagen
 * vencida son acciones de la persona, así que sí renuevan la inactividad de la sesión; lo
 * contrario sería castigar a quien está leyendo su resultado.
 *
 * Las URL de `imagen.url`, `mapa_calor.url` y `regiones[].mapa_calor_url` van firmadas y
 * vencen a los 5 minutos (`S3_URL_FIRMADA_SEGUNDOS`): volver a llamar aquí es la forma de
 * conseguir unas nuevas.
 *
 * Responde 404 NO_ENCONTRADO si el análisis no existe o no es de este doctor, y 403 si
 * quien consulta es el administrador.
 */
export function obtenerAnalisis(id: string): Promise<AnalisisDetalle> {
  return solicitar<AnalisisDetalle>(`/analisis/${encodeURIComponent(id)}`);
}

/**
 * `POST /analisis/{id}/reintento` (202). Vuelve a encolar un análisis FALLIDO: es el
 * «Reintentar» de W-07c.
 *
 * Responde 409 NO_REINTENTABLE si el análisis no está FALLIDO o si falló por calidad
 * (`ERR-1001`), donde lo que corresponde es cargar otra imagen, no reintentar.
 */
export async function reintentarAnalisis(id: string): Promise<AnalisisResumen> {
  const { analisis } = await solicitar<AnalisisCreado>(
    `/analisis/${encodeURIComponent(id)}/reintento`,
    { metodo: "POST" }
  );
  return analisis;
}
