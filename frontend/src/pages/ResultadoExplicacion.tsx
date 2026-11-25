// Tarjeta «Explicación en lenguaje natural» de W-08 (Figma 47:870), con W-08c (generándose,
// 96:2376) y W-08d (no disponible, 96:2543).
//
// La explicación llega **después** del resultado y no lo bloquea (RF-R05 CA 3): que falle no
// invalida nada de lo que ya se ve arriba, y el mensaje del servidor lo dice con todas las
// letras.
//
// Dos reglas que no se deducen:
//
// 1. **`mensaje` se pinta tal cual.** Es el estándar de indisponibilidad de RF-R05 CA 5
//    (`MENSAJE_NO_DISPONIBLE` en el backend), no texto de interfaz: misma excepción a
//    `CLAUDE.md` § 7 que el aviso del Grad-CAM, y por el mismo motivo.
// 2. **`puede_reintentar` manda sobre el botón**, no el estado. Lo calcula el servidor
//    (FALLIDA o RECHAZADA, y menos de tres intentos) y aquí no se repite esa cuenta.
//
// `codigo_error` (ERR-3001, ERR-3002) **no se le muestra a la persona**: el código que se
// dicta al administrador es el de los 5xx (W-31), y estos no lo son.
import { useState } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import DistintivoExperimental from "../components/DistintivoExperimental";
import Esqueleto from "../components/Esqueleto";
import { reintentarExplicacion } from "../services/analisis";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import type { ExplicacionAnalisis } from "../types";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import { useSondeoExplicacion } from "./useSondeoExplicacion";
import estilos from "./ResultadoExplicacion.module.css";

/** Respaldo por si `mensaje` no llegara: la tarjeta nunca se queda sin explicar qué pasó. */
const MENSAJE_DE_RESPALDO =
  "Explicación no disponible. El resultado, la confianza y el mapa de calor siguen siendo válidos.";

interface PropiedadesResultadoExplicacion {
  idAnalisis: string;
  /** `explicacion` del detalle: semilla para no parpadear si ya está generada. */
  semilla: ExplicacionAnalisis | null;
}

export default function ResultadoExplicacion({
  idAnalisis,
  semilla,
}: PropiedadesResultadoExplicacion) {
  const { explicacion, tardando, sinExplicacion, detenido, volverAConsultar, reanudarTrasReintento } =
    useSondeoExplicacion(idAnalisis, semilla);
  const [reintentando, setReintentando] = useState(false);
  const [avisoReintento, setAvisoReintento] = useState<AvisoError | null>(null);

  async function reintentar() {
    if (reintentando) return;
    setReintentando(true);
    setAvisoReintento(null);
    try {
      reanudarTrasReintento(await reintentarExplicacion(idAnalisis));
    } catch (causa) {
      if (esErrorGlobal(causa)) return;
      if (causa instanceof ErrorApi) {
        // El estado cambió entre la consulta y el clic: se vuelve a consultar y la tarjeta
        // se pinta con lo que diga el servidor, que es quien tiene la verdad.
        if (causa.codigo === CodigoErrorApi.EXPLICACION_NO_REINTENTABLE) {
          volverAConsultar();
          return;
        }
        if (causa.codigo === CodigoErrorApi.REINTENTOS_AGOTADOS) {
          const tope = causa.maxIntentos;
          setAvisoReintento({
            titulo: "No se puede volver a intentar",
            mensaje: tope
              ? `Ya se hicieron los ${tope} intentos de generar la explicación.`
              : "Ya se hicieron todos los intentos de generar la explicación.",
          });
          volverAConsultar();
          return;
        }
      }
      setAvisoReintento(avisoDeError(causa));
    } finally {
      setReintentando(false);
    }
  }

  const estado = explicacion?.estado ?? "PENDIENTE";
  const generando =
    !sinExplicacion && estado === "PENDIENTE" && !tardando && detenido === null;
  const fallo = estado === "FALLIDA" || estado === "RECHAZADA";

  return (
    <section className={estilos.tarjeta} aria-labelledby="titulo-explicacion">
      <div className={estilos.cabecera}>
        <h2 id="titulo-explicacion" className={estilos.titulo}>
          Explicación en lenguaje natural
        </h2>
        <DistintivoExperimental />
      </div>

      {/* W-08c. El esqueleto es decorativo; quien anuncia el cambio es la región de estado,
          que va fuera del subárbol con aria-busy para que el lector sí la exponga. */}
      {generando && (
        <>
          <p className={estilos.estado} role="status">
            Generando la explicación…
          </p>
          <div className={estilos.esqueleto} aria-busy="true">
            <Esqueleto forma="parrafo" />
          </div>
        </>
      )}

      {sinExplicacion && (
        <p className={estilos.pie}>
          Este análisis no tiene explicación en lenguaje natural. El resultado de arriba no
          cambia.
        </p>
      )}

      {estado === "GENERADA" && explicacion?.texto && (
        <>
          {/* Texto plano, nunca HTML: es la salida de un modelo (CLAUDE.md § 6). */}
          <p className={estilos.texto}>{explicacion.texto}</p>
          <p className={estilos.pie}>
            Texto generado automáticamente a partir de los datos del modelo (sin acceso a la
            imagen).
          </p>
        </>
      )}

      {/* W-08d. El mensaje es el del servidor, sin reescribir y sin el ERR-xxxx. */}
      {fallo && (
        <>
          <Alerta tipo="advertencia" titulo="Explicación no disponible">
            {explicacion?.mensaje?.trim() || MENSAJE_DE_RESPALDO}
          </Alerta>
          {explicacion?.puede_reintentar ? (
            <Boton
              jerarquia="secundario"
              cargando={reintentando}
              etiquetaCargando="Reintentando…"
              onClick={() => void reintentar()}
            >
              Reintentar
            </Boton>
          ) : (
            <p className={estilos.pie}>
              Ya se hicieron todos los intentos de generar la explicación. El resultado de
              arriba no cambia.
            </p>
          )}
        </>
      )}

      {/* Propuesta: Figma no dibuja la espera larga. No es W-08d, porque la explicación no ha
          fallado; y «Reintentar» aquí daría 409, porque sigue PENDIENTE. */}
      {tardando && (
        <>
          <Alerta tipo="info" titulo="La explicación está tardando más de lo normal">
            El resultado de arriba ya está completo y no depende de ella.
          </Alerta>
          <Boton jerarquia="secundario" onClick={volverAConsultar}>
            Volver a consultar
          </Boton>
        </>
      )}

      {detenido && (
        <>
          <Alerta tipo="error" titulo={detenido.titulo}>
            {detenido.mensaje}
          </Alerta>
          <Boton jerarquia="secundario" onClick={volverAConsultar}>
            Volver a consultar
          </Boton>
        </>
      )}

      {avisoReintento && (
        <Alerta tipo="error" titulo={avisoReintento.titulo}>
          {avisoReintento.mensaje}
        </Alerta>
      )}
    </section>
  );
}
