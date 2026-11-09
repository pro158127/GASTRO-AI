// Estado de sesión en memoria. La sesión real vive en el servidor y viaja en la cookie HttpOnly
// `gastro_sesion`; aquí solo se guarda lo que responde GET /auth/sesion (etapa, usuario e
// inactividad). Nada se escribe en localStorage ni en sessionStorage.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  ErrorApi,
  cerrarSesionEnServidor,
  obtenerSesion,
  registrarManejadoresGlobales,
} from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import type { EtapaSesion, Inactividad, RespuestaSesion, UsuarioActual } from "../types";
import { borrarCierrePendiente, hayCierrePendiente, marcarCierrePendiente } from "./cierrePendiente";
import PantallaEstadoSesion from "./PantallaEstadoSesion";

/**
 * `cierre`: el servidor confirmó el cierre (W-01f). `cierre_sin_confirmar`: el servidor no
 * respondió; la sesión local se cerró pero la del servidor puede seguir viva.
 */
type MotivoCierre = "cierre" | "cierre_sin_confirmar";

type EstadoSesion =
  | { fase: "cargando" }
  | { fase: "error"; error: ErrorApi | null }
  | { fase: "sin_sesion" }
  | { fase: "con_sesion"; etapa: EtapaSesion; inactividad: Inactividad; usuario: UsuarioActual };

interface ValorSesion {
  /** Etapa de la sesión actual; `null` si no hay sesión. */
  etapa: EtapaSesion | null;
  /** Usuario de la sesión; `null` si no hay sesión. Existe desde la etapa de cambio de contraseña. */
  usuario: UsuarioActual | null;
  /** Solo con la etapa ACTIVA se entra a las pantallas internas. */
  autenticado: boolean;
  /**
   * Por qué se llegó al inicio de sesión. Vive en memoria (no en el historial del navegador)
   * porque las guardas redirigen en cuanto la sesión desaparece y esa redirección pisaría
   * cualquier estado enviado con `navigate`. Se marca en el mismo `setState` que cierra la
   * sesión, así no hay carrera.
   */
  motivoCierre: MotivoCierre | null;
  /**
   * Vuelve a consultar GET /auth/sesion y actualiza el estado. Devuelve la etapa, o `null` si
   * ya no hay sesión. Lanza ErrorApi si falla por red o por el servidor.
   */
  refrescarSesion: () => Promise<EtapaSesion | null>;
  /**
   * Cierra la sesión en el servidor (POST /auth/logout) y, pase lo que pase con esa llamada
   * (sin conexión, error), también la local, para que nadie quede atrapado en una sesión que
   * no puede cerrar. Si el servidor no confirma, deja la marca de cierre pendiente.
   */
  cerrarSesion: () => Promise<void>;
  /** La pantalla de inicio de sesión lo llama al montar: el aviso se muestra una sola vez. */
  consumirMotivoCierre: () => void;
}

const ContextoSesion = createContext<ValorSesion | null>(null);

function esSinSesion(error: unknown): boolean {
  return (
    error instanceof ErrorApi &&
    error.estado === 401 &&
    error.codigo === CodigoErrorApi.SESION_EXPIRADA
  );
}

