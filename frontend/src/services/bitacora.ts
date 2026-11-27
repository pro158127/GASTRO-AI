// Bitácora del administrador (W-21, RF-A02), `../ARCHITECTURE.md` § 3.5.
//
// Son **dos consultas distintas y no se piden juntas**:
//
// - `GET /admin/bitacora/filtros` trae las opciones de los dos desplegables. Se pide una sola
//   vez al montar: la lista de acciones es fija y la de actores cambia muy despacio.
// - `GET /admin/bitacora` trae la página, y se vuelve a pedir cada vez que cambian los filtros
//   o la página.
//
// **Ninguna de las dos es pasiva**: las pide la persona al entrar o al filtrar, así que
// renuevan la inactividad de la sesión como cualquier otra acción suya.
//
// La bitácora es solo lectura: aquí no hay POST, PUT ni DELETE, y no puede haberlos.
import type { FiltrosBitacora, PaginaBitacora, ResultadoBitacora } from "../types";
import { solicitar } from "./api";

/**
 * Páginas de 8, que es lo que dibuja el pie de W-21 («Mostrando 1–8 de 245 eventos»). El
 * backend trae 25 por omisión y acepta hasta 100; el número del frame es el que manda.
 */
export const EVENTOS_POR_PAGINA = 8;

/** Filtros de la bitácora. Todos viven en la query string (ver `Bitacora.tsx`). */
export interface FiltroBitacora {
  pagina: number;
  /** Código de la acción (`CUENTA_BLOQUEADA`); cadena vacía = todas. */
  accion: string;
  /** Id del actor; cadena vacía = todos. El filtro `actor` por texto libre no se usa. */
  actorId: string;
  /** Cadena vacía = los dos resultados. */
  resultado: "" | ResultadoBitacora;
  /** `YYYY-MM-DD`, que es justo lo que da un `<input type="date">`. */
  desde: string;
  hasta: string;
}

/** El filtro con el que arranca la pantalla: sin nada puesto. */
export const FILTRO_INICIAL: FiltroBitacora = {
  pagina: 1,
  accion: "",
  actorId: "",
  resultado: "",
  desde: "",
  hasta: "",
};

/** ¿Hay algún filtro puesto? Distingue «ningún evento con esos filtros» de «bitácora vacía». */
export function hayFiltros(filtro: FiltroBitacora): boolean {
  return (
    filtro.accion !== "" ||
    filtro.actorId !== "" ||
    filtro.resultado !== "" ||
    filtro.desde !== "" ||
    filtro.hasta !== ""
  );
}

/**
 * `GET /admin/bitacora`: la página, lo más reciente primero.
 *
 * **El endpoint no acepta ningún parámetro de orden** y por eso aquí no se manda ninguno; la
 * pantalla tampoco ordena en el navegador (ver el comentario de cabecera de `TablaBitacora`).
 *
 * `desde > hasta` responde `422 RANGO_FECHAS_INVALIDO` con `campos`; lo atiende la pantalla.
 */
export function listarBitacora(filtro: FiltroBitacora): Promise<PaginaBitacora> {
  const parametros = new URLSearchParams({
    pagina: String(filtro.pagina),
    por_pagina: String(EVENTOS_POR_PAGINA),
  });
  if (filtro.accion !== "") parametros.set("accion", filtro.accion);
  if (filtro.actorId !== "") parametros.set("actor_id", filtro.actorId);
  if (filtro.resultado !== "") parametros.set("resultado", filtro.resultado);
  if (filtro.desde !== "") parametros.set("desde", filtro.desde);
  if (filtro.hasta !== "") parametros.set("hasta", filtro.hasta);

  return solicitar<PaginaBitacora>(`/admin/bitacora?${parametros.toString()}`);
}

/** `GET /admin/bitacora/filtros`: las opciones de «Tipo de evento» y «Usuario». */
export function obtenerFiltrosBitacora(): Promise<FiltrosBitacora> {
  return solicitar<FiltrosBitacora>("/admin/bitacora/filtros");
}
