// Pantalla W-19 · bloque «Evaluación del modelo desplegado sobre el conjunto de prueba»
// (Figma 68:4446) y su estado sin reporte **W-19q** (165:23897).
//
// Sale de `GET /admin/modelo/metricas`, que es **otra petición** distinta de `/admin/dashboard`.
// Por eso el bloque se monta fuera de las ramas de carga y error del dashboard y trae su propio
// ciclo: si estas métricas fallan, las cuentas de usuario y el estado operativo siguen en pie, y
// al revés. Es el mismo patrón que «Exportar auditoría».
//
// **El estado vacío es el camino normal, no la excepción.** El reporte de evaluación (RM-06) no
// existe todavía en el proyecto, así que `disponible: false` es lo que se ve hoy y lo que se verá
// en la demostración. No se pintan ceros, ni guiones, ni «No reportada»: esa cadena significa «el
// reporte existe pero no trae esa métrica», que es otra cosa.
//
// **Siete tarjetas, no las seis del frame.** El frame junta Brier y ECE en una sola tarjeta
// llamada «Calibración». No se implementa así: el endpoint usa `response_model_exclude_unset`, de
// modo que pueden llegar Brier, ECE, los dos o ninguno, y una tarjeta con un número que no dice
// cuál de los dos es sería ilegible —no son la misma métrica y no se comparan entre sí—. Además
// en las dos menos es mejor, y sin rótulo se leerían al revés junto a las cinco donde más es
// mejor. Se usan las siete etiquetas de W-23, que es la pantalla a la que lleva el enlace.
//
// **El formato es el de W-23**, importado de `utils/formatoMetricas`: ROC-AUC y PR-AUC van en
// porcentaje como allá, aunque el frame los dibuje como «0,XX». Un mismo número que saliera
// «0,90» aquí y «90 %» a un clic de distancia sería peor que desviarse de la maqueta. La decisión
// de pasarlos a decimal es de otra persona y se aplica en los dos sitios a la vez.
//
// `model_card_url` no se usa aquí: el frame dibuja un solo enlace y W-23 ya abre la model card
// cuando el campo llega, así que no hay enlace que pueda quedarse roto.
import { useEffect, useId, useState } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import EnlaceBoton from "../components/EnlaceBoton";
import TarjetaIndicador from "../components/TarjetaIndicador";
import { obtenerMetricasModelo } from "../services/metricasModelo";
import type { RespuestaMetricasModelo } from "../services/metricasModelo";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import { fechaReporte, metricas, valorMetrica } from "../utils/formatoMetricas";
import estilos from "./DashboardTecnico.module.css";

const FUENTE = "fuente: ficha del modelo en Hugging Face (RM-06). No es el desempeño en producción.";
const FUENTE_SIN_FECHA = "Fuente: ficha del modelo en Hugging Face (RM-06). No es el desempeño en producción.";

/** Lo que devuelve `fechaReporte` cuando la fecha no viene o no se puede partir. */
const SIN_FECHA = "No incluida";

/**
 * La línea de debajo del título (Figma 68:4453).
 *
 * La nota de la fuente **es contenido real y siempre está**: es lo que distingue la evaluación
 * sobre el conjunto de prueba del desempeño en uso, que es justo la confusión que este bloque
 * existe para evitar.
 *
 * La fecha, en cambio, puede no venir (`exclude_unset`). Entonces la frase va sin ella, en vez de
 * dejar «Reporte del » colgando: el mismo guardia que usa el pie de «Estado operativo».
 *
 * `fecha_reporte` es una fecha suelta `AAAA-MM-DD`, no un `datetime`, así que no pasa por
 * `fechaHoraCorta` sino por la `fechaReporte` de W-23.
 */
function notaDeFuente(fecha: string | null | undefined): string {
  const formateada = fechaReporte(fecha);
  if (formateada === SIN_FECHA) return FUENTE_SIN_FECHA;
  return `Reporte del ${formateada} · ${FUENTE}`;
}

export default function EvaluacionModelo() {
  const idTitulo = useId();
  const [reporte, setReporte] = useState<RespuestaMetricasModelo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<AvisoError | null>(null);
  const [intento, setIntento] = useState(0);
  // La primera carga es automática: va con `X-Actividad-Pasiva: 1` para no renovar la inactividad
  // de la sesión. El «Reintentar» sí es un clic de la persona, así que deja de serlo.
  const [pasiva, setPasiva] = useState(true);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setAviso(null);

    obtenerMetricasModelo({ pasiva })
      .then((respuesta) => {
        if (vigente) setReporte(respuesta);
      })
      .catch((causa: unknown) => {
        if (!vigente) return;
        // Sesión (401) o permisos (403): el proveedor de sesión ya lleva a otra pantalla.
        if (esErrorGlobal(causa)) return;
        setAviso(avisoDeError(causa));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [intento, pasiva]);

  function reintentar() {
    setPasiva(false);
    setIntento((anterior) => anterior + 1);
  }

  const disponible = reporte?.disponible === true;

  return (
    <section className={estilos.tarjeta} aria-labelledby={idTitulo}>
      {/* El título y el enlace están siempre, incluso cargando o con error: llevan a la pantalla
          que tiene el reporte completo, y esa navegación no depende de esta petición. */}
      <div className={estilos.tituloTarjeta}>
        <h2 className={estilos.tituloBloque} id={idTitulo}>
          Evaluación del modelo desplegado sobre el conjunto de prueba
        </h2>
        <EnlaceBoton to="/metricas-del-modelo">Ver métricas completas</EnlaceBoton>
      </div>

      {cargando && (
        <p className={estilos.textoCargando} role="status">
          Cargando el reporte de evaluación…
        </p>
      )}

      {!cargando && aviso && (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={aviso.titulo}>
            {aviso.mensaje}
          </Alerta>
          <div>
            <Boton jerarquia="secundario" onClick={reintentar}>
              Reintentar
            </Boton>
          </div>
        </div>
      )}

      {/* W-19q: el frame no dibuja aquí ni la línea de fuente y fecha ni tarjeta alguna, solo
          esta alerta informativa. Se implementa igual. */}
      {!cargando && !aviso && reporte && !disponible && (
        <Alerta tipo="info" titulo="Todavía no hay reporte de evaluación del modelo">
          Las métricas aparecerán cuando el equipo de IA publique el reporte de evaluación (RM-06)
          con el modelo. Mientras tanto no se muestra ninguna cifra.
        </Alerta>
      )}

      {!cargando && !aviso && reporte && disponible && (
        <>
          <p className={estilos.notaEvaluacion}>{notaDeFuente(reporte.fecha_reporte)}</p>
          <ul className={estilos.indicadores}>
            {metricas.map(({ campo, etiqueta }) => (
              <TarjetaIndicador
                key={campo}
                indicador={etiqueta}
                // Una métrica que no llega o llega nula se escribe «No reportada», como en W-23:
                // no se convierte en cero ni en un guion que parezca un dato.
                valor={valorMetrica(reporte.macro, campo)}
                detalle="Promedio macro"
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
