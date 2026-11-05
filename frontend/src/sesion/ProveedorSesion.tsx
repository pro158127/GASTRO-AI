// Estado de sesión en memoria. El token se guarda con setToken/clearToken de services/api
// (la clave de localStorage que ya existía); aquí no se guarda nada más.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { clearToken, getToken, registrarAlVencerSesion, setToken } from "../services/api";

interface ValorSesion {
  autenticado: boolean;
  /**
   * Por qué se llegó al inicio de sesión. Vive en memoria (no en el historial del navegador)
   * porque RutaProtegida redirige en cuanto `autenticado` pasa a falso y esa redirección
   * pisaría cualquier estado enviado con `navigate`. Se marca en el mismo `setState` que
   * cierra la sesión, así no hay carrera.
   */
  motivoCierre: "cierre" | null;
  iniciarSesion: (token: string) => void;
  cerrarSesion: () => void;
  /** La pantalla de inicio de sesión lo llama al montar: el aviso se muestra una sola vez. */
  consumirMotivoCierre: () => void;
}

const ContextoSesion = createContext<ValorSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [autenticado, setAutenticado] = useState<boolean>(() => Boolean(getToken()));
  const [motivoCierre, setMotivoCierre] = useState<"cierre" | null>(null);

  const iniciarSesion = useCallback((token: string) => {
    setToken(token);
    setMotivoCierre(null);
    setAutenticado(true);
  }, []);

  const cerrarSesion = useCallback(() => {
    clearToken();
    setMotivoCierre("cierre");
    setAutenticado(false);
  }, []);

  const consumirMotivoCierre = useCallback(() => setMotivoCierre(null), []);

  // Una llamada protegida con 401 (el token vence a los 60 minutos y no hay refresh) cierra
  // la sesión; RutaProtegida redirige a /iniciar-sesion sin mostrar mensaje (no marca motivo).
  useEffect(() => {
    registrarAlVencerSesion(() => setAutenticado(false));
    return () => registrarAlVencerSesion(null);
  }, []);

  const valor = useMemo(
    () => ({ autenticado, motivoCierre, iniciarSesion, cerrarSesion, consumirMotivoCierre }),
    [autenticado, motivoCierre, iniciarSesion, cerrarSesion, consumirMotivoCierre]
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion(): ValorSesion {
  const valor = useContext(ContextoSesion);
  if (!valor) {
    throw new Error("useSesion debe usarse dentro de ProveedorSesion");
  }
  return valor;
}
