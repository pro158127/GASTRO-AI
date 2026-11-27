// Historial de análisis (W-16), ../ARCHITECTURE.md § 4 y § 3.5.
//
// Son dos consultas con la misma fila (`FilaHistorial`) y un reparto muy distinto:
//
// - `GET /analisis` lista los análisis del doctor y **nunca lleva datos del paciente**. Por
//   eso sus filtros pueden viajar en la query string sin problema.
// - `POST /pacientes/analisis/buscar` es un POST **a propósito**: el documento del paciente
//   va en el cuerpo para que no quede en la URL, ni en el historial del navegador, ni en los
//   registros del servidor. No es un GET con parámetros por comodidad.
import type {
  EstadoAnalisis,
  OrdenHistorial,
  OrigenHistorial,
  PaginaHistorial,
  PaginaHistorialPaciente,
} from "../types";
import { solicitar } from "./api";

/** Páginas de 8, como dibuja W-16 («Mostrando 1–8 de 51 análisis»). */
export const ANALISIS_POR_PAGINA = 8;

/** Largo máximo del filtro por código (`Query(max_length=20)` en el backend). */
export const LONGITUD_MAXIMA_CODIGO = 20;

/** Filtros de «Mis análisis». Solo se mandan los que tienen valor. */
export interface FiltroHistorial {
  pagina: number;
  origen: OrigenHistorial;
  /**
   * PROPUESTA no dibujada: Figma no pinta este filtro, pero la API lo acepta y sin él los
   * análisis fallidos no se pueden quitar de la lista. Cadena vacía = todos los estados.
   */
  estado: "" | EstadoAnalisis;
  /** Prefijo del código («A-2026-0001»), no una búsqueda libre. */
  codigo: string;
  /** `YYYY-MM-DD`, que es justo lo que da un `<input type="date">`. */
  desde: string;
  hasta: string;
  orden: OrdenHistorial;
}

/** El filtro con el que arranca la pestaña: sin nada puesto y lo más reciente primero. */
export const FILTRO_INICIAL: FiltroHistorial = {
  pagina: 1,
  origen: "todos",
  estado: "",
  codigo: "",
  desde: "",
  hasta: "",
  orden: "-solicitado_en",
};

/** ¿Hay algún filtro puesto? Distingue el vacío de W-16d del de W-16f. */
export function hayFiltros(filtro: FiltroHistorial): boolean {
  return (
    filtro.origen !== "todos" ||
    filtro.estado !== "" ||
    filtro.codigo.trim() !== "" ||
    filtro.desde !== "" ||
    filtro.hasta !== ""
  );
}

/**
 * `GET /analisis` (W-16, pestaña «Mis análisis»): propios y recibidos por traslado.
 *
 * No es pasiva: la pide la persona al entrar, al filtrar o al cambiar de página.
 */
export function listarMisAnalisis(filtro: FiltroHistorial): Promise<PaginaHistorial> {
  const parametros = new URLSearchParams({
    pagina: String(filtro.pagina),
    por_pagina: String(ANALISIS_POR_PAGINA),
    orden: filtro.orden,
  });
  if (filtro.origen !== "todos") parametros.set("origen", filtro.origen);
  if (filtro.estado !== "") parametros.set("estado", filtro.estado);
  const codigo = filtro.codigo.trim();
  if (codigo !== "") parametros.set("codigo", codigo);
  if (filtro.desde !== "") parametros.set("desde", filtro.desde);
  if (filtro.hasta !== "") parametros.set("hasta", filtro.hasta);

  return solicitar<PaginaHistorial>(`/analisis?${parametros.toString()}`);
}

/** Lo que identifica al paciente en la segunda pestaña. Nunca sale de la memoria. */
export interface BusquedaPaciente {
  tipo_documento: string;
  numero_documento: string;
}

/**
 * `POST /pacientes/analisis/buscar` (W-16, pestaña «Buscar por paciente»).
 *
 * **El documento va en el cuerpo, nunca en la ruta.** Ese es el motivo de que sea un POST.
 *
 * Un paciente ajeno o inexistente responde **200 con `items: []`**, no 404 (RF-H01 CA 5):
 * quien llame no puede convertir ese vacío en «ese paciente no existe», porque el mismo
 * vacío lo devuelve un paciente de otro doctor. Un documento mal escrito sí da
 * `422 DOCUMENTO_INVALIDO`, con `campos`.
 *
 * El orden por omisión es el cronológico (el más antiguo primero, RF-H01 CA 1), al revés
 * que «Mis análisis».
 */
export function buscarAnalisisDePaciente(
  busqueda: BusquedaPaciente,
  opciones: { pagina: number; orden: OrdenHistorial; estado?: EstadoAnalisis }
): Promise<PaginaHistorialPaciente> {
  return solicitar<PaginaHistorialPaciente>("/pacientes/analisis/buscar", {
    metodo: "POST",
    cuerpo: {
      tipo_documento: busqueda.tipo_documento,
      numero_documento: busqueda.numero_documento,
      pagina: opciones.pagina,
      por_pagina: ANALISIS_POR_PAGINA,
      orden: opciones.orden,
      ...(opciones.estado ? { estado: opciones.estado } : {}),
    },
  });
}
