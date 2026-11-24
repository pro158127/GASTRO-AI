// Catálogos de solo lectura de la API (../ARCHITECTURE.md § 3.5). Los puede pedir cualquier
// sesión activa, sin importar el rol.
import type { ListaRoles, ListaTiposDocumento, RolCatalogo, TipoDocumento } from "../types";
import { solicitar } from "./api";

/**
 * Roles con su nombre visible (consulta U-16, resuelta en la rama del backend).
 *
 * **Se pide una sola vez por sesión del navegador.** Son dos filas que no cambian mientras la
 * aplicación está abierta, y las piden dos pantallas distintas (W-10 al crear la cuenta y D-04 al
 * cambiar el rol): pedirlas en cada montaje serían llamadas repetidas para la misma respuesta. El
 * resultado queda en memoria del módulo; `consultaEnCurso` hace que dos pantallas que las pidan a
 * la vez compartan una sola petición.
 *
 * **Solo se guarda el éxito.** Si la petición falla no queda nada en memoria, así que el próximo
 * intento vuelve a salir a la red: un fallo de red no deja la aplicación sin roles para siempre.
 *
 * No contiene datos personales (son los mismos dos roles para todo el mundo), así que vivir en
 * memoria del módulo no cambia nada de lo que exige la política de almacenamiento: no se escribe
 * en `localStorage` ni en `sessionStorage`.
 */
let rolesEnMemoria: RolCatalogo[] | null = null;
let consultaEnCurso: Promise<RolCatalogo[]> | null = null;

export function obtenerRoles(): Promise<RolCatalogo[]> {
  if (rolesEnMemoria !== null) return Promise.resolve(rolesEnMemoria);
  if (consultaEnCurso !== null) return consultaEnCurso;

  consultaEnCurso = solicitar<ListaRoles>("/catalogos/roles")
    .then(({ items }) => {
      rolesEnMemoria = items;
      return items;
    })
    .finally(() => {
      // Se suelta pase lo que pase: si falló, la próxima llamada tiene que reintentar.
      consultaEnCurso = null;
    });

  return consultaEnCurso;
}

/**
 * Tipos de documento con su nombre visible y su longitud máxima (W-06a).
 *
 * Mismo trato que los roles, y por las mismas razones: son tres filas iguales para todo el
 * mundo, sin datos personales, que se piden una sola vez por sesión del navegador y solo se
 * guardan si la consulta salió bien.
 *
 * `longitud_maxima` viene del servidor a propósito: la validación del cliente es ayuda, y el
 * largo por tipo (CC 10, TI 11, CE 6) lo decide el backend, no una constante escrita aquí.
 */
let tiposDocumentoEnMemoria: TipoDocumento[] | null = null;
let consultaTiposEnCurso: Promise<TipoDocumento[]> | null = null;

export function obtenerTiposDocumento(): Promise<TipoDocumento[]> {
  if (tiposDocumentoEnMemoria !== null) return Promise.resolve(tiposDocumentoEnMemoria);
  if (consultaTiposEnCurso !== null) return consultaTiposEnCurso;

  consultaTiposEnCurso = solicitar<ListaTiposDocumento>("/catalogos/tipos-documento")
    .then(({ items }) => {
      tiposDocumentoEnMemoria = items;
      return items;
    })
    .finally(() => {
      consultaTiposEnCurso = null;
    });

  return consultaTiposEnCurso;
}
