// Pantalla W-15 · Dashboard clínico del doctor (Figma 62:3316, RF-DB01). Solo rol DOCTOR.
//
// Es la pantalla inicial del doctor y resume **solo su propia actividad**: lo que recibió por
// traslado se informa aparte y no cambia sus indicadores (RF-A07 CA 2). Nada identifica al
// paciente: los análisis se nombran por su código (RNF-24).
//
// Estados dibujados que se implementan aquí:
//
// - W-15  (62:3316): con datos.
// - W-12  (54:2087): `primer_uso` → las cinco cifras en cero y el estado vacío «Realizar el
//   primer análisis», **sin gráficas** (RF-DB01 CA 10).
// - W-15e (98:5203): cargando, con esqueletos y «Cargando…» visible.
// - W-15b/c/d (82:6892, 82:7065, 82:7237): uno o varios traslados nuevos, siempre en **un
//   solo** aviso encima de las cifras.
//
// Para el fallo de carga no hay frame propio: se usan los estados globales W-30 (sin conexión)
// y W-31 (error inesperado) en una alerta con «Reintentar», como en W-16.
import EncabezadoPagina from "../components/EncabezadoPagina";
import Alerta from "../components/Alerta";
import AvisoExperimental from "../components/AvisoExperimental";
import Boton from "../components/Boton";
import EnlaceBoton from "../components/EnlaceBoton";
import Esqueleto from "../components/Esqueleto";
import EstadoVacio from "../components/EstadoVacio";
import TarjetaIndicador from "../components/TarjetaIndicador";
import type {
  AvisoTraslado,
  CasosRecibidos,
  ConcordanciaDoctor,
  DashboardDoctor,
  OrigenTraslado,
} from "../types";
import { fechaCorta, mesEnCurso } from "../utils/fechas";
import { porcentajeDirecto } from "../utils/numeros";
import DashboardCasosRecientes from "./DashboardCasosRecientes";
import DashboardFrecuencia from "./DashboardFrecuencia";
import RecorridoGuiado from "./RecorridoGuiado";
import { PASOS_RECORRIDO_DOCTOR } from "./pasosRecorridoDoctor";
import { useDashboardDoctor } from "./useDashboardDoctor";
import { useRecorridoGuiado } from "./useRecorridoGuiado";
import estilos from "./Dashboard.module.css";

/** W-15e dibuja cinco tarjetas de indicador y cinco filas. */
const TARJETAS_ESQUELETO = 5;
const FILAS_ESQUELETO = 5;

/**
 * Detalle de «Concordancia con el modelo».
 *
 * El porcentaje es coincide / (coincide + no coincide): **los no concluyentes no entran**. Por
 * eso se nombran siempre que los haya y se dice que no entran; si no, la cifra parecería mal
 * calculada y el dato del contrato quedaría sin informar. Figma no le dejó sitio a este
 * número, así que esa parte de la frase es una propuesta (ver CONTRATOS_API.md).
 *
 * Son **tres** estados, y se distinguen con los tres conteos, no con el porcentaje: este llega
 * nulo tanto cuando no hay ninguna valoración como cuando todas son no concluyentes, y decir
 * «Sin valoraciones todavía» en el segundo caso es falso, además de esconder justo el dato que
 * el contrato manda informar aparte.
 */
function detalleConcordancia(concordancia: ConcordanciaDoctor): string {
  const { coincide, no_coincide, no_concluyente } = concordancia;
  const evaluados = coincide + no_coincide;

  // 1. Ninguna valoración todavía (el texto de W-12).
  if (evaluados === 0 && no_concluyente === 0) return "Sin valoraciones todavía";

  // 2. Sí valoró, pero ninguna entra en el cálculo: el valor de la tarjeta es «—» y aquí se
  //    dice por qué.
  if (evaluados === 0) {
    return no_concluyente === 1
      ? "1 valoración, no concluyente: no entra en el porcentaje"
      : `${no_concluyente} valoraciones, todas no concluyentes: no entran en el porcentaje`;
  }

  // 3. Hay porcentaje: su base y, si los hay, los no concluyentes que quedaron fuera.
  const base = `${coincide} de ${evaluados} análisis valorados`;
  if (no_concluyente === 0) return base;
  return no_concluyente === 1
    ? `${base} · 1 no concluyente, que no entra en el porcentaje`
    : `${base} · ${no_concluyente} no concluyentes, que no entran en el porcentaje`;
}

/**
 * Detalle de «Casos recibidos». Figma escribe «2 traslados» (el total), pero la respuesta solo
 * trae los traslados **nuevos**, así que el texto dice lo que el número es de verdad. El total
 * queda propuesto al backend en CONTRATOS_API.md.
 */
