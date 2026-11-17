// Cálculo del tiempo de inactividad de la sesión (W-05, RF-U10) sin depender del reloj del equipo.
//
// Una referencia dice «en el instante local `instante` (performance.now(), monotónico) el
// servidor llevaba `transcurridoS` segundos sin actividad». De ahí en adelante el tiempo avanza
// con performance.now(), que no salta si el usuario cambia la hora del equipo. Los hitos
// (`aviso_en_s`, `cierre_en_s`) salen siempre de GET /auth/sesion: aquí no hay números fijos.
//
// Date.now() solo se usa para detectar saltos (suspensión del equipo), nunca para medir.
import type { Inactividad } from "../types";

export interface ReferenciaInactividad {
  /** Segundos sin actividad según el servidor en el instante `instante`. */
  transcurridoS: number;
  /** `performance.now()` en el que vale `transcurridoS`. */
  instante: number;
  avisoEnS: number;
  cierreEnS: number;
}

export type FaseInactividad = "normal" | "aviso" | "vencida";

/**
 * La cabecera `Date` va truncada al segundo: se suma 1 s para no dar nunca más tiempo del que
 * queda (el aviso sale como mucho 1 s antes, nunca después).
 */
const MARGEN_TRUNCADO_S = 1;

/** Una fecha ISO sin zona se toma como UTC (el contrato manda UTC). */
function milisegundosDeIso(iso: string): number {
  const conZona = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
  return Date.parse(conZona);
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

/**
 * Referencia a partir de GET /auth/sesion. Lo transcurrido se mide entre dos fechas del servidor
 * (`Date` menos `ultima_actividad_en`), así que el desfase del equipo no influye. Sin cabecera
 * `Date` se usa el reloj local, limitado al rango válido, como último recurso.
 */
export function referenciaDesdeConsulta(
  inactividad: Inactividad,
  fechaServidorMs: number | null,
  instanteRecibido: number
): ReferenciaInactividad {
  const ultimaActividadMs = milisegundosDeIso(inactividad.ultima_actividad_en);
  const ahoraServidorMs = fechaServidorMs ?? Date.now();
  const crudo = Number.isNaN(ultimaActividadMs)
    ? 0
    : (ahoraServidorMs - ultimaActividadMs) / 1000 + (fechaServidorMs === null ? 0 : MARGEN_TRUNCADO_S);
  return {
    transcurridoS: limitar(crudo, 0, inactividad.cierre_en_s),
    instante: instanteRecibido,
    avisoEnS: inactividad.aviso_en_s,
    cierreEnS: inactividad.cierre_en_s,
  };
}

/** El servidor acaba de renovar la sesión: lo transcurrido vuelve a 0 desde el envío. */
export function referenciaRenovada(previa: ReferenciaInactividad, instanteEnvio: number): ReferenciaInactividad {
  return { ...previa, transcurridoS: 0, instante: instanteEnvio };
}

export function segundosTranscurridos(referencia: ReferenciaInactividad, ahora: number): number {
  return referencia.transcurridoS + Math.max(0, ahora - referencia.instante) / 1000;
}

export function segundosRestantes(referencia: ReferenciaInactividad, ahora: number): number {
  return referencia.cierreEnS - segundosTranscurridos(referencia, ahora);
}

export function faseInactividad(referencia: ReferenciaInactividad, ahora: number): FaseInactividad {
  const transcurrido = segundosTranscurridos(referencia, ahora);
  if (transcurrido >= referencia.cierreEnS) return "vencida";
  if (transcurrido >= referencia.avisoEnS) return "aviso";
  return "normal";
}

/** Milisegundos hasta el próximo hito (aviso o cierre); 0 si ya venció. */
export function msHastaSiguienteHito(referencia: ReferenciaInactividad, ahora: number): number {
  const transcurrido = segundosTranscurridos(referencia, ahora);
  const hito = transcurrido < referencia.avisoEnS ? referencia.avisoEnS : referencia.cierreEnS;
  return Math.max(0, (hito - transcurrido) * 1000);
}