function estadoDesdeRespuesta(respuesta: RespuestaSesion): EstadoSesion {
  return {
    fase: "con_sesion",
    etapa: respuesta.etapa,
    inactividad: respuesta.inactividad,
    usuario: respuesta.usuario,
  };
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<EstadoSesion>({ fase: "cargando" });
  const [motivoCierre, setMotivoCierre] = useState<MotivoCierre | null>(null);
  const [intento, setIntento] = useState(0);

  const refrescarSesion = useCallback(async (): Promise<EtapaSesion | null> => {
    try {
      const respuesta = await obtenerSesion();
      setEstado(estadoDesdeRespuesta(respuesta));
      return respuesta.etapa;
    } catch (error) {
      if (esSinSesion(error)) {
        setEstado({ fase: "sin_sesion" });
        return null;
      }
      throw error;
    }
  }, []);

  // Al cargar (o recargar) la página se pregunta al servidor quién es el usuario.
  useEffect(() => {
    let vigente = true;
    setEstado({ fase: "cargando" });
    // Si un cierre de sesión quedó sin confirmar, primero se reintenta; la marca se borra solo
    // cuando el servidor responde 204. Si el reintento falla, no se consulta la sesión (podría
    // reabrir la cuenta anterior) y se muestra el error con «Reintentar».
    const reintentoCierre = hayCierrePendiente()
      ? cerrarSesionEnServidor().then(borrarCierrePendiente)
      : Promise.resolve();
    reintentoCierre
      .then(() => obtenerSesion())
      .then((respuesta) => {
        if (vigente) setEstado(estadoDesdeRespuesta(respuesta));
      })
      .catch((error: unknown) => {
        if (!vigente) return;
        if (esSinSesion(error)) setEstado({ fase: "sin_sesion" });
        else setEstado({ fase: "error", error: error instanceof ErrorApi ? error : null });
      });
    return () => {
      vigente = false;
    };
  }, [intento]);

  // Evita dobles llamadas si se pulsa «Cerrar sesión» dos veces antes de que responda.
  const cerrandoRef = useRef(false);
  const cerrarSesion = useCallback(async () => {
    if (cerrandoRef.current) return;
    cerrandoRef.current = true;
    let confirmado = true;
    try {
      await cerrarSesionEnServidor();
      borrarCierrePendiente();
    } catch {
      // La cookie HttpOnly solo la borra el servidor: la local se cierra de todos modos, pero
      // se deja la marca para reintentar el cierre al recargar y se avisa que no se confirmó.
      confirmado = false;
      marcarCierrePendiente();
    }
    cerrandoRef.current = false;
    setMotivoCierre(confirmado ? "cierre" : "cierre_sin_confirmar");
    setEstado({ fase: "sin_sesion" });
  }, []);

  const consumirMotivoCierre = useCallback(() => setMotivoCierre(null), []);

  // 401 SESION_EXPIRADA: se descarta la sesión local y las guardas llevan a /iniciar-sesion sin
  // mensaje (no marca motivo). 403 PERMISO_DENEGADO: lleva a W-28. 403 ETAPA_INVALIDA: falta un
  // paso; se toma la etapa que trae el error (o, si no vino, se vuelve a consultar la sesión) y
  // las guardas llevan a la pantalla de esa etapa.
  useEffect(() => {
    registrarManejadoresGlobales({
      alSinSesion: () => setEstado({ fase: "sin_sesion" }),
      // La sesión sigue activa; solo se informa.
      alSinPermiso: () => navigate("/sin-permisos"),
      alEtapaInvalida: (etapa) => {
        if (etapa !== null) {
          setEstado((previo) => (previo.fase === "con_sesion" ? { ...previo, etapa } : previo));
          return;
        }
        refrescarSesion().catch(() => {
          // Si la consulta falla, la siguiente acción del usuario volverá a intentarlo.
        });
      },
    });
    return () => registrarManejadoresGlobales(null);
  }, [refrescarSesion, navigate]);

  const valor = useMemo<ValorSesion>(() => {
    const conSesion = estado.fase === "con_sesion" ? estado : null;
    return {
      etapa: conSesion?.etapa ?? null,
      usuario: conSesion?.usuario ?? null,
      autenticado: conSesion?.etapa === "ACTIVA",
      motivoCierre,
      refrescarSesion,
      cerrarSesion,
      consumirMotivoCierre,
    };
  }, [estado, motivoCierre, refrescarSesion, cerrarSesion, consumirMotivoCierre]);

  let contenido: ReactNode = children;
  if (estado.fase === "cargando" || estado.fase === "error") {
    contenido = (
      <PantallaEstadoSesion
        error={estado.fase === "error" ? { causa: estado.error } : null}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }

  return <ContextoSesion.Provider value={valor}>{contenido}</ContextoSesion.Provider>;
}

export function useSesion(): ValorSesion {
  const valor = useContext(ContextoSesion);
  if (!valor) {
    throw new Error("useSesion debe usarse dentro de ProveedorSesion");
  }
  return valor;
}
