// Estado de sesión en memoria. La sesión real vive en el servidor y viaja en la cookie HttpOnly
// `gastro_sesion`; aquí solo se guarda lo que responde GET /auth/sesion (etapa, usuario e
// inactividad). Nada se escribe en localStorage ni en sessionStorage, salvo la marca booleana de
// «cierre de sesión pendiente» (ver cierrePendiente.ts), la única excepción permitida.
//
// También vigila la inactividad (useVigilanciaInactividad) y muestra el aviso W-05.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import {
  ErrorApi,
  cerrarSesionEnServidor,
  continuarSesion,
  obtenerSesion,
  registrarManejadoresGlobales,
} from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import type { EtapaSesion, Inactividad, RespuestaSesion, UsuarioActual } from "../types";
import AvisoInactividad from "./AvisoInactividad";
import { borrarCierrePendiente, hayCierrePendiente, marcarCierrePendiente } from "./cierrePendiente";
import PantallaEstadoSesion from "./PantallaEstadoSesion";
import { useVigilanciaInactividad } from "./useVigilanciaInactividad";

/**
 * `cierre`: el servidor confirmó el cierre (W-01f). `cierre_sin_confirmar`: el servidor no
 * respondió; la sesión local se cerró pero la del servidor puede seguir viva. `inactividad`: la
 * sesión se cerró por inactividad (W-01d). `credenciales`: la sesión terminó mientras se
 * pedía el código del segundo factor (por ejemplo, por el bloqueo tras 5 fallos): se muestra el
 * mensaje genérico de W-01b, que no revela si la cuenta está bloqueada (nota de W-04b).
 */
export type MotivoCierre = "cierre" | "cierre_sin_confirmar" | "inactividad" | "credenciales";

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
   * Avanza a la etapa que respondió el servidor (y al usuario, si llegó con el ingreso a ACTIVA).
   * Las guardas llevan a la pantalla de esa etapa. Después refresca `inactividad` con una consulta
   * pasiva (no renueva la sesión): la que había guardada quedó vieja.
   */
  avanzarEtapa: (etapa: EtapaSesion, usuario?: UsuarioActual) => void;
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

/**
 * SESION_EXPIRADA: `motivo: "INACTIVIDAD"` es W-01d. Sin motivo, durante el segundo factor, es
 * el bloqueo de la cuenta (u otra causa que el servidor no revela): mensaje genérico de W-01b.
 */
