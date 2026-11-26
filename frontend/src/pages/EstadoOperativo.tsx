// Pantalla W-22 · Estado operativo (RF-A04, RNF-29).
import { useEffect, useId, useState } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import EncabezadoPagina from "../components/EncabezadoPagina";
import Esqueleto from "../components/Esqueleto";
import type { EstadoServicio, RespuestaEstadoOperativo, ServicioOperativo } from "../services/estadoOperativo";
import { obtenerEstadoOperativo, verificarEstadoOperativo } from "../services/estadoOperativo";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import estilos from "./EstadoOperativo.module.css";

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Bogota",
});
const formatoTiempo = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

const estados: Record<EstadoServicio, { etiqueta: string; clase: string }> = {
  OPERATIVO: { etiqueta: "Disponible", clase: estilos.operativo },
  LENTO: { etiqueta: "Con demora", clase: estilos.lento },
  SIN_RESPUESTA: { etiqueta: "Sin respuesta", clase: estilos.sinRespuesta },
};

function fechaLegible(fecha: string): string {
  const instante = new Date(fecha);
  return Number.isNaN(instante.getTime()) ? "Sin dato" : formatoFecha.format(instante);
}

function tiempoLegible(ms: number | null): string {
  return ms === null ? "Sin respuesta" : `${formatoTiempo.format(ms / 1000)} s`;
}

function InsigniaEstado({ estado }: { estado: EstadoServicio }) {
  const presentacion = estados[estado];
  return <span className={`${estilos.insignia} ${presentacion.clase}`}>{presentacion.etiqueta}</span>;
}

function FilaServicio({ servicio }: { servicio: ServicioOperativo }) {
  return (
    <tr>
      <td className={estilos.servicio}>{servicio.nombre}</td>
      <td><InsigniaEstado estado={servicio.estado} /></td>
      <td className={estilos.datoNumerico}>{tiempoLegible(servicio.tiempo_respuesta_ms)}</td>
      <td>{fechaLegible(servicio.ultima_verificacion)}</td>
    </tr>
  );
}

function TarjetaServicio({ servicio }: { servicio: ServicioOperativo }) {
  return (
    <li className={estilos.tarjetaServicio}>
      <h3 className={estilos.nombreTarjeta}>{servicio.nombre}</h3>
      <InsigniaEstado estado={servicio.estado} />
      <dl className={estilos.datosTarjeta}>
        <div>
          <dt>Tiempo de respuesta</dt>
          <dd className={estilos.datoNumerico}>{tiempoLegible(servicio.tiempo_respuesta_ms)}</dd>
        </div>
        <div>
          <dt>Última verificación</dt>
          <dd>{fechaLegible(servicio.ultima_verificacion)}</dd>
        </div>
      </dl>
    </li>
  );
}

