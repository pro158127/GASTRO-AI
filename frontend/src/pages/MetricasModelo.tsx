// Pantalla W-23 · Métricas del modelo (RF-A05, RNF-14, RNF-15, RM-06).
import { useEffect, useState } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import EncabezadoPagina from "../components/EncabezadoPagina";
import EstadoVacio from "../components/EstadoVacio";
import { obtenerMetricasModelo } from "../services/metricasModelo";
import type { MetricasModelo as ValoresMetricas, RespuestaMetricasModelo } from "../services/metricasModelo";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import estilos from "./MetricasModelo.module.css";

const formatoPorcentaje = new Intl.NumberFormat("es-CO", {
  style: "percent",
  maximumFractionDigits: 1,
});
const formatoCalibracion = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
const formatoNumero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const metricas = [
  { campo: "SENSIBILIDAD", etiqueta: "Sensibilidad", calibracion: false },
  { campo: "ESPECIFICIDAD", etiqueta: "Especificidad", calibracion: false },
  { campo: "F1", etiqueta: "F1", calibracion: false },
  { campo: "ROC_AUC", etiqueta: "ROC-AUC", calibracion: false },
  { campo: "PR_AUC", etiqueta: "PR-AUC", calibracion: false },
  { campo: "BRIER", etiqueta: "Brier · menor es mejor", calibracion: true },
  { campo: "ECE", etiqueta: "ECE · menor es mejor", calibracion: true },
] as const;

function valorMetrica(valores: ValoresMetricas | null | undefined, campo: (typeof metricas)[number]["campo"]): string {
  const valor = valores?.[campo];
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "No reportada";
  return campo === "BRIER" || campo === "ECE" ? formatoCalibracion.format(valor) : formatoPorcentaje.format(valor);
}

function fechaReporte(fecha: string | null | undefined): string {
  if (!fecha) return "No incluida";
  const [anio, mes, dia] = fecha.split("-");
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : "No incluida";
}

function valorRecuento(valor: string | null | undefined): string {
  if (!valor) return "No incluido";
  const coincidencia = valor.match(/\bn\s*=\s*(\d+)/i);
  if (!coincidencia) return valor;
  return valor.replace(coincidencia[0], `n = ${formatoNumero.format(Number(coincidencia[1]))}`);
}

