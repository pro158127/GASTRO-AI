// Pantalla W-24 · Logs técnicos de inferencia (RF-M03). Sin datos clínicos.
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import EncabezadoPagina from "../components/EncabezadoPagina";
import Esqueleto from "../components/Esqueleto";
import IconoError from "../components/iconos/IconoError";
import { listarLogsTecnicos, LOGS_POR_PAGINA } from "../services/logsTecnicos";
import type { EstadoLogTecnico, FiltrosLogsTecnicos, LogTecnico, PaginaLogsTecnicos } from "../services/logsTecnicos";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import estilos from "./LogsTecnicos.module.css";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  hourCycle: "h23", timeZone: "America/Bogota",
});
const FORMATO_TIEMPO = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

const ETIQUETA_ESTADO: Record<EstadoLogTecnico, string> = {
  EXITO: "Correcto",
  ERROR: "Error de inferencia",
  TIEMPO_AGOTADO: "Tiempo agotado",
};

function estadoDeLog(log: LogTecnico): { etiqueta: string; clase: string } {
  return {
    etiqueta: ETIQUETA_ESTADO[log.estado],
    clase: log.estado === "EXITO" ? estilos.exito : estilos.error,
  };
}

function fechaHora(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "Sin dato" : FORMATO_FECHA.format(fecha).replace(",", "");
}

function segundos(ms: number | null): string {
  return ms === null ? "—" : `${FORMATO_TIEMPO.format(ms / 1000)} s`;
}

function InsigniaLog({ log }: { log: LogTecnico }) {
  const estado = estadoDeLog(log);
  return (
    <div className={estilos.estadoLog}>
      <span className={`${estilos.insignia} ${estado.clase}`}>{estado.etiqueta}</span>
      {log.codigo_error !== null && <code className={estilos.codigoError}>Código: {log.codigo_error}</code>}
    </div>
  );
}

function FilaLog({ log }: { log: LogTecnico }) {
  return (
    <tr>
      <td>{fechaHora(log.ocurrido_en)}</td>
      <th scope="row" className={estilos.idLog}>{log.id}</th>
      <td className={estilos.revision}>{log.revision_modelo}</td>
      <td className={estilos.numero}>{segundos(log.latencia_vision_ms)}</td>
      <td className={estilos.numero}>{segundos(log.latencia_llm_ms)}</td>
      <td><InsigniaLog log={log} /></td>
    </tr>
  );
}

function TarjetaLog({ log }: { log: LogTecnico }) {
  return (
    <li className={estilos.tarjetaLog}>
      <div className={estilos.encabezadoTarjeta}>
        <h3>{log.id}</h3>
        <InsigniaLog log={log} />
      </div>
      <dl>
        <div><dt>Fecha y hora</dt><dd>{fechaHora(log.ocurrido_en)}</dd></div>
        <div><dt>Revisión del modelo</dt><dd className={estilos.revision}>{log.revision_modelo}</dd></div>
        <div><dt>Tiempo de visión</dt><dd className={estilos.numero}>{segundos(log.latencia_vision_ms)}</dd></div>
        <div><dt>Tiempo de lenguaje</dt><dd className={estilos.numero}>{segundos(log.latencia_llm_ms)}</dd></div>
      </dl>
    </li>
  );
}

function textoPaginacion(datos: PaginaLogsTecnicos): string {
  const { total, pagina, por_pagina: porPagina } = datos.paginacion;
  if (total === 0) return "No hay registros para estos filtros.";
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(desde + datos.items.length - 1, total);
  return `Mostrando ${desde}–${hasta} de ${total} registros`;
}

interface ResultadoLogs { datos: PaginaLogsTecnicos; }

