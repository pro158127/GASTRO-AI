// Vigilante de inactividad de la sesión (W-05, RF-U10 CA 3–5; corrige FM-14).
//
// El servidor cierra la sesión tras `cierre_en_s` sin peticiones no pasivas, pero la navegación
// interna no hace peticiones: sin este vigilante la interfaz seguía abierta hasta la siguiente
// llamada a la API. Reglas:
// - El tiempo se calcula con relojInactividad.ts (reloj del servidor + performance.now()). Los
//   temporizadores solo dicen «vuelve a calcular»: si el navegador los atrasa (pestaña en segundo
//   plano), el cálculo sigue siendo correcto cuando se ejecutan.
// - Antes de mostrar el aviso y antes de cerrar se consulta GET /auth/sesion en modo pasivo, por
//   si otra pestaña renovó la sesión.
// - En cada disparo se compara el avance de Date.now() con el de performance.now(): si difieren
//   más de 5 s, el equipo se suspendió (performance.now() puede detenerse) y se consulta al
//   servidor de inmediato. Date.now() nunca se usa para medir.
// - Al cierre, si el servidor sigue sin cerrar la sesión (redondeos), se reintenta hasta 5 veces;
//   al llegar al tope, o si no hay red, el proveedor cierra la sesión desde el frontend.
import { useEffect, useRef, useState } from "react";
import type { ConsultaSesion } from "../services/api";
import {
  faseInactividad,
  msHastaSiguienteHito,
  referenciaDesdeConsulta,
  referenciaRenovada,
  segundosRestantes,
} from "./relojInactividad";
import type { ReferenciaInactividad } from "./relojInactividad";

/** Diferencia entre el avance de Date.now() y el de performance.now() que indica una suspensión. */
const UMBRAL_SALTO_MS = 5000;
/** Reintentos de la consulta de cierre mientras el servidor aún no cierra la sesión. */
const MAX_REINTENTOS_CIERRE = 5;
const ESPERA_REINTENTO_MS = 1000;
/** Evita reprogramar el temporizador con 0 ms en bucle. */
const ESPERA_MINIMA_MS = 50;

interface OpcionesVigilancia {
  /** Hay sesión (en cualquier etapa): el vigilante corre. */
  activo: boolean;
  /** Etapa ACTIVA: se muestra W-05. En las demás no hay aviso (no se permite /sesion/continuar). */
  conAviso: boolean;
  /**
   * GET /auth/sesion pasiva. `true` si la sesión sigue (y ya se llamó a `registrarConsulta`);
   * `false` si el servidor respondió 401 (el proveedor ya cerró la sesión local). Lanza si falla
   * por red o por el servidor.
   */
  consultarPasiva: () => Promise<boolean>;
  /** Cierre desde el frontend: tope de reintentos o sin red al vencer. */
  cerrarPorInactividad: () => void;
}

export interface VigilanciaInactividad {
  /** Segundos que muestra W-05; `null` si el aviso no está visible. */
  segundosAviso: number | null;
  /**
   * La estimación local ya pasó el cierre y se está confirmando con el servidor: mientras tanto
   * no se muestra el contenido de la pantalla.
   */
  verificandoCierre: boolean;
  /** Toda respuesta de GET /auth/sesion pasa por aquí. */
  registrarConsulta: (consulta: ConsultaSesion) => void;
  /** Respuesta 2xx de una petición no pasiva (manejador `alActividadRenovada`). */
  registrarRenovacion: (instanteEnvio: number) => void;
  /** Se llama antes de enviar el logout, para que su 2xx no cuente como actividad. */
  detener: () => void;
}

interface Vigilante {
  activar: () => void;
  detener: () => void;
  reevaluar: () => void;
  verificar: () => void;
  registrarConsulta: (consulta: ConsultaSesion) => void;
  registrarRenovacion: (instanteEnvio: number) => void;
}

