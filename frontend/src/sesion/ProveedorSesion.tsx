// Estado de sesión en memoria. La sesión real vive en el servidor y viaja en la cookie HttpOnly
// `gastro_sesion`; aquí solo se guarda lo que responde GET /auth/sesion (etapa, usuario y
// vencimiento). Nada se escribe en localStorage ni en sessionStorage.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ErrorApi, obtenerSesion, registrarManejadoresGlobales } from "../services/api";
import type { EtapaSesion, RespuestaSesion, UsuarioActual } from "../types";
import PantallaEstadoSesion from "./PantallaEstadoSesion";

type EstadoSesion =
  | { fase: "cargando" }
  | { fase: "error"; error: ErrorApi | null }
  | { fase: "sin_sesion" }
  | { fase: "con_sesion"; etapa: EtapaSesion; venceEn: string; usuario: UsuarioActual };

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
  motivoCierre: "cierre" | null;
  /**
   * Vuelve a consultar GET /auth/sesion y actualiza el estado. Devuelve la etapa, o `null` si
   * ya no hay sesión. Lanza ErrorApi si falla por red o por el servidor.
   */
  refrescarSesion: () => Promise<EtapaSesion | null>;
  cerrarSesion: () => void;
  /** La pantalla de inicio de sesión lo llama al montar: el aviso se muestra una sola vez. */
  consumirMotivoCierre: () => void;
}

const ContextoSesion = createContext<ValorSesion | null>(null);

function esSinSesion(error: unknown): boolean {
  return (
    error instanceof ErrorApi &&
    error.estado === 401 &&
    (error.codigo === "SIN_SESION" || error.codigo === "SESION_VENCIDA")
  );
}

function estadoDesdeRespuesta(respuesta: RespuestaSesion): EstadoSesion {
  return {
    fase: "con_sesion",
    etapa: respuesta.etapa,
    venceEn: respuesta.vence_en,
    usuario: respuesta.usuario,
  };
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ fase: "cargando" });
  const [motivoCierre, setMotivoCierre] = useState<"cierre" | null>(null);
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
    obtenerSesion()
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

  const cerrarSesion = useCallback(() => {
    setMotivoCierre("cierre");
    setEstado({ fase: "sin_sesion" });
  }, []);

  const consumirMotivoCierre = useCallback(() => setMotivoCierre(null), []);

  // 401 SIN_SESION / SESION_VENCIDA: se descarta la sesión local y las guardas llevan a
  // /iniciar-sesion sin mensaje (no marca motivo). ETAPA_INVALIDA: falta un paso; se vuelve
  // a consultar y las guardas llevan a la pantalla de la etapa correcta.
  useEffect(() => {
    registrarManejadoresGlobales({
      alSinSesion: () => setEstado({ fase: "sin_sesion" }),
      alEtapaInvalida: () => {
        refrescarSesion().catch(() => {
          // Si la consulta falla, la siguiente acción del usuario volverá a intentarlo.
        });
      },
    });
    return () => registrarManejadoresGlobales(null);
  }, [refrescarSesion]);

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