export default function EstadoOperativo({ titulo }: { titulo: string }) {
  const idAyuda = useId();
  const [estado, setEstado] = useState<RespuestaEstadoOperativo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState<AvisoError | null>(null);
  const [estadoCopia, setEstadoCopia] = useState<"copiada" | "error" | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerEstadoOperativo()
      .then((respuesta) => {
        if (vigente) {
          setEstado(respuesta);
          setError(null);
        }
      })
      .catch((fallo: unknown) => {
        if (vigente && !esErrorGlobal(fallo)) setError(avisoDeError(fallo));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => { vigente = false; };
  }, []);

  async function manejarActualizar() {
    if (cargando || actualizando) return;
    setActualizando(true);
    setError(null);
    try {
      setEstado(await verificarEstadoOperativo());
    } catch (fallo: unknown) {
      if (!esErrorGlobal(fallo)) setError(avisoDeError(fallo));
    } finally {
      setActualizando(false);
    }
  }

  async function manejarReintentar() {
    if (estado) {
      await manejarActualizar();
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setEstado(await obtenerEstadoOperativo({ pasiva: false }));
    } catch (fallo: unknown) {
      if (!esErrorGlobal(fallo)) setError(avisoDeError(fallo));
    } finally {
      setCargando(false);
    }
  }

  async function copiarHuella(huella: string) {
    try {
      await navigator.clipboard.writeText(huella);
      setEstadoCopia("copiada");
      window.setTimeout(() => setEstadoCopia(null), 2000);
    } catch {
      setEstadoCopia("error");
    }
  }

  const modelo = estado?.modelo_desplegado ?? null;

  return (
    <div className={estilos.pagina}>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Disponibilidad de los servicios de la plataforma e identificación del modelo desplegado."
        acciones={(
          <div className={estilos.accionesEncabezado}>
            <Boton
              cargando={cargando || actualizando}
              etiquetaCargando={actualizando ? "Verificando…" : "Cargando…"}
              aria-describedby={idAyuda}
              onClick={manejarActualizar}
            >
              Actualizar
            </Boton>
            <p id={idAyuda} className={estilos.ayudaActualizacion}>
              La última medición se muestra con su hora; el servidor evita mediciones repetidas en menos de 10 segundos.
            </p>
          </div>
        )}
      />

      {error && (
        <div className={estilos.alerta}>
          <Alerta tipo="error" titulo={error.titulo}>{error.mensaje}</Alerta>
          <Boton jerarquia="secundario" onClick={manejarReintentar}>
            Reintentar
          </Boton>
        </div>
      )}

      {estado?.alerta && (
        <Alerta tipo={estado.alerta.nivel === "ERROR" ? "error" : "advertencia"} titulo={estado.alerta.nivel === "ERROR" ? "Hay servicios que requieren atención" : "Algunos servicios responden con demora"}>
          {estado.alerta.mensaje}
        </Alerta>
      )}

      <section className={estilos.seccion} aria-labelledby="titulo-servicios">
        <h2 id="titulo-servicios" className={estilos.tituloSeccion}>Servicios de la plataforma</h2>
        {estado && <p className={estilos.resumenVerificacion}>Verificado el {fechaLegible(estado.verificado_en)}</p>}

        {cargando && !estado && (
          <p className={estilos.mensajeEstado} role="status">Consultando el estado de los servicios…</p>
        )}
        <div className={estilos.contenidoServicios} aria-busy={cargando || actualizando}>
          {cargando && !estado ? (
            <div className={estilos.cargando} aria-label="Cargando servicios">
              {Array.from({ length: 5 }, (_, indice) => <Esqueleto key={indice} forma="fila-tabla" />)}
            </div>
          ) : estado ? (
            <>
              <div className={estilos.marcoTabla}>
                <table className={estilos.tabla}>
                  <thead><tr><th scope="col">Servicio</th><th scope="col">Estado</th><th scope="col">Tiempo de respuesta</th><th scope="col">Última verificación</th></tr></thead>
                  <tbody>{estado.servicios.map((servicio) => <FilaServicio key={servicio.codigo} servicio={servicio} />)}</tbody>
                </table>
              </div>
              <ul className={estilos.tarjetas} aria-label="Servicios de la plataforma">
                {estado.servicios.map((servicio) => <TarjetaServicio key={servicio.codigo} servicio={servicio} />)}
              </ul>
            </>
          ) : !error ? <p className={estilos.mensajeEstado}>No hay datos de estado disponibles.</p> : null}
        </div>
      </section>

      <section className={estilos.seccion} aria-labelledby="titulo-modelo">
        <div>
          <h2 id="titulo-modelo" className={estilos.tituloSeccion}>Modelo de inferencia desplegado</h2>
          {modelo && (
            <span className={`${estilos.insignia} ${modelo.coincide_con_configuracion ? estilos.operativo : estilos.sinRespuesta}`}>
              {modelo.coincide_con_configuracion ? "Coincide con la configuración (RNF-29)" : "No coincide con la configuración (RNF-29)"}
            </span>
          )}
        </div>
        {modelo ? (
          <>
            <dl className={estilos.identificacion}>
              <div className={estilos.filaDato}><dt>Repositorio en Hugging Face</dt><dd>{modelo.repositorio_hf}</dd></div>
              <div className={estilos.filaDato}><dt>Revisión fija (commit)</dt><dd className={estilos.revision}>{modelo.revision_sha}</dd></div>
              <div className={estilos.filaDato}>
                <dt>Huella de los pesos (SHA-256)</dt>
                <dd className={estilos.huella}>
                  <span className={estilos.revision}>{modelo.huella_pesos_sha256}</span>
                  <Boton jerarquia="terciario" onClick={() => void copiarHuella(modelo.huella_pesos_sha256)}>
                    {estadoCopia === "copiada" ? "Copiada" : "Copiar huella"}
                  </Boton>
                  <span role="status" aria-live="polite" className={estilos.mensajeEstado}>
                    {estadoCopia === "copiada" ? "Huella copiada al portapapeles." : estadoCopia === "error" ? "No se pudo copiar; puede seleccionar la huella y copiarla." : ""}
                  </span>
                </dd>
              </div>
              <div className={estilos.filaDato}><dt>Desplegado el</dt><dd>{fechaLegible(modelo.desplegado_en)}</dd></div>
            </dl>
            {modelo.model_card_url && <p><a href={modelo.model_card_url} target="_blank" rel="noreferrer">Abrir model card</a></p>}
          </>
        ) : cargando ? (
          <p className={estilos.mensajeEstado} role="status">Cargando información del modelo…</p>
        ) : (
          <p className={estilos.vacioModelo}>No hay un modelo de inferencia vigente registrado.</p>
        )}
        <p className={estilos.nota}>
          La aplicación usa una revisión fija del modelo. Repositorio, revisión y huella identifican el despliegue actual.
        </p>
      </section>
    </div>
  );
}
