// Los análisis de un bloque de traslado (W-27b a W-27f, y M-27 en celular).
//
// Escritorio: tabla. Desde tableta: tarjetas, igual que en W-16 y por el mismo motivo: a
// 320 px las columnas no caben sin desplazamiento horizontal (WCAG 1.4.10), así que no se
// encoge la tabla, se cambia de forma.
//
// **Los encabezados no se pueden ordenar.** Figma les dibuja flechas, pero
// `GET /casos-recibidos` no acepta ningún parámetro de orden: solo `origen_id` y `limite`. El
// servidor devuelve siempre los análisis del más reciente al más antiguo. Ordenar aquí las
// cinco filas que se muestran aparentaría ordenar las doce del traslado. Se hace lo mismo que
// en W-16 con sus tres columnas sin orden: encabezados de texto, y el sentido dicho con
// palabras en el pie del bloque (WCAG 1.4.1). Queda anotado en CONTRATOS_API.md (CR-5).
import { Link } from "react-router";
import Esqueleto from "../components/Esqueleto";
import Insignia from "../components/Insignia";
import type { AnalisisRecibido, PersonaOrigen } from "../types";
import { fechaHoraCorta } from "../utils/fechas";
import { porcentajeDeFraccion } from "../utils/numeros";
import estilos from "./TablaCasosRecibidos.module.css";

const FILAS_ESQUELETO = 5;
const TARJETAS_ESQUELETO = 3;

/** «Pedro Rojas», con «(cuenta eliminada)» si la cuenta ya no existe (RF-A07 CA 4). */
export function nombreDeOrigen(persona: PersonaOrigen): string {
  const quien = `${persona.nombre} ${persona.apellido}`.trim();
  return persona.cuenta_eliminada ? `${quien} (cuenta eliminada)` : quien;
}

/**
 * «Atrofia gástrica», o el texto de «sin característica» cuando ninguna supera el umbral.
 * Nunca una celda en blanco: en una lista clínica un hueco se lee como un dato que falta.
 */
function textoCaracteristica(fila: AnalisisRecibido): string {
  if (fila.estado !== "COMPLETADO") return "—";
  return fila.caracteristica_principal ?? "Sin característica sobre el umbral";
}

function textoProbabilidad(fila: AnalisisRecibido): string {
  if (fila.estado !== "COMPLETADO" || fila.probabilidad_principal === null) return "—";
  return porcentajeDeFraccion(fila.probabilidad_principal);
}

/** El código en el nombre del enlace: varios «Ver detalle» iguales no se distinguen (WCAG 2.4.4). */
function EnlaceDetalle({ fila }: { fila: AnalisisRecibido }) {
  return (
    <Link className={estilos.enlaceDetalle} to={`/analisis/${encodeURIComponent(fila.id)}`}>
      Ver detalle
      <span className={estilos.soloLector}> del análisis {fila.codigo}</span>
    </Link>
  );
}

/**
 * «Originalmente de Pedro Rojas»: el análisis lo hizo alguien que no es el doctor de origen de
 * este traslado, así que el caso se trasladó dos veces (trazabilidad RNF-25). Va envuelta
 * porque `Insignia` no admite `className` y su clase vive en otro módulo CSS.
 */
function MarcaOrigen({ persona }: { persona: PersonaOrigen }) {
  return (
    <span className={estilos.marcaOrigen}>
      <Insignia tipo="neutral">{`Originalmente de ${nombreDeOrigen(persona)}`}</Insignia>
    </span>
  );
}

interface PropiedadesTablaCasosRecibidos {
  filas: AnalisisRecibido[];
  /** Título para el lector de pantalla: nombra el bloque al que pertenece la tabla. */
  titulo: string;
}

export default function TablaCasosRecibidos({ filas, titulo }: PropiedadesTablaCasosRecibidos) {
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
              <th scope="col">Fecha del análisis</th>
              <th scope="col">Característica principal</th>
              <th scope="col" className={estilos.columnaProbabilidad}>
                Prob.
              </th>
              <th scope="col" className={estilos.columnaMarcas}>
                <span className={estilos.soloLector}>Origen del análisis</span>
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
                  {fila.originalmente_de && <MarcaOrigen persona={fila.originalmente_de} />}
                </td>
                <td className={estilos.columnaAccion}>
                  <EnlaceDetalle fila={fila} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={`${estilos.tarjetas} ${estilos.soloTarjetas}`}>
        {filas.map((fila) => (
          <li key={fila.id} className={estilos.tarjeta}>
            <div className={estilos.lineaTarjeta}>
              <p className={estilos.codigo}>{fila.codigo}</p>
              <p className={estilos.datoTarjeta}>{fechaHoraCorta(fila.solicitado_en)}</p>
            </div>
            <div className={estilos.lineaTarjeta}>
              <p className={estilos.datoTarjeta}>{textoCaracteristica(fila)}</p>
              <p className={estilos.datoTarjeta}>{textoProbabilidad(fila)}</p>
            </div>
            {fila.originalmente_de && (
              <div className={estilos.marcasTarjeta}>
                <MarcaOrigen persona={fila.originalmente_de} />
              </div>
            )}
            <EnlaceDetalle fila={fila} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** W-27h: el esqueleto que sustituye a los bloques mientras se busca. */
export function EsqueletoCasosRecibidos() {
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