function motivoDeExpiracion(motivo: string | null, etapa: EtapaSesion | null): MotivoCierre | null {
  if (motivo === "INACTIVIDAD") return "inactividad";
  return etapa === "VINCULAR_TOTP" || etapa === "PENDIENTE_2FA" ? "credenciales" : null;
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
  const [continuando, setContinuando] = useState(false);
  // Etapa actual para los manejadores globales, que se registran una sola vez.
  const etapaRef = useRef<EtapaSesion | null>(null);
  etapaRef.current = estado.fase === "con_sesion" ? estado.etapa : null;

  // Las funciones del vigilante son estables; las opciones se leen en cada llamada.
  const consultarPasivaRef = useRef<() => Promise<boolean>>(async () => false);
  const cerrarPorInactividadRef = useRef<() => void>(() => undefined);
  const vigilancia = useVigilanciaInactividad({
    activo: etapaRef.current !== null,
    conAviso: etapaRef.current === "ACTIVA",
    consultarPasiva: () => consultarPasivaRef.current(),
    cerrarPorInactividad: () => cerrarPorInactividadRef.current(),
  });
  const { registrarConsulta, registrarRenovacion, detener } = vigilancia;

  /**
   * GET /auth/sesion. Actualiza el estado y la referencia de inactividad. Devuelve la sesión, o
   * `null` si el servidor respondió 401 (la sesión local queda cerrada). Lanza en otro error.
   */
  const consultarSesion = useCallback(
    async (pasiva: boolean): Promise<RespuestaSesion | null> => {
      try {
        const consulta = await obtenerSesion({ pasiva });
        registrarConsulta(consulta);
        setEstado(estadoDesdeRespuesta(consulta.sesion));
        return consulta.sesion;
      } catch (error) {
        if (esSinSesion(error)) {
          setMotivoCierre(motivoDeExpiracion((error as ErrorApi).motivo, etapaRef.current));
          setEstado({ fase: "sin_sesion" });
          return null;
        }
        throw error;
      }
    },
    [registrarConsulta]
  );
  consultarPasivaRef.current = async () => (await consultarSesion(true)) !== null;

  const refrescarSesion = useCallback(
    async (): Promise<EtapaSesion | null> => (await consultarSesion(false))?.etapa ?? null,
    [consultarSesion]
  );

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
      .then((consulta) => {
        if (!vigente) return;
        registrarConsulta(consulta);
        setEstado(estadoDesdeRespuesta(consulta.sesion));
      })
      .catch((error: unknown) => {
        if (!vigente) return;
        if (esSinSesion(error)) {
          setMotivoCierre(motivoDeExpiracion((error as ErrorApi).motivo, null));
          setEstado({ fase: "sin_sesion" });
        } else setEstado({ fase: "error", error: error instanceof ErrorApi ? error : null });
      });
    return () => {
      vigente = false;
    };
  }, [intento, registrarConsulta]);

  const avanzarEtapa = useCallback(
    (etapa: EtapaSesion, usuario?: UsuarioActual) => {
      setEstado((previo) =>
        previo.fase === "con_sesion"
          ? { ...previo, etapa, usuario: usuario ?? previo.usuario }
          : previo
      );
      consultarSesion(true).catch(() => {
        // Si falla, `inactividad` queda con el valor anterior hasta la próxima consulta.
      });
    },
    [consultarSesion]
  );

  // Evita dobles llamadas si se pulsa «Cerrar sesión» dos veces antes de que responda.
  const cerrandoRef = useRef(false);
  const cerrarSesion = useCallback(async () => {
    if (cerrandoRef.current) return;
    cerrandoRef.current = true;
    // El 2xx del logout no debe contar como actividad.
    detener();
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
  }, [detener]);

  // Cierre por inactividad desde el frontend: el servidor no confirmó el cierre tras los
  // reintentos, o no hay red al vencer. Lleva a W-01d en cualquier caso.
  cerrarPorInactividadRef.current = async () => {
    if (cerrandoRef.current) return;
    cerrandoRef.current = true;
    detener();
    try {
      await cerrarSesionEnServidor("inactividad");
      borrarCierrePendiente();
    } catch {
      marcarCierrePendiente();
    }
    cerrandoRef.current = false;
    setMotivoCierre("inactividad");
    setEstado({ fase: "sin_sesion" });
  };

  // «Seguir conectado» (y Esc) de W-05. Si responde 2xx, `alActividadRenovada` reinicia el
  // contador y el aviso se cierra. Un 401 lleva a W-01d por el manejador global. Sin red o con
  // un 5xx el aviso sigue abierto y la cuenta continúa (Figma no dibuja ese error).
  const continuandoRef = useRef(false);
  const seguirConectado = useCallback(() => {
    if (continuandoRef.current) return;
    continuandoRef.current = true;
    setContinuando(true);
    continuarSesion()
      .catch(() => {
        // Ver el comentario de arriba: no hay estado de error dibujado.
      })
      .finally(() => {
        continuandoRef.current = false;
        setContinuando(false);
      });
  }, []);

  const consumirMotivoCierre = useCallback(() => setMotivoCierre(null), []);

  // 401 SESION_EXPIRADA: se descarta la sesión local y las guardas llevan a /iniciar-sesion; con
  // `motivo: INACTIVIDAD` se marca el motivo para mostrar W-01d, y si no, sin mensaje. 403 PERMISO_DENEGADO: lleva a W-28. 403 ETAPA_INVALIDA: falta un
  // paso; se toma la etapa que trae el error (o, si no vino, se vuelve a consultar la sesión) y
  // las guardas llevan a la pantalla de esa etapa. Toda respuesta 2xx no pasiva reinicia el
  // contador de inactividad.
  useEffect(() => {
    registrarManejadoresGlobales({
      alSinSesion: (motivo) => {
        setMotivoCierre(motivoDeExpiracion(motivo, etapaRef.current));
        setEstado({ fase: "sin_sesion" });
      },
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
      alActividadRenovada: registrarRenovacion,
    });
    return () => registrarManejadoresGlobales(null);
  }, [refrescarSesion, navigate, registrarRenovacion]);

  const valor = useMemo<ValorSesion>(() => {
    const conSesion = estado.fase === "con_sesion" ? estado : null;
    return {
      etapa: conSesion?.etapa ?? null,
      usuario: conSesion?.usuario ?? null,
      autenticado: conSesion?.etapa === "ACTIVA",
      motivoCierre,
      refrescarSesion,
      avanzarEtapa,
      cerrarSesion,
      consumirMotivoCierre,
    };
  }, [estado, motivoCierre, refrescarSesion, avanzarEtapa, cerrarSesion, consumirMotivoCierre]);

  let contenido: ReactNode = children;
  // Mientras se confirma el cierre por inactividad no se muestra la pantalla anterior.
  if (estado.fase === "cargando" || estado.fase === "error" || vigilancia.verificandoCierre) {
    contenido = (
      <PantallaEstadoSesion
        error={estado.fase === "error" ? { causa: estado.error } : null}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }
  const mostrarAviso =
    estado.fase === "con_sesion" &&
    estado.etapa === "ACTIVA" &&
    !vigilancia.verificandoCierre &&
    vigilancia.segundosAviso !== null;

  return (
    <ContextoSesion.Provider value={valor}>
      {contenido}
      {mostrarAviso && (
        <AvisoInactividad
          segundos={vigilancia.segundosAviso ?? 0}
          continuando={continuando}
          onSeguirConectado={seguirConectado}
          onCerrarSesion={cerrarSesion}
        />
      )}
    </ContextoSesion.Provider>
  );
}

export function useSesion(): ValorSesion {
  const valor = useContext(ContextoSesion);
  if (!valor) {
    throw new Error("useSesion debe usarse dentro de ProveedorSesion");
  }
  return valor;
}
