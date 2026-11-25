// La lista de análisis de W-16 (Figma 81:7288 y 63:3389). La usan las dos pestañas: las dos
// pintan `FilaHistorial`, con las mismas columnas y la misma acción.
//
// Escritorio: tabla. Desde tableta: tarjetas. A 320 px cinco columnas no caben sin
// desplazamiento horizontal (WCAG 1.4.10), así que no se encoge la tabla, se cambia de
// forma, igual que hace W-09.
//
// **Solo «Fecha» se puede ordenar.** Figma dibuja flechas también en «ID de análisis»,
// «Característica principal» y «Prob.», pero la API solo acepta `orden: solicitado_en |
// -solicitado_en`. Ordenar las otras tres en el cliente ordenaría las ocho filas de la
// página aparentando ordenar las cincuenta y una: queda propuesto al backend y, mientras
// tanto, esos tres encabezados son texto. El sentido del orden se dice además con palabras
// en el resumen de cada pestaña, no solo con la flecha (WCAG 1.4.1).
import { Link } from "react-router";
import Esqueleto from "../components/Esqueleto";
import Insignia from "../components/Insignia";
import IconoOrdenAsc from "../components/iconos/IconoOrdenAsc";
import IconoOrdenDesc from "../components/iconos/IconoOrdenDesc";
import type { EstadoAnalisis, FilaHistorial, OrdenHistorial } from "../types";
import { fechaHoraCorta } from "../utils/fechas";
import { porcentajeDeFraccion } from "../utils/numeros";
import estilos from "./TablaHistorial.module.css";

/** W-16g dibuja seis filas de esqueleto; en tarjetas, cuatro (lo que entra en tableta). */
const FILAS_ESQUELETO = 6;
const TARJETAS_ESQUELETO = 4;

/** Texto de los estados que no son COMPLETADO. Figma no los dibuja en la lista. */
const ETIQUETA_ESTADO: Record<EstadoAnalisis, string> = {
  PROCESANDO: "En proceso",
  COMPLETADO: "Completado",
  FALLIDO: "Fallido",
};

function rutaDetalle(fila: FilaHistorial): string {
  return `/analisis/${encodeURIComponent(fila.id)}`;
}

/**
 * «Atrofia gástrica», o el texto de «sin característica» cuando no hay ninguna sobre el
 * umbral. Nunca una celda en blanco: en una lista clínica un hueco se lee como un dato que
 * falta, no como un resultado.
 */
function textoCaracteristica(fila: FilaHistorial): string {
  if (fila.estado !== "COMPLETADO") return "—";
  return fila.caracteristica_principal ?? "Sin característica sobre el umbral";
}

function textoProbabilidad(fila: FilaHistorial): string {
  if (fila.estado !== "COMPLETADO" || fila.probabilidad_principal === null) return "—";
  return porcentajeDeFraccion(fila.probabilidad_principal);
}

/** «Trasladado · de Luis Gómez», con «(cuenta eliminada)» si corresponde (RF-A07 CA 4). */
function textoTraslado({ realizado_por }: FilaHistorial): string {
  const quien = `${realizado_por.nombre} ${realizado_por.apellido}`.trim();
  const sufijo = realizado_por.cuenta_eliminada ? " (cuenta eliminada)" : "";
  return `Trasladado · de ${quien}${sufijo}`;
}

/** El código en el nombre del enlace: ocho «Ver detalle» iguales no se distinguen (WCAG 2.4.4). */
function EnlaceDetalle({ fila, onIr }: { fila: FilaHistorial; onIr?: () => void }) {
  return (
    <Link className={estilos.enlaceDetalle} to={rutaDetalle(fila)} onClick={onIr}>
      Ver detalle
      <span className={estilos.soloLector}> del análisis {fila.codigo}</span>
    </Link>
  );
}

/**
 * Las dos insignias de una fila. Van envueltas porque `Insignia` no admite `className` y su
 * clase vive en otro módulo CSS: el envoltorio es lo único que este archivo puede nombrar
 * para darle a cada una el tratamiento de salto de línea que le corresponde (ver
 * TablaHistorial.module.css). No se toca el componente compartido.
 */