export default function MetricasModelo({ titulo }: { titulo: string }) {
  const [reporte, setReporte] = useState<RespuestaMetricasModelo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState<AvisoError | null>(null);
  const [pasiva, setPasiva] = useState(true);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    obtenerMetricasModelo({ pasiva })
      .then((respuesta) => { if (vigente) setReporte(respuesta); })
      .catch((fallo: unknown) => {
        if (vigente && !esErrorGlobal(fallo)) setError(avisoDeError(fallo));
      })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [intento, pasiva]);

  const disponible = reporte?.disponible === true;
  const modelo = reporte?.modelo;

  return (
    <div className={estilos.pagina}>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Reporte técnico de evaluación del modelo desplegado, publicado con el modelo. No usa datos clínicos de casos."
      />

      <Alerta tipo="info" titulo="Evaluación sobre el conjunto de prueba">
        Estas métricas describen la evaluación del modelo, no su desempeño en producción ni resultados de pacientes reales.
      </Alerta>

      {error && (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={error.titulo}>{error.mensaje}</Alerta>
          <Boton jerarquia="secundario" onClick={() => { setPasiva(false); setIntento((anterior) => anterior + 1); }}>Reintentar</Boton>
        </div>
      )}

      {cargando && !reporte ? (
        <p className={estilos.estadoCarga} role="status" aria-busy="true">Cargando el reporte de evaluación…</p>
      ) : reporte && !disponible ? (
        <section className={estilos.tarjeta} aria-labelledby="titulo-sin-reporte">
          {modelo && <p className={estilos.modeloEvaluado}>{modelo.repositorio_hf} · {modelo.revision_sha.slice(0, 7)}</p>}
          <span id="titulo-sin-reporte" className={estilos.soloLector}>Estado del reporte de evaluación</span>
          <EstadoVacio
            nivelTitulo="h2"
            titulo="Aún no hay reporte de evaluación"
            mensaje="Las métricas aparecerán cuando el equipo publique el reporte de evaluación junto con el modelo (RM-06). Mientras tanto no se muestran cifras provisionales."
          />
        </section>
      ) : disponible && reporte ? (
        <>
          <section className={estilos.tarjeta} aria-labelledby="titulo-reporte">
            <div className={estilos.encabezadoSeccion}>
              <div>
                <h2 id="titulo-reporte" className={estilos.tituloSeccion}>
                  {reporte.rotulo ?? "Evaluación del modelo desplegado sobre el conjunto de prueba"}
                </h2>
                {modelo && <p className={estilos.modeloEvaluado}>{modelo.repositorio_hf} · {modelo.revision_sha.slice(0, 7)}</p>}
              </div>
              {reporte.model_card_url && (
                <a href={reporte.model_card_url} target="_blank" rel="noreferrer">Abrir model card</a>
              )}
            </div>

            <dl className={estilos.datosReporte}>
              <div><dt>Conjunto de prueba</dt><dd>{valorRecuento(reporte.conjunto_prueba)}</dd></div>
              <div><dt>Fecha del reporte</dt><dd>{fechaReporte(reporte.fecha_reporte)}</dd></div>
              <div>
                <dt>Datos clínicos o de pacientes</dt>
                <dd>{reporte.contiene_datos_clinicos === false ? "Ninguno" : reporte.contiene_datos_clinicos === true ? "El reporte indica que contiene datos clínicos" : "No informado"}</dd>
              </div>
            </dl>
          </section>

          <section className={estilos.tarjeta} aria-labelledby="titulo-macro">
            <div>
              <h2 id="titulo-macro" className={estilos.tituloSeccion}>Promedio macro</h2>
              <p className={estilos.descripcionSeccion}>Resumen global; las métricas faltantes no se interpretan como cero.</p>
            </div>
            <dl className={estilos.kpis}>
              {metricas.map(({ campo, etiqueta, calibracion }) => (
                <div className={estilos.kpi} key={campo}>
                  <dt>{etiqueta}</dt>
                  <dd className={calibracion ? estilos.calibracion : ""}>{valorMetrica(reporte.macro, campo)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={estilos.tarjeta} aria-labelledby="titulo-caracteristicas">
            <div>
              <h2 id="titulo-caracteristicas" className={estilos.tituloSeccion}>Métricas por característica</h2>
              <p className={estilos.descripcionSeccion}>La clasificación es multietiqueta: cada característica se evalúa por separado.</p>
            </div>
            {(reporte.por_caracteristica ?? []).length > 0 ? (
              <>
                <div className={estilos.marcoTabla}>
                  <table className={estilos.tabla}>
                    <thead><tr><th scope="col">Característica</th>{metricas.map((m) => <th scope="col" key={m.campo}>{m.etiqueta}</th>)}</tr></thead>
                    <tbody>
                      {reporte.por_caracteristica?.map((fila) => (
                        <tr key={fila.caracteristica.id}>
                          <th scope="row">{fila.caracteristica.nombre}</th>
                          {metricas.map((m) => <td key={m.campo}>{valorMetrica(fila, m.campo)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className={estilos.tarjetasCaracteristicas}>
                  {reporte.por_caracteristica?.map((fila) => (
                    <li className={estilos.tarjetaCaracteristica} key={fila.caracteristica.id}>
                      <h3>{fila.caracteristica.nombre}</h3>
                      <dl>{metricas.map((m) => <div key={m.campo}><dt>{m.etiqueta}</dt><dd>{valorMetrica(fila, m.campo)}</dd></div>)}</dl>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className={estilos.estadoCarga}>El reporte no incluye métricas por característica.</p>}
          </section>
        </>
      ) : null}
    </div>
  );
}
