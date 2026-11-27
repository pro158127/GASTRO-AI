// Un bloque de la bandeja de W-27: todo lo que llegó en un mismo traslado.
//
// La cabecera es un botón de verdad, con `aria-expanded` y `aria-controls` (lo pide la nota de
// W-27c). Los traslados nuevos llegan abiertos, con borde de acento e insignia «Nuevo»; el
// borde solo refuerza, el significado lo da el texto de la insignia (WCAG 1.4.1).
//
// Nunca se dice qué administrador hizo el traslado ni el seudónimo del paciente: el contrato
// no los entrega y el router del backend lo deja escrito en su cabecera.
import { useId } from "react";
import Boton from "../components/Boton";
import Insignia from "../components/Insignia";
import IconoChevronAbajo from "../components/iconos/IconoChevronAbajo";
import type { TrasladoRecibido } from "../types";
import { fechaCorta } from "../utils/fechas";
import TablaCasosRecibidos, { nombreDeOrigen } from "./TablaCasosRecibidos";
import estilos from "./BloqueTraslado.module.css";

interface PropiedadesBloqueTraslado {
  traslado: TrasladoRecibido;
  abierto: boolean;
  onAlternar: () => void;
  /** Las filas que se muestran; puede ser un recorte de `traslado.analisis`. */
  filas: TrasladoRecibido["analisis"];
  /** Hay más análisis de los que se ven: se pinta el pie con «Ver los N análisis». */
  hayMas: boolean;
  onVerTodos: () => void;
  /**
   * En la búsqueda, cuántos análisis tiene el traslado **en total**, no solo de este paciente
   * («· 12 en el traslado» de W-27f). `null` fuera de la búsqueda o si no se conoce.
   */
  totalEnElTraslado: number | null;
}

/** «4 casos · trasladados el 18/10/2026», con el recuento de la búsqueda si lo hay. */
function detalle(traslado: TrasladoRecibido, totalEnElTraslado: number | null): string {
  const fecha = `trasladados el ${fechaCorta(traslado.ejecutado_en)}`;
  // En la búsqueda la cuenta es de análisis de ese paciente, no de casos del traslado.
  if (totalEnElTraslado !== null) {
    const propios = traslado.analisis.length;
    const cuantos = propios === 1 ? "1 análisis de este paciente" : `${propios} análisis de este paciente`;
    return `${cuantos} · ${totalEnElTraslado} en el traslado · ${fecha}`;
  }
  const casos = traslado.casos.length;
  return `${casos === 1 ? "1 caso" : `${casos} casos`} · ${fecha}`;
}

export default function BloqueTraslado({
  traslado,
  abierto,
  onAlternar,
  filas,
  hayMas,
  onVerTodos,
  totalEnElTraslado,
}: PropiedadesBloqueTraslado) {
  const idContenido = useId();
  const origen = nombreDeOrigen(traslado.origen);
  const texto = detalle(traslado, totalEnElTraslado);

  return (
    <li className={`${estilos.bloque} ${traslado.nuevo ? estilos.nuevo : ""}`}>
      {/* h2: los bloques son las secciones de primer nivel de la pantalla, bajo el h1 del
          encabezado. Así no se salta ningún nivel de encabezado. */}
      <h2 className={estilos.encabezado}>
        <button
          type="button"
          className={estilos.boton}
          aria-expanded={abierto}
          aria-controls={idContenido}
          onClick={onAlternar}
        >
          <IconoChevronAbajo
            className={`${estilos.chevron} ${abierto ? estilos.chevronAbierto : ""}`}
          />
          <span className={estilos.textos}>
            <span className={estilos.origen}>{origen}</span>
            <span className={estilos.detalle}>{texto}</span>
          </span>
          {/* Dentro del botón para que el lector lo anuncie con el resto del nombre. */}
          {traslado.nuevo && (
            <span className={estilos.marcaNuevo}>
              <Insignia tipo="info">Nuevo</Insignia>
            </span>
          )}
        </button>
      </h2>

      <div id={idContenido} className={estilos.contenido} hidden={!abierto}>
        {filas.length === 0 ? (
          <p className={estilos.sinAnalisis}>Este traslado no tiene análisis que mostrar.</p>
        ) : (
          <>
            <TablaCasosRecibidos filas={filas} titulo={`Análisis trasladados por ${origen}`} />
            {hayMas && (
              <div className={estilos.pie}>
                <p className={estilos.resumen}>
                  Mostrando {filas.length} de {traslado.analisis_total} análisis, del más
                  reciente al más antiguo.
                </p>
                <Boton jerarquia="secundario" onClick={onVerTodos}>
                  Ver los {traslado.analisis_total} análisis
                  <span className={estilos.soloLector}> trasladados por {origen}</span>
                </Boton>
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}
