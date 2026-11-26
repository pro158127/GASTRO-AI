// Exportación de la auditoría de cuentas y segundo factor (W-19c/d, RF-DB02 CA 7 y 10).
// `GET /admin/auditoria/exportar?desde=&hasta=` → CSV. Solo ADMINISTRADOR.
//
// **No exporta la bitácora entera.** Solo cuatro tipos de evento —creación de cuenta, envío de
// credencial, vinculación de la app autenticadora y verificación del segundo factor
// (`ACCIONES_EXPORTABLES`, `backend/app/services/bitacora.py:47-52`)—, con las columnas
// `fecha_hora`, `usuario`, `evento`, `resultado` e `ip`. Quien vea el botón después de pasar por
// W-21 va a esperar el registro completo, así que el diálogo lo dice antes de confirmar.
//
// **El período es obligatorio y acotado**, y de ahí salen dos 422 distintos:
// `PERIODO_INVALIDO` (falta un extremo, o el período es demasiado largo) y
// `RANGO_FECHAS_INVALIDO` (`desde` posterior a `hasta`, el mismo de W-21 y W-16).
//
// **Este GET escribe.** Cada exportación que termina bien deja una fila `AUDITORIA_EXPORTADA` en
// la bitácora con el período y el número de filas (`bitacora.py:209-222`). Los rechazos por
// período no dejan rastro: las tres validaciones lanzan antes de publicar el evento
// (`bitacora.py:189-193` frente a `209`). Nada de reintentos automáticos: cada intento bueno es
// una línea más en el registro que el administrador va a leer.
import { solicitarBinario } from "./api";

/**
 * `text/csv`, sin el `charset`: el servidor responde `text/csv; charset=utf-8`
 * (`backend/app/api/routers/admin_bitacora.py:134`) y `solicitarBinario` compara solo la parte
 * anterior al `;`.
 */
const TIPO_CSV = "text/csv";

/** El CSV ya en memoria y el nombre que mandó el servidor (`null` si no se pudo leer). */
export interface ArchivoAuditoria {
  blob: Blob;
  nombreArchivo: string | null;
}

/**
 * `GET /admin/auditoria/exportar`. Los dos extremos son días de Colombia en `YYYY-MM-DD`.
 *
 * **Los parámetros nunca van vacíos.** `desde` y `hasta` son `date | None` en el servidor: una
 * cadena vacía no es «ausente», falla en la validación y responde un 422 `DATOS_INVALIDOS` que
 * no tiene nada que ver con el período. O va la fecha, o no va el parámetro.
 *
 * **Aquí no se comprueba ninguna firma de archivo**, al revés que el reporte en PDF: un CSV no
 * tiene firma. Lo que cabe comprobar —que la respuesta declare `text/csv` y que el cuerpo no
 * venga vacío— ya lo hace `solicitarBinario`.
 *
 * **Y un CSV sin ninguna fila es un éxito.** Si en el período no hubo ninguno de los cuatro
 * eventos, el servidor responde 200 con un archivo que solo tiene la cabecera; eso sigue
 * pesando (BOM más los cinco nombres de columna, `bitacora.py:198,224`), así que no choca con el
 * control de cuerpo vacío. Quien venga a «ahorrarse» ese control, que sepa para qué estaba.
 */
export async function exportarAuditoria(desde: string, hasta: string): Promise<ArchivoAuditoria> {
  const parametros = new URLSearchParams();
  if (desde !== "") parametros.set("desde", desde);
  if (hasta !== "") parametros.set("hasta", hasta);

  const { datos, nombreArchivo } = await solicitarBinario(
    `/admin/auditoria/exportar?${parametros.toString()}`,
    { tipoEsperado: TIPO_CSV }
  );
  return { blob: datos, nombreArchivo };
}
