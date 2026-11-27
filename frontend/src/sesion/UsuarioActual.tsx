// Usuario actual (nombre, rol) y contador del menú para las pantallas internas. Todo sale de
// la sesión real (`GET /auth/sesion`, ver ProveedorSesion) y vive solo en memoria: se descarta
// al cerrar sesión, así otra persona que entre en la misma pestaña nunca ve el rol anterior.
//
// El contador de «Casos recibidos» viene en la misma respuesta de la sesión
// (`casos_recibidos_nuevos`) y no en una consulta aparte, porque el menú se ve en todas las
// pantallas: así se actualiza al cargar la página y en cada comprobación pasiva de
// inactividad, sin añadir peticiones. Ya no hay nada simulado aquí.
import { rolDeInterfaz } from "../navegacion/menus";
import type { RolInterfaz } from "../navegacion/menus";
import type { UsuarioActual } from "../types";
import { useSesion } from "./ProveedorSesion";

/** Para pantallas internas: solo se montan con la sesión ACTIVA, es decir, con usuario. */
export function useUsuarioActual(): {
  usuario: UsuarioActual;
  rol: RolInterfaz;
  /** Traslados sin abrir. 0 cuando no aplica (el menú oculta la insignia en 0). */
  casosSinRevisar: number;
} {
  const { usuario, casosRecibidosNuevos } = useSesion();
  if (usuario === null) {
    throw new Error("useUsuarioActual se usó fuera de las pantallas internas con sesión");
  }
  return {
    usuario,
    rol: rolDeInterfaz(usuario.rol),
    casosSinRevisar: casosRecibidosNuevos ?? 0,
  };
}
