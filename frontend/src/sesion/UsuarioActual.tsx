// Usuario actual (nombre, rol) y contador de casos recibidos. Vive solo en memoria, dentro del
// diseño de las pantallas internas: se descarta al cerrar sesión, así otra persona que entre en
// la misma pestaña nunca ve el rol anterior. No se guarda en localStorage ni en la URL.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { rolDeInterfaz } from "../navegacion/menus";
import type { RolInterfaz } from "../navegacion/menus";
import { ErrorApi } from "../services/api";
import { obtenerResumenCasosRecibidos, obtenerUsuarioActual } from "../services/usuario";
import type { UsuarioActual } from "../types";

type EstadoUsuario =
  | { fase: "cargando" }
  | { fase: "error"; estadoHttp: number | null }
  | { fase: "listo"; usuario: UsuarioActual; casosSinRevisar: number };

interface ValorUsuario {
  estado: EstadoUsuario;
  reintentar: () => void;
}

const ContextoUsuario = createContext<ValorUsuario | null>(null);

export function ProveedorUsuario({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoUsuario>({ fase: "cargando" });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setEstado({ fase: "cargando" });
    (async () => {
      try {
        const usuario = await obtenerUsuarioActual();
        // El contador es un dato secundario: si falla, no bloquea el resto de la pantalla.
        const resumen = await obtenerResumenCasosRecibidos().catch(() => ({ sin_revisar: 0 }));
        if (vigente) {
          setEstado({ fase: "listo", usuario, casosSinRevisar: resumen.sin_revisar });
        }
      } catch (error) {
        if (vigente) {
          setEstado({ fase: "error", estadoHttp: error instanceof ErrorApi ? error.estado : 0 });
        }
      }
    })();
    return () => {
      vigente = false;
    };
  }, [intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  const valor = useMemo(() => ({ estado, reintentar }), [estado, reintentar]);

  return <ContextoUsuario.Provider value={valor}>{children}</ContextoUsuario.Provider>;
}

export function useEstadoUsuario(): ValorUsuario {
  const valor = useContext(ContextoUsuario);
  if (!valor) {
    throw new Error("useEstadoUsuario debe usarse dentro de ProveedorUsuario");
  }
  return valor;
}

/** Para pantallas que solo se muestran con el usuario ya cargado. */
export function useUsuarioActual(): {
  usuario: UsuarioActual;
  rol: RolInterfaz | null;
  casosSinRevisar: number;
} {
  const { estado } = useEstadoUsuario();
  if (estado.fase !== "listo") {
    throw new Error("useUsuarioActual se usó antes de cargar el usuario");
  }
  return {
    usuario: estado.usuario,
    rol: rolDeInterfaz(estado.usuario.role),
    casosSinRevisar: estado.casosSinRevisar,
  };
}