function detalleCasosRecibidos(casos: CasosRecibidos): string {
  if (casos.traslados_nuevos === 0) return "Por traslado de otros doctores";
  return casos.traslados_nuevos === 1
    ? "1 traslado nuevo sin abrir"
    : `${casos.traslados_nuevos} traslados nuevos sin abrir`;
}

/** «Luis Gómez», con «(cuenta eliminada)» si corresponde (RF-A07 CA 4). */
function nombreOrigen(origen: OrigenTraslado): string {
  const quien = `${origen.nombre} ${origen.apellido}`.trim();
  return origen.cuenta_eliminada ? `${quien} (cuenta eliminada)` : quien;
}

function palabraCasos(cantidad: number): string {
  return cantidad === 1 ? "caso" : "casos";
}

/** «Recibió 4 casos por traslado» o «Recibió 16 casos en 2 traslados nuevos». */
function tituloTraslados(avisos: AvisoTraslado[], casosNuevos: number): string {
  if (avisos.length === 1) {
    return `Recibió ${casosNuevos} ${palabraCasos(casosNuevos)} por traslado`;
  }
  return `Recibió ${casosNuevos} ${palabraCasos(casosNuevos)} en ${avisos.length} traslados nuevos`;
}

/**
 * «De Luis Gómez, el 18/10/2026.» o «De Andrés Vélez (12 casos, 20/10/2026) y de Luis Gómez
 * (4 casos, 18/10/2026).», como dibujan W-15b y W-15d.
 */
function textoOrigenes(avisos: AvisoTraslado[]): string {
  const [primero] = avisos;
  if (avisos.length === 1 && primero) {
    return `De ${nombreOrigen(primero.origen)}, el ${fechaCorta(primero.ejecutado_en)}.`;
  }
  const partes = avisos.map(
    (aviso) =>
      `${nombreOrigen(aviso.origen)} (${aviso.cantidad_casos} ${palabraCasos(aviso.cantidad_casos)}, ${fechaCorta(aviso.ejecutado_en)})`
  );
  const ultima = partes[partes.length - 1];
  return `De ${partes.slice(0, -1).join(", de ")} y de ${ultima}.`;
}

/**
 * Aviso de traslados nuevos (W-15b, W-15c, W-15d). Uno solo, aunque sean varios traslados.
 *
 * «Ya tenía N casos recibidos antes» sale de restar: la respuesta trae el total de casos
 * recibidos y los casos de cada traslado sin abrir; la diferencia son los que ya había visto.
 */
function AvisoTrasladosNuevos({
  avisos,
  casosRecibidos,
}: {
  avisos: AvisoTraslado[];
  casosRecibidos: CasosRecibidos;
}) {
  const casosNuevos = avisos.reduce((total, aviso) => total + aviso.cantidad_casos, 0);
  const previos = casosRecibidos.casos - casosNuevos;
  const frasePrevios =
    previos > 0
      ? ` Ya tenía ${previos} ${palabraCasos(previos)} ${previos === 1 ? "recibido" : "recibidos"} antes.`
      : "";
  // La frase se arma aquí, y no en el JSX, para que los espacios entre las tres partes se vean
  // en el código y no dependan de dónde cae el salto de línea.
  const texto = `${textoOrigenes(avisos)}${frasePrevios} No se suman a sus análisis ni a su concordancia, porque los hizo otro doctor.`;

  return (
    <div className={estilos.traslado}>
      <Alerta tipo="info" titulo={tituloTraslados(avisos, casosNuevos)}>
        {texto}
      </Alerta>
      <EnlaceBoton jerarquia="secundario" to="/casos-recibidos">
        Ver casos recibidos
      </EnlaceBoton>
    </div>
  );
}

/**
 * Las cinco cifras (Figma 62:3375). En W-12 son las mismas, en cero.
 *
 * **Los detalles dicen «completados» aunque Figma no lo escriba.** El repositorio del
 * dashboard cuenta solo análisis COMPLETADOS, mientras que el historial (W-16) lista todos los
 * estados y además los recibidos por traslado: sin esa palabra, «Análisis acumulados: 5» junto
 * a un historial de 17 filas se lee como un error, y las dos cifras son correctas. Queda
 * propuesto a diseño en CONTRATOS_API.md, con la otra mitad de la condición —solo cuentan los
 * casos que siguen asignados al doctor— que no cabe en una línea de detalle.
 */
