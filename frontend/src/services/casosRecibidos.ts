// Casos recibidos por traslado (W-27), ../ARCHITECTURE.md § 3.5 y § «Casos recibidos (RF-A07)».
//
// Solo rol DOCTOR; el backend responde 403 a cualquier otro. Tres llamadas:
//
// - `GET /casos-recibidos` trae la bandeja entera, **agrupada por traslado** (un bloque por
//   evento, el más reciente primero), no una lista plana de análisis.
// - `POST /casos-recibidos/buscar` devuelve los mismos bloques de un solo paciente. Es un POST
//   **a propósito**: el documento va en el cuerpo para que no quede en la URL, igual que en
//   W-16. Un paciente ajeno o inexistente responde 200 con `traslados: []`, sin revelar si
//   existe para otro doctor; un documento mal escrito da `422 DOCUMENTO_INVALIDO` con `campos`.
// - `POST /traslados/{id}/visto` marca el bloque como abierto (204). Es idempotente.
//
// Ninguna es pasiva: las tres salen de una acción del doctor (entrar a la pantalla, filtrar,
// buscar, abrir un bloque), así que deben renovar la inactividad de la sesión.
import type { BandejaRecibidos, BusquedaRecibidos } from "../types";
import { solicitar } from "./api";

/** Análisis por bloque que trae la bandeja: W-27d muestra «5 de 12» y luego «Ver los 12». */
export const ANALISIS_POR_BLOQUE = 5;

/** Todos los análisis de cada bloque, sin recortar. Es el `limite=0` del contrato. */
export const SIN_LIMITE = 0;

/**
 * `GET /casos-recibidos`.
 *
 * `origenId` filtra por doctor de origen; `limite` son los análisis **por bloque** (`0` = todos).
 * Es un solo límite para toda la bandeja, no uno por traslado: por eso «Ver los N análisis»
 * repide con `SIN_LIMITE` (ver CONTRATOS_API.md, CR-2).
 *
 * Cuidado al leer la respuesta: `nuevos` y `doctores_origen` llegan **sin filtrar**, siempre
 * globales; solo `total_traslados` y `total_casos` se calculan sobre la lista ya filtrada.
 */
export function obtenerBandejaRecibidos(
  opciones: { origenId?: string; limite?: number } = {}
): Promise<BandejaRecibidos> {
  const parametros = new URLSearchParams({
    limite: String(opciones.limite ?? ANALISIS_POR_BLOQUE),
  });
  if (opciones.origenId) parametros.set("origen_id", opciones.origenId);

  return solicitar<BandejaRecibidos>(`/casos-recibidos?${parametros.toString()}`);
}

/**
 * `POST /casos-recibidos/buscar`: los mismos bloques, solo de un paciente (RF-A07 CA 8).
 *
 * Va siempre con `limite: 0` porque W-27e y W-27f no dibujan pie ni botón de «ver más»: lo de
 * un paciente se muestra entero. Añade `analisis_propios_paciente`, que es cuántos análisis de
 * ese paciente hizo el propio doctor, para el aviso de «también tiene N suyos».
 *
 * nginx limita esta ruta a 30 por minuto por IP, así que puede responder un 429 que no viene
 * de la API.
 */
export function buscarCasosRecibidos(busqueda: BusquedaRecibidos): Promise<BandejaRecibidos> {
  return solicitar<BandejaRecibidos>("/casos-recibidos/buscar", {
    metodo: "POST",
    cuerpo: {
      tipo_documento: busqueda.tipo_documento,
      numero_documento: busqueda.numero_documento,
      ...(busqueda.origen_id ? { origen_id: busqueda.origen_id } : {}),
      limite: busqueda.limite ?? SIN_LIMITE,
    },
  });
}

/**
 * `POST /traslados/{id}/visto`: el doctor abrió el bloque, deja de salir como «Nuevo»
 * (RF-A07 CA 6). Responde 204 sin cuerpo.
 *
 * Es idempotente (el servidor solo escribe `visto_en` si estaba nulo), así que repetirlo no
 * cambia la fecha. Un traslado que no es suyo responde `404 NO_ENCONTRADO`.
 */
export function marcarTrasladoVisto(trasladoId: string): Promise<void> {
  return solicitar<void>(`/traslados/${trasladoId}/visto`, { metodo: "POST" });
}
