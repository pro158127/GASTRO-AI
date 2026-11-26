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

/**
 * El mes del dashboard (W-15) es **el de Colombia**, no el del navegador: el servidor cuenta
 * `analisis_mes` desde el día 1 a las 00:00 en esa zona (`inicio_de_mes` del backend). Un
 * doctor que abra la pantalla desde otra zona horaria el día 1 vería un mes que no es el que
 * se está contando, así que la zona va fija.
 */
const FORMATO_MES = new Intl.DateTimeFormat("es-CO", {
  month: "long",
  year: "numeric",
  timeZone: "America/Bogota",
});

/**
 * El día de Colombia en `YYYY-MM-DD`, que es lo que entiende un `<input type="date">` y lo que
 * esperan los parámetros `desde` y `hasta` de la API.
 *
 * `en-CA` no es un descuido: es el único locale que `Intl` formatea ya en `YYYY-MM-DD`, así que
 * se usa como formateador ISO con zona horaria, no como idioma. La zona va fija por el mismo
 * motivo que en `FORMATO_MES`: el servidor interpreta esas dos fechas como días de Colombia
 * (`backend/app/services/historial.py:40-41`), de modo que un administrador que mire desde otra
 * zona horaria pediría un período distinto del que cree estar pidiendo.
 */
const FORMATO_DIA_ISO = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Bogota",
});

const UNA_HORA_MS = 60 * 60 * 1000;
const UN_DIA_MS = 24 * UNA_HORA_MS;

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
 * «noviembre de 2026»: el mes de la tarjeta «Análisis este mes» de W-15.
 *
 * **En minúscula**, que es como se escribe un mes en español. Figma lo dibuja con mayúscula
 * porque allí es una línea suelta que empieza frase, pero el detalle de la tarjeta lo lleva
 * dentro de una («Completados en noviembre de 2026»). Quien lo use para empezar una frase le
 * pone la mayúscula en su sitio, que es donde se sabe si la hace falta.
 *
 * @param ahora instante de referencia; parámetro para poder probarlo.
 */
export function mesEnCurso(ahora: Date = new Date()): string {
  return FORMATO_MES.format(ahora);
}

/**
 * El día de Colombia en `YYYY-MM-DD` (W-19c, el período de la auditoría).
 *
 * @param ahora instante de referencia; parámetro para poder probarlo.
 */
export function diaEnColombia(ahora: Date = new Date()): string {
  return FORMATO_DIA_ISO.format(ahora);
}

/**
 * El día de Colombia de hace `dias` días, en `YYYY-MM-DD`.
 *
 * Se resta sobre el instante y se formatea después, en vez de restar sobre la cadena: así el
 * cálculo no depende de cuántos días tiene cada mes ni de los años bisiestos.
 *
 * @param ahora instante de referencia; parámetro para poder probarlo.
 */
export function diaEnColombiaMenos(dias: number, ahora: Date = new Date()): string {
  return diaEnColombia(new Date(ahora.getTime() - dias * UN_DIA_MS));
}

/**
 * Días de diferencia entre dos fechas `YYYY-MM-DD`, o `null` si alguna no se entiende.
 *
 * **Es la diferencia, no los días que abarca el período**: de un día al siguiente es 1, y un
 * período de 366 días contando los dos extremos da 365. Es justo como lo mide el servidor
 * (`backend/app/services/bitacora.py:191`), y por eso quien compare con `max_dias` tiene que
 * restarle uno.
 *
 * Se comparan a mediodía UTC para que ningún horario de verano de la zona del navegador deje
 * la resta en 0,96 días y el redondeo se coma un día.
 */
export function diasEntre(desde: string, hasta: string): number | null {
  const inicio = Date.parse(`${desde}T12:00:00Z`);
  const fin = Date.parse(`${hasta}T12:00:00Z`);
  if (Number.isNaN(inicio) || Number.isNaN(fin)) return null;
  return Math.round((fin - inicio) / UN_DIA_MS);
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