function Indicadores({ datos }: { datos: DashboardDoctor }) {
  const { resumen, concordancia, casos_recibidos, pacientes_con_seguimiento, primer_uso } = datos;

  return (
    <ul className={estilos.indicadores} data-recorrido="indicadores">
      <TarjetaIndicador
        indicador="Análisis este mes"
        valor={String(resumen.analisis_mes)}
        // W-12 escribe «Mes en curso» y W-15 el mes con su nombre: se respeta cada frame, con
        // la palabra «completados» añadida (ver el comentario de `Indicadores`).
        detalle={primer_uso ? "Completados en el mes en curso" : `Completados en ${mesEnCurso()}`}
      />
      <TarjetaIndicador
        indicador="Análisis acumulados"
        valor={String(resumen.total_analisis)}
        detalle="Completados desde su primer ingreso"
      />
      <TarjetaIndicador
        indicador="Concordancia con el modelo"
        // El paso 6 del recorrido de TOPOLOGO (W-14c) ilumina esta tarjeta.
        anclaRecorrido="concordancia"
        // `porcentaje` ya viene de 0 a 100 con un decimal; «—» mientras no haya valorado nada.
        valor={concordancia.porcentaje === null ? "—" : porcentajeDirecto(concordancia.porcentaje)}
        detalle={detalleConcordancia(concordancia)}
      />
      <TarjetaIndicador
        indicador="Casos con seguimiento"
        valor={String(pacientes_con_seguimiento)}
        detalle="Pacientes con 2 o más análisis completados"
      />
      <TarjetaIndicador
        indicador="Casos recibidos"
        valor={String(casos_recibidos.casos)}
        detalle={detalleCasosRecibidos(casos_recibidos)}
      />
    </ul>
  );
}

/** W-15e: esqueletos de las cifras y de las filas, con «Cargando…» visible. */
function EsqueletoDashboard() {
  return (
    <div className={estilos.cargando} aria-busy="true">
      <div className={estilos.esqueletoTarjetas} aria-hidden="true">
        {Array.from({ length: TARJETAS_ESQUELETO }, (_, indice) => (
          <Esqueleto key={indice} forma="tarjeta-indicador" />
        ))}
      </div>
      {Array.from({ length: FILAS_ESQUELETO }, (_, indice) => (
        <Esqueleto key={indice} forma="fila-tabla" />
      ))}
      <p className={estilos.textoCargando}>Cargando…</p>
    </div>
  );
}

export default function Dashboard({ titulo }: { titulo: string }) {
  const { datos, cargando, aviso, recargar } = useDashboardDoctor();

  // Recorrido guiado de TOPOLOGO (W-13, W-14x): las dos puertas de entrada —«Ver recorrido» en
  // Mi perfil y el arranque automático del primer ingreso— están en `useRecorridoGuiado`, que
  // comparte con el dashboard técnico del administrador. Se le pasa la **misma condición que
  // pinta el contenido**, más abajo, y no «la respuesta llegó»: ver el comentario del hook.
  const { recorridoActivo, cerrarRecorrido } = useRecorridoGuiado(!cargando && !aviso && !!datos);

  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Resumen de sus análisis y de su concordancia con el modelo."
      />
      {/* RF-DB01 CA 9. Es el banner de Figma; el aviso del pie lo pone la disposición. */}
      <AvisoExperimental formato="banner" />

      {cargando && <EsqueletoDashboard />}

      {!cargando && aviso && (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={aviso.titulo}>
            {aviso.mensaje}
          </Alerta>
          <div>
            <Boton jerarquia="secundario" onClick={recargar}>
              Reintentar
            </Boton>
          </div>
        </div>
      )}

      {!cargando && !aviso && datos && (
        <>
          {datos.avisos_traslado.length > 0 && (
            <AvisoTrasladosNuevos
              avisos={datos.avisos_traslado}
              casosRecibidos={datos.casos_recibidos}
            />
          )}

          <Indicadores datos={datos} />

          {datos.primer_uso ? (
            // W-12: sin ningún análisis no hay casos recientes ni gráfica (CA 10).
            // El paso 3 del recorrido ancla a la sección, no a su contenido: aquí el estado
            // vacío y más abajo la lista de casos ocupan el mismo sitio.
            <div className={estilos.tarjetaVacia} data-recorrido="casos-recientes">
              <EstadoVacio
                nivelTitulo="h2"
                titulo="Aún no hay análisis"
                mensaje="Cuando realice su primer análisis, aquí verá sus casos recientes, la frecuencia de características señaladas por el modelo y su concordancia."
              >
                <EnlaceBoton jerarquia="primario" to="/nuevo-analisis">
                  Realizar el primer análisis
                </EnlaceBoton>
              </EstadoVacio>
            </div>
          ) : (
            <div className={estilos.casosYFrecuencia} data-recorrido="casos-recientes">
              <DashboardCasosRecientes recientes={datos.analisis_recientes} />
              <DashboardFrecuencia
                rotulo={datos.frecuencia.rotulo}
                barras={datos.frecuencia.barras}
                total={datos.resumen.total_analisis}
              />
            </div>
          )}
        </>
      )}

      {recorridoActivo && <RecorridoGuiado pasos={PASOS_RECORRIDO_DOCTOR} alCerrar={cerrarRecorrido} />}
    </>
  );
}