function crearVigilante(
  opciones: () => OpcionesVigilancia,
  alCambiarAviso: (segundos: number | null) => void,
  alCambiarVerificando: (verificando: boolean) => void
): Vigilante {
  let referencia: ReferenciaInactividad | null = null;
  let detenido = true;
  let consultando = false;
  let reintentos = 0;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  /** Relojes en el momento de programar el temporizador, para detectar saltos. */
  let marca: { pared: number; mono: number } | null = null;
  let segundosMostrados: number | null = null;
  let verificando = false;

  function mostrarAviso(segundos: number | null) {
    if (segundos === segundosMostrados) return;
    segundosMostrados = segundos;
    alCambiarAviso(segundos);
  }

  function marcarVerificando(valor: boolean) {
    if (valor === verificando) return;
    verificando = valor;
    alCambiarVerificando(valor);
  }

  function cancelar() {
    if (temporizador !== null) clearTimeout(temporizador);
    temporizador = null;
  }

  function programar(ms: number) {
    cancelar();
    marca = { pared: Date.now(), mono: performance.now() };
    temporizador = setTimeout(alDisparar, Math.max(ESPERA_MINIMA_MS, ms));
  }

  function huboSalto(): boolean {
    if (marca === null) return false;
    const avancePared = Date.now() - marca.pared;
    const avanceMono = performance.now() - marca.mono;
    return Math.abs(avancePared - avanceMono) > UMBRAL_SALTO_MS;
  }

  function alDisparar() {
    temporizador = null;
    if (detenido) return;
    if (huboSalto()) void verificar();
    else evaluar(false);
  }

  function detener() {
    detenido = true;
    cancelar();
    referencia = null;
    reintentos = 0;
    marca = null;
    mostrarAviso(null);
    marcarVerificando(false);
  }

  function cerrar() {
    detener();
    opciones().cerrarPorInactividad();
  }

  /** `confirmado`: la referencia acaba de llegar del servidor; no hace falta volver a consultar. */
  function evaluar(confirmado: boolean) {
    if (detenido || consultando) return;
    const { activo, conAviso } = opciones();
    if (!activo || referencia === null) {
      cancelar();
      mostrarAviso(null);
      return;
    }
    const ahora = performance.now();
    const fase = faseInactividad(referencia, ahora);

    if (fase === "vencida") {
      mostrarAviso(null);
      marcarVerificando(true);
      void verificar();
      return;
    }

    reintentos = 0;
    marcarVerificando(false);

    if (fase === "aviso" && conAviso) {
      if (segundosMostrados === null && !confirmado) {
        void verificar();
        return;
      }
      const restante = segundosRestantes(referencia, ahora);
      const mostrado = Math.ceil(restante);
      mostrarAviso(mostrado);
      // Próximo cambio del número entero que se muestra.
      programar((restante - (mostrado - 1)) * 1000);
      return;
    }

    mostrarAviso(null);
    programar(msHastaSiguienteHito(referencia, ahora));
  }

  async function verificar() {
    if (detenido || consultando) return;
    consultando = true;
    cancelar();
    let respondio = true;
    try {
      const sigue = await opciones().consultarPasiva();
      if (!sigue) {
        // 401: el proveedor ya cerró la sesión local y lleva al inicio de sesión.
        consultando = false;
        detener();
        return;
      }
    } catch {
      respondio = false;
    }
    consultando = false;
    if (detenido || referencia === null) return;

    if (faseInactividad(referencia, performance.now()) === "vencida") {
      if (!respondio || reintentos >= MAX_REINTENTOS_CIERRE) {
        cerrar();
        return;
      }
      reintentos += 1;
      marcarVerificando(true);
      programar(ESPERA_REINTENTO_MS);
      return;
    }
    // Sin respuesta antes del aviso: se sigue con la estimación local (el aviso sale igual).
    evaluar(true);
  }

  return {
    activar() {
      if (!detenido) return;
      detenido = false;
      evaluar(false);
    },
    detener,
    reevaluar() {
      evaluar(false);
    },
    verificar() {
      void verificar();
    },
    registrarConsulta(consulta) {
      const { inactividad } = consulta.sesion;
      referencia = referenciaDesdeConsulta(inactividad, consulta.fechaServidorMs, consulta.instanteRecibido);
      evaluar(true);
    },
    registrarRenovacion(instanteEnvio) {
      if (detenido || referencia === null) return;
      referencia = referenciaRenovada(referencia, instanteEnvio);
      evaluar(true);
    },
  };
}

export function useVigilanciaInactividad(opciones: OpcionesVigilancia): VigilanciaInactividad {
  const opcionesRef = useRef(opciones);
  opcionesRef.current = opciones;
  const [segundosAviso, setSegundosAviso] = useState<number | null>(null);
  const [verificandoCierre, setVerificandoCierre] = useState(false);
  const [vigilante] = useState(() =>
    crearVigilante(() => opcionesRef.current, setSegundosAviso, setVerificandoCierre)
  );

  const { activo, conAviso } = opciones;
  useEffect(() => {
    if (activo) vigilante.activar();
    else vigilante.detener();
  }, [activo, vigilante]);

  // Al pasar a ACTIVA (o salir de ella) cambia si hay aviso.
  useEffect(() => {
    vigilante.reevaluar();
  }, [conAviso, vigilante]);

  // Al volver a la pestaña, al restaurarla desde la caché o al recuperar la red, el temporizador
  // pudo atrasarse mucho: se consulta al servidor de inmediato.
  useEffect(() => {
    function alVolverVisible() {
      if (document.visibilityState === "visible") vigilante.verificar();
    }
    const alReanudar = () => vigilante.verificar();
    document.addEventListener("visibilitychange", alVolverVisible);
    window.addEventListener("pageshow", alReanudar);
    window.addEventListener("online", alReanudar);
    return () => {
      document.removeEventListener("visibilitychange", alVolverVisible);
      window.removeEventListener("pageshow", alReanudar);
      window.removeEventListener("online", alReanudar);
      vigilante.detener();
    };
  }, [vigilante]);

  return {
    segundosAviso,
    verificandoCierre,
    registrarConsulta: vigilante.registrarConsulta,
    registrarRenovacion: vigilante.registrarRenovacion,
    detener: vigilante.detener,
  };
}
