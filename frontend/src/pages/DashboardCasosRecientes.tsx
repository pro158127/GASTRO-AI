// Pantalla W-15 · tarjeta «Casos recientes» (Figma 62:3393; T-15 106:2584, M-15 106:2792).
//
// Los 5 análisis más recientes del doctor (RF-DB01 CA 2), **identificados por su código**
// (RNF-24): aquí no hay documento del paciente ni seudónimo, ni los trae la API.
//
// Escritorio: tabla. Desde tableta: tarjetas con «Ver detalle», como dibujan T-15 y M-15; a
// 320 px tres columnas no caben sin desplazamiento horizontal (WCAG 1.4.10). Es la misma
// decisión de W-16 en `TablaHistorial`.
//
// **Sin columna «Prob.»**, aunque Figma la dibuje: `AnalisisReciente` no trae la probabilidad
// (`FilaHistorial`, la del historial, sí la tiene). Un número así no se calcula ni se inventa,
// y una columna entera de «—» no informa de nada. Queda propuesto al backend en
// CONTRATOS_API.md; cuando llegue el campo, la columna entra sin tocar nada más.
//
// **Los encabezados no son ordenables.** Figma dibuja las flechas del componente «Encabezado
// de tabla», pero aquí no hay nada que ordenar: son siempre los 5 más recientes que manda el
// servidor. Flechas sin orden serían un control que no hace nada, así que van como texto, igual
// que en W-16.
import { useId } from "react";
import { Link } from "react-router";
import EnlaceBoton from "../components/EnlaceBoton";
import Insignia from "../components/Insignia";
import type { AnalisisReciente, EstadoAnalisis } from "../types";
import { fechaHoraCorta } from "../utils/fechas";
import estilos from "./DashboardCasosRecientes.module.css";

/** Texto de los estados. Figma solo dibuja filas completadas; estas vienen en cualquier estado. */
const ETIQUETA_ESTADO: Record<EstadoAnalisis, string> = {
  PROCESANDO: "En proceso",
  COMPLETADO: "Completado",
  FALLIDO: "Fallido",
};

/** El mismo destino que usa el historial para un análisis. */
function rutaDetalle(caso: AnalisisReciente): string {
  return `/analisis/${encodeURIComponent(caso.id)}`;
}

/**
 * Qué se lee en «Característica principal».
 *
 * `caracteristica_principal` llega en `null` por dos motivos distintos —ninguna superó el
 * umbral, o el análisis todavía no termina— y el contrato no los distingue. Los distingue
 * `estado`: si el análisis no está completado se muestra su estado, y solo cuando sí lo está
 * el `null` significa «ninguna superó el umbral». Nunca una celda en blanco: en una lista
 * clínica un hueco se lee como un dato que falta.
 */
function Caracteristica({ caso }: { caso: AnalisisReciente }) {
  if (caso.estado !== "COMPLETADO") {
    return (
      <Insignia tipo={caso.estado === "FALLIDO" ? "error" : "info"}>
        {ETIQUETA_ESTADO[caso.estado]}
      </Insignia>
    );
  }
  return <>{caso.caracteristica_principal ?? "Sin característica sobre el umbral"}</>;
}

/** El código, para el nombre accesible: cinco «Ver detalle» iguales no se distinguen (WCAG 2.4.4). */
function DeQueAnalisis({ codigo }: { codigo: string }) {
  return <span className={estilos.soloLector}> del análisis {codigo}</span>;
}

/** «Ver detalle» de una tarjeta: el componente «Botón» terciario de Figma, como enlace. */
function EnlaceDetalleTarjeta({ caso }: { caso: AnalisisReciente }) {
  return (
    <EnlaceBoton to={rutaDetalle(caso)}>
      Ver detalle
      <DeQueAnalisis codigo={caso.codigo} />
    </EnlaceBoton>
  );
}

/**
 * «Ver detalle» de una fila de la tabla. **Figma no dibuja esta columna**, pero sin ella el
 * escritorio ofrece menos que el celular, donde cada tarjeta sí la lleva, y la tabla del
 * historial (W-16) tiene la misma acción por fila. Va como enlace de texto, no como botón de
 * 40 px, para no engordar las filas, igual que en W-16. Propuesto a diseño en CONTRATOS_API.md.
 */
function EnlaceDetalleFila({ caso }: { caso: AnalisisReciente }) {
  return (
    <Link className={estilos.enlaceDetalle} to={rutaDetalle(caso)}>
      Ver detalle
      <DeQueAnalisis codigo={caso.codigo} />
    </Link>
  );
}

export default function DashboardCasosRecientes({ recientes }: { recientes: AnalisisReciente[] }) {
  const idTitulo = useId();

  return (
    <section className={estilos.tarjeta} aria-labelledby={idTitulo}>
      <div className={estilos.encabezado}>
        <h2 id={idTitulo} className={estilos.titulo}>
          Casos recientes
        </h2>
        <EnlaceBoton to="/historial">Ver historial</EnlaceBoton>
      </div>

      {recientes.length === 0 ? (
        // Defensivo: con `primer_uso` en falso el servidor siempre manda al menos un caso, así
        // que esto no debería verse. Más vale una frase que una tabla sin filas.
        <p className={estilos.vacio}>Todavía no hay análisis que mostrar.</p>
      ) : (
        <>
          <div className={`${estilos.marcoTabla} ${estilos.soloEscritorio}`}>
            <table className={estilos.tabla}>
              <caption className={estilos.soloLector}>
                Los cinco análisis más recientes
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={estilos.columnaCodigo}>
                    ID de análisis
                  </th>
                  <th scope="col" className={estilos.columnaFecha}>
                    Fecha
                  </th>
                  <th scope="col">Característica principal</th>
                  <th scope="col" className={estilos.columnaAccion}>
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {recientes.map((caso) => (
                  <tr key={caso.id}>
                    <td className={estilos.codigo}>{caso.codigo}</td>
                    <td className={estilos.columnaFecha}>{fechaHoraCorta(caso.solicitado_en)}</td>
                    <td>
                      <Caracteristica caso={caso} />
                    </td>
                    <td className={estilos.columnaAccion}>
                      <EnlaceDetalleFila caso={caso} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={`${estilos.tarjetas} ${estilos.soloTarjetas}`}>
            {recientes.map((caso) => (
              <li key={caso.id} className={estilos.tarjetaCaso}>
                <div className={estilos.lineaCaso}>
                  <p className={estilos.codigo}>{caso.codigo}</p>
                  <p className={estilos.fecha}>{fechaHoraCorta(caso.solicitado_en)}</p>
                </div>
                <p className={estilos.caracteristica}>
                  <Caracteristica caso={caso} />
                </p>
                <EnlaceDetalleTarjeta caso={caso} />
              </li>
            ))}
          </ul>
        </>
      )}

      <p className={estilos.nota}>
        Los casos se identifican por el ID de análisis (RNF-24), nunca por el documento del
        paciente ni el seudónimo.
      </p>
    </section>
  );
}