function Marcas({ fila }: { fila: FilaHistorial }) {
  return (
    <>
      {fila.estado !== "COMPLETADO" && (
        <span className={estilos.marcaEstado}>
          <Insignia tipo={fila.estado === "FALLIDO" ? "error" : "info"}>
            {ETIQUETA_ESTADO[fila.estado]}
          </Insignia>
        </span>
      )}
      {fila.trasladado && (
        <span className={estilos.marcaTraslado}>
          <Insignia tipo="neutral">{textoTraslado(fila)}</Insignia>
        </span>
      )}
    </>
  );
}

interface PropiedadesTablaHistorial {
  filas: FilaHistorial[];
  /** Título para el lector de pantalla; cada pestaña pone el suyo. */
  titulo: string;
  orden: OrdenHistorial;
  onCambiarOrden: (orden: OrdenHistorial) => void;
  /** Se llama justo antes de navegar al detalle: la pestaña de paciente guarda su búsqueda. */
  onIrAlDetalle?: () => void;
}

export default function TablaHistorial({
  filas,
  titulo,
  orden,
  onCambiarOrden,
  onIrAlDetalle,
}: PropiedadesTablaHistorial) {
  const ascendente = orden === "solicitado_en";
  const IconoOrden = ascendente ? IconoOrdenAsc : IconoOrdenDesc;

  const botonOrden = (
    <button
      type="button"
      className={estilos.botonOrden}
      onClick={() => onCambiarOrden(ascendente ? "-solicitado_en" : "solicitado_en")}
    >
      Fecha
      <IconoOrden className={estilos.iconoOrden} />
      <span className={estilos.soloLector}>
        {ascendente ? ", del más antiguo al más reciente" : ", del más reciente al más antiguo"}
      </span>
    </button>
  );

  return (
    <>
      <div className={`${estilos.marcoTabla} ${estilos.soloEscritorio}`}>
        <table className={estilos.tabla}>
          <caption className={estilos.soloLector}>{titulo}</caption>
          <thead>
            <tr>
              <th scope="col" className={estilos.columnaCodigo}>
                ID de análisis
              </th>
              <th scope="col" aria-sort={ascendente ? "ascending" : "descending"}>
                {botonOrden}
              </th>
              <th scope="col">Característica principal</th>
              <th scope="col" className={estilos.columnaProbabilidad}>
                Prob.
              </th>
              <th scope="col" className={estilos.columnaMarcas}>
                <span className={estilos.soloLector}>Origen</span>
              </th>
              <th scope="col" className={estilos.columnaAccion}>
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.id}>
                <td className={estilos.codigo}>{fila.codigo}</td>
                <td>{fechaHoraCorta(fila.solicitado_en)}</td>
                <td>{textoCaracteristica(fila)}</td>
                <td className={estilos.probabilidad}>{textoProbabilidad(fila)}</td>
                <td className={estilos.celdaMarcas}>
                  <Marcas fila={fila} />
                </td>
                <td className={estilos.columnaAccion}>
                  <EnlaceDetalle fila={fila} onIr={onIrAlDetalle} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={`${estilos.tarjetas} ${estilos.soloTarjetas}`}>
        {filas.map((fila) => (
          <li key={fila.id} className={estilos.tarjeta}>
            <p className={estilos.codigo}>{fila.codigo}</p>
            <p className={estilos.datoTarjeta}>{fechaHoraCorta(fila.solicitado_en)}</p>
            <p className={estilos.datoTarjeta}>
              {textoCaracteristica(fila)} · {textoProbabilidad(fila)}
            </p>
            <div className={estilos.marcasTarjeta}>
              <Marcas fila={fila} />
            </div>
            <EnlaceDetalle fila={fila} onIr={onIrAlDetalle} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** W-16g: esqueleto con forma de filas en escritorio y de tarjetas desde tableta. */
export function EsqueletoHistorial() {
  return (
    <>
      <div className={`${estilos.marcoTabla} ${estilos.soloEscritorio}`} aria-hidden="true">
        {Array.from({ length: FILAS_ESQUELETO }, (_, indice) => (
          <Esqueleto key={indice} forma="fila-tabla" />
        ))}
      </div>
      <div className={`${estilos.tarjetas} ${estilos.soloTarjetas}`} aria-hidden="true">
        {Array.from({ length: TARJETAS_ESQUELETO }, (_, indice) => (
          <Esqueleto key={indice} forma="tarjeta" />
        ))}
      </div>
    </>
  );
}
