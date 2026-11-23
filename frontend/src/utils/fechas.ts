// Fechas y horas tal como las escribe Figma en las pantallas del administrador.
//
// La API manda ISO 8601 en UTC (../ARCHITECTURE.md § 3.5); aquí se muestran en la zona horaria
// del navegador, que es lo que espera quien lee la pantalla. El formato es el de Figma:
// «14/10/2026 08:30», con reloj de 24 horas.

const FORMATO_COMPLETO = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const FORMATO_SOLO_FECHA = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const FORMATO_SIN_ANIO = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const UNA_HORA_MS = 60 * 60 * 1000;

/** Quita la coma que `Intl` mete entre la fecha y la hora: «14/10/2026, 08:30» → «14/10/2026 08:30». */
function sinComa(texto: string): string {
  return texto.replace(",", "");
}

/** «14/10/2026 08:30». Cadena vacía si la fecha no es válida (no se inventa un valor). */
export function fechaHoraCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return sinComa(FORMATO_COMPLETO.format(fecha));
}

/**
 * «18/10/2026», sin hora. Lo usa el aviso de paciente con historial de W-06b, donde Figma
 * escribe solo el día: la hora del último análisis no aporta nada ahí.
 */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return FORMATO_SOLO_FECHA.format(fecha);
}

/** «20/10 14:02»: el año se omite dentro de la frase de vigencia, como en Figma. */
export function fechaHoraSinAnio(iso: string | null | undefined): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return sinComa(FORMATO_SIN_ANIO.format(fecha));
}

/**
 * Columna «Vigencia» de W-20 (RNF-27). La contraseña temporal dura 72 horas, así que el tiempo
 * que falta siempre se dice en horas, como dibuja Figma («Vence en 19 h (20/10 14:02)»).
 *
 * El texto dice con palabras si ya venció: el color de advertencia solo lo refuerza (WCAG 1.4.1).
 *
 * @param expiraEn `temporal_expira_en` de la cuenta.
 * @param ahora instante de referencia; parámetro para poder probarlo.
 */
export function textoVigencia(expiraEn: string | null | undefined, ahora: Date = new Date()): string {
  if (!expiraEn) return "";
  const expira = new Date(expiraEn);
  if (Number.isNaN(expira.getTime())) return "";

  const restante = expira.getTime() - ahora.getTime();
  if (restante <= 0) return `Venció el ${fechaHoraCorta(expiraEn)}`;

  const cuando = fechaHoraSinAnio(expiraEn);
  const horas = Math.floor(restante / UNA_HORA_MS);
  if (horas < 1) return `Vence en menos de 1 h (${cuando})`;
  return `Vence en ${horas} h (${cuando})`;
}