export default function LogsTecnicos({ titulo }: { titulo: string }) {
  const idAyudaPaginacion = useId();
  const idErrorFiltro = useId();
  const resultadosRef = useRef<HTMLDivElement>(null);
  const enfocarResultados = useRef(false);
  const hayResultado = useRef(false);
  const [estadoBorrador, setEstadoBorrador] = useState<EstadoLogTecnico | "">("");
  const [desdeBorrador, setDesdeBorrador] = useState("");
  const [hastaBorrador, setHastaBorrador] = useState("");
  const [consulta, setConsulta] = useState<FiltrosLogsTecnicos>({ estado: "", desde: "", hasta: "", pagina: 1 });
  const [resultado, setResultado] = useState<ResultadoLogs | null>(null);
  const [cargando, setCargando] = useState(true);
  const [esqueletoVisible, setEsqueletoVisible] = useState(true);
  const [error, setError] = useState<AvisoError | null>(null);
  const [errorFiltro, setErrorFiltro] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [pasiva, setPasiva] = useState(true);

  useEffect(() => {
    let vigente = true;
    let temporizador: number | undefined;
    setCargando(true);
    setError(null);
    if (hayResultado.current) {
      setEsqueletoVisible(false);
      temporizador = window.setTimeout(() => { if (vigente) setEsqueletoVisible(true); }, 1000);
    } else {
      setEsqueletoVisible(true);
    }

    listarLogsTecnicos(consulta, { pasiva })
      .then((datos) => {
        if (!vigente) return;
        hayResultado.current = true;
        setResultado({ datos });
      })
      .catch((fallo: unknown) => {
        if (vigente && !esErrorGlobal(fallo)) setError(avisoDeError(fallo));
      })
      .finally(() => {
        if (!vigente) return;
        window.clearTimeout(temporizador);
        setCargando(false);
        setEsqueletoVisible(false);
      });

    return () => { vigente = false; window.clearTimeout(temporizador); };
  }, [consulta, intento, pasiva]);

  useEffect(() => {
    if (!cargando && enfocarResultados.current) {
      enfocarResultados.current = false;
      resultadosRef.current?.focus();
    }
  }, [cargando]);

  function aplicarFiltros(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (desdeBorrador && hastaBorrador && desdeBorrador > hastaBorrador) {
      setErrorFiltro("Elija «Desde» en la misma fecha o antes de «Hasta».");
      return;
    }
    setErrorFiltro(null);
    setPasiva(false);
    const nuevos = { estado: estadoBorrador, desde: desdeBorrador, hasta: hastaBorrador, pagina: 1 };
    if (nuevos.estado === consulta.estado && nuevos.desde === consulta.desde && nuevos.hasta === consulta.hasta && consulta.pagina === 1) {
      setIntento((anterior) => anterior + 1);
    } else {
      setConsulta(nuevos);
    }
  }

  function cambiarPagina(pagina: number) {
    if (!resultado || pagina < 1 || pagina > Math.ceil(resultado.datos.paginacion.total / LOGS_POR_PAGINA)) return;
    enfocarResultados.current = true;
    setPasiva(false);
    setConsulta((actual) => ({ ...actual, pagina }));
  }

  const paginaResultado = resultado?.datos;
  const estaEnPrimera = !paginaResultado || paginaResultado.paginacion.pagina <= 1;
  const estaEnUltima = !paginaResultado || paginaResultado.paginacion.pagina * paginaResultado.paginacion.por_pagina >= paginaResultado.paginacion.total;
  const estadoResultados = paginaResultado ? textoPaginacion(paginaResultado) : "Aún no hay registros cargados.";

  return (
    <div className={estilos.pagina}>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Registro automático de cada inferencia: tiempos y estado. Sin identificadores de pacientes ni resultados clínicos."
      />

      <form className={estilos.filtros} onSubmit={aplicarFiltros}>
        <div className={estilos.campo}>
          <label htmlFor="filtro-estado">Estado</label>
          <select id="filtro-estado" value={estadoBorrador} onChange={(evento) => setEstadoBorrador(evento.target.value as EstadoLogTecnico | "")}>
            <option value="">Todos los estados</option>
            <option value="EXITO">Correcto</option>
            <option value="ERROR">Error de inferencia</option>
            <option value="TIEMPO_AGOTADO">Tiempo agotado</option>
          </select>
        </div>
        <div className={estilos.campo}>
          <label htmlFor="filtro-desde">Desde</label>
          <input id="filtro-desde" type="date" value={desdeBorrador} aria-invalid={Boolean(errorFiltro) || undefined} aria-describedby={errorFiltro ? idErrorFiltro : undefined} onChange={(evento) => { setDesdeBorrador(evento.target.value); setErrorFiltro(null); }} />
        </div>
        <div className={estilos.campo}>
          <label htmlFor="filtro-hasta">Hasta</label>
          <input id="filtro-hasta" type="date" value={hastaBorrador} aria-invalid={Boolean(errorFiltro) || undefined} aria-describedby={errorFiltro ? idErrorFiltro : undefined} onChange={(evento) => { setHastaBorrador(evento.target.value); setErrorFiltro(null); }} />
        </div>
        <Boton type="submit">Aplicar filtros</Boton>
        {errorFiltro && <p className={estilos.errorFiltro} id={idErrorFiltro} role="alert"><IconoError tamano={16} />{errorFiltro}</p>}
      </form>

      {error && (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={error.titulo}>{error.mensaje}</Alerta>
          <Boton jerarquia="secundario" onClick={() => { setPasiva(false); setIntento((anterior) => anterior + 1); }}>Reintentar</Boton>
        </div>
      )}

      <section className={estilos.seccionResultados} aria-labelledby="titulo-resultados">
        <h2 id="titulo-resultados" className={estilos.tituloSeccion}>Logs técnicos de inferencia</h2>
        <p className={estilos.estadoResultados} role="status" aria-live="polite">
          {cargando ? "Buscando registros…" : estadoResultados}
        </p>
        <div className={estilos.resultados} ref={resultadosRef} tabIndex={-1} aria-busy={cargando}>
          {esqueletoVisible && cargando ? (
            <div className={estilos.esqueletos} aria-label="Cargando registros">
              {Array.from({ length: 5 }, (_, indice) => <Esqueleto key={indice} forma="fila-tabla" />)}
            </div>
          ) : paginaResultado && paginaResultado.items.length > 0 ? (
            <>
              <div className={estilos.marcoTabla}>
                <table className={estilos.tabla}>
                  <thead><tr><th scope="col">Fecha y hora</th><th scope="col">ID de registro</th><th scope="col">Revisión del modelo</th><th scope="col">Tiempo de visión</th><th scope="col">Tiempo de lenguaje</th><th scope="col">Estado</th></tr></thead>
                  <tbody>{paginaResultado.items.map((log) => <FilaLog key={log.id} log={log} />)}</tbody>
                </table>
              </div>
              <ul className={estilos.tarjetas} aria-label="Registros técnicos de inferencia">
                {paginaResultado.items.map((log) => <TarjetaLog key={log.id} log={log} />)}
              </ul>
            </>
          ) : paginaResultado ? (
            <p className={estilos.vacio}>No hay registros de inferencia para los filtros seleccionados.</p>
          ) : !error ? <p className={estilos.vacio}>No hay datos de logs disponibles.</p> : null}
        </div>

        <div className={estilos.paginacion}>
          <p className={estilos.ayudaPaginacion} id={idAyudaPaginacion}>
            Durante la carga no se puede cambiar de página. Anterior está disponible desde la página 2; Siguiente, cuando haya más registros.
          </p>
          <Boton jerarquia="secundario" aria-disabled={estaEnPrimera || cargando} aria-describedby={idAyudaPaginacion} onClick={() => cambiarPagina((paginaResultado?.paginacion.pagina ?? 1) - 1)}>
            Anterior
          </Boton>
          {paginaResultado && <span aria-live="polite">Página {paginaResultado.paginacion.pagina}</span>}
          <Boton jerarquia="secundario" aria-disabled={estaEnUltima || cargando} aria-describedby={idAyudaPaginacion} onClick={() => cambiarPagina((paginaResultado?.paginacion.pagina ?? 1) + 1)}>
            Siguiente
          </Boton>
        </div>
      </section>
    </div>
  );
}
