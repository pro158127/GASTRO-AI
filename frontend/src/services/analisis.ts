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
  ExplicacionEstado,
  ExplicacionReintentada,
  ObservacionCreada,
  ObservacionEntrada,
  ObservacionGuardada,
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
 * `GET /analisis/{id}/explicacion`. El sondeo de W-08c: **siempre pasiva**.
 *
 * Es una consulta automática, no una acción de la persona. Sin `pasiva: true` tener W-08
 * abierta mantendría viva la sesión para siempre y el cierre por inactividad de los 10
 * minutos dejaría de funcionar, igual que pasaría con el sondeo de W-07.
 *
 * El endpoint responde con `response_model_exclude_none=True`: lo que es nulo no viene. Y su
 * 404 significa «este análisis no tiene explicación» (análisis FALLIDO), **no** «el análisis
 * no existe»: quien llame no debe confundirlo con el 404 de la pantalla.
 */
export function obtenerExplicacion(id: string): Promise<ExplicacionEstado> {
  return solicitar<ExplicacionEstado>(`/analisis/${encodeURIComponent(id)}/explicacion`, {
    pasiva: true,
  });
}

/**
 * `POST /analisis/{id}/explicacion/reintentar` (202). El «Reintentar» de W-08d.
 *
 * **No es pasiva, a diferencia del sondeo de arriba.** La pulsa una persona, así que renueva
 * la inactividad de la sesión como cualquier otra acción suya. Que el éxito reanude el sondeo
 * no cambia nada: lo que cuenta como actividad es el clic, no las consultas que vienen
 * detrás, que vuelven a ir pasivas.
 *
 * Errores: 409 EXPLICACION_NO_REINTENTABLE (ya GENERADA o todavía PENDIENTE) y 429
 * REINTENTOS_AGOTADOS, que trae `max_intentos`.
 */
export function reintentarExplicacion(id: string): Promise<ExplicacionReintentada> {
  return solicitar<ExplicacionReintentada>(
    `/analisis/${encodeURIComponent(id)}/explicacion/reintentar`,
    { metodo: "POST" }
  );
}

/**
 * `POST /analisis/{id}/observaciones` (201). La valoración del profesional (RF-D04, W-08e).
 *
 * **No es pasiva:** es la acción de la persona.
 *
 * **Es irreversible.** Hay una observación por análisis y por doctor, y no se edita: un
 * segundo envío responde 409 OBSERVACION_YA_REGISTRADA y el servidor no sobrescribe nada.
 * Quien llame tiene que haberlo advertido antes.
 *
 * `texto` en blanco no se manda: el servidor lo guarda como `null`.
 */
export async function crearObservacion(
  id: string,
  entrada: ObservacionEntrada
): Promise<ObservacionGuardada> {
  const texto = entrada.texto?.trim();
  const { observacion } = await solicitar<ObservacionCreada>(
    `/analisis/${encodeURIComponent(id)}/observaciones`,
    { metodo: "POST", cuerpo: { valoracion: entrada.valoracion, texto: texto || null } }
  );
  return observacion;
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
