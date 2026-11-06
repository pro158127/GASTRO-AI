// Usuario actual (nombre, rol) y contador de casos recibidos. El usuario viene de la sesión real
// (GET /auth/sesion, ver ProveedorSesion); el contador sigue simulado. Todo vive solo en memoria,
// dentro del diseño de las pantallas internas: se descarta al cerrar sesión, así otra persona que
// entre en la misma pestaña nunca ve el rol anterior.
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { rolDeInterfaz } from "../navegacion/menus";
import type { RolInterfaz } from "../navegacion/menus";
import { obtenerResumenCasosRecibidos } from "../services/usuario";
import type { UsuarioActual } from "../types";
import { useSesion } from "./ProveedorSesion";

const ContextoCasos = createContext<number | null>(null);

/** Carga el contador de casos recibidos. Es un dato secundario: si falla, vale 0 y no bloquea nada. */
export function ProveedorUsuario({ children }: { children: ReactNode }) {
  const [casosSinRevisar, setCasosSinRevisar] = useState(0);

  useEffect(() => {
    let vigente = true;
    obtenerResumenCasosRecibidos()
      .then((resumen) => {
        if (vigente) setCasosSinRevisar(resumen.sin_revisar);
      })
      .catch(() => {
        if (vigente) setCasosSinRevisar(0);
      });
    return () => {
      vigente = false;
    };
  }, []);

  return <ContextoCasos.Provider value={casosSinRevisar}>{children}</ContextoCasos.Provider>;
}

/** Para pantallas internas: solo se montan con la sesión ACTIVA, es decir, con usuario. */
export function useUsuarioActual(): {
  usuario: UsuarioActual;
  rol: RolInterfaz;
  casosSinRevisar: number;
} {
  const { usuario } = useSesion();
  const casosSinRevisar = useContext(ContextoCasos);
  if (usuario === null || casosSinRevisar === null) {
    throw new Error("useUsuarioActual se usó fuera de las pantallas internas con sesión");
  }
  return { usuario, rol: rolDeInterfaz(usuario.rol), casosSinRevisar };
}
