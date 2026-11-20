// Catálogos de solo lectura de la API (../ARCHITECTURE.md § 3.5). Los puede pedir cualquier
// sesión activa, sin importar el rol.
import type { ListaRoles, RolCatalogo } from "../types";
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
