// Pantalla W-07 · Procesando (Figma 47:797), con W-07b (calidad insuficiente, 89:1716) y W-07c
// (servicio no disponible, 89:2229). Solo rol DOCTOR.
//
// Se llega aquí desde W-06 con el identificador del análisis en la ruta. Ese identificador no
// es un dato personal —el documento del paciente nunca sale de W-06—, así que puede ir en la
// URL: recargar la página reanuda el sondeo en vez de perder el análisis.
//
// Lo que Figma decide y aquí se respeta: sin barra de progreso y sin porcentaje (decisión del
// líder), sin «Cancelar» (la espera es corta: p95 ≤ 10 s, RNF-10), y el estado de cada etapa
// siempre en texto, no solo por el color o el ícono (WCAG 1.4.1).
//
// Cómo se anuncia el avance: la lista de etapas es estática, **sin** `aria-live`; leer las
// cuatro líneas cada vez que llega una respuesta sería ruido. El cambio lo dice una sola región
// `role="status"` que se reescribe únicamente cuando una etapa cambia de estado. Esa región va
// **fuera** del elemento que lleva `aria-busy`: `aria-busy="true"` le pide al lector que no
// exponga todavía los cambios de ese subárbol, así que una región viva dentro podría quedarse
// callada. `aria-busy` se queda solo en la lista, que es lo que de verdad se reescribe.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import EncabezadoPagina from "../components/EncabezadoPagina";
import EstadoVacio from "../components/EstadoVacio";
import EnlaceBoton from "../components/EnlaceBoton";
import IconoCheck from "../components/iconos/IconoCheck";
import IconoError from "../components/iconos/IconoError";
import IconoPendiente from "../components/iconos/IconoPendiente";
import IndicadorCarga from "../components/iconos/IndicadorCarga";
import mascota from "../assets/mascota-topologo.svg";
import { reintentarAnalisis } from "../services/analisis";
import { CodigoErrorApi, CodigoFalloAnalisis } from "../services/codigosError";
import { ErrorApi } from "../services/api";
import type { CalidadImagen, EstadoAnalisisRespuesta, EstadoEtapa } from "../types";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import { useSondeoAnalisis } from "./useSondeoAnalisis";
import estilos from "./ProgresoAnalisis.module.css";

/** Las cuatro etapas en el orden en que ocurren, con el texto que dibuja W-07. */
const ETAPAS: { codigo: string; etiqueta: string; fallo: string }[] = [
  { codigo: "ANONIMIZAR", etiqueta: "Imagen anonimizada", fallo: "No se pudo anonimizar la imagen" },
  { codigo: "CALIDAD", etiqueta: "Calidad de imagen verificada", fallo: "Calidad insuficiente" },
  {
    codigo: "CLASIFICAR",
    etiqueta: "Clasificando características con el modelo",
    fallo: "No se pudo clasificar",
  },
  {
    codigo: "GRAD_CAM",
    etiqueta: "Generando el mapa de calor (Grad-CAM)",
    fallo: "No se pudo generar el mapa de calor",
  },
];

/** Sufijo de cada etapa. Con el análisis fallido, lo que no se alcanzó «no se realizó». */
const SUFIJOS: Record<EstadoEtapa, string> = {
  LISTO: "listo",
  EN_CURSO: "en curso",
  PENDIENTE: "pendiente",
  ERROR: "no se completó",
};

/** Las tres causas de calidad de W-07b, en adjetivo y en frase. */
const CALIDAD: Record<string, { etapa: string; frase: string; arreglo: string }> = {
  BORROSA: {
    etapa: "imagen borrosa",
    frase: "La imagen está borrosa: no tiene la nitidez necesaria para analizarla",
    arreglo: "Cargue otra imagen más nítida.",
  },
  OSCURA: {
    etapa: "imagen oscura",
    frase: "La imagen está oscura: no tiene la luz necesaria para analizarla",
    arreglo: "Cargue otra imagen con mejor iluminación.",
  },
  MUY_CLARA_O_REFLEJOS: {
    etapa: "imagen con reflejos",
    frase: "La imagen tiene reflejos o está demasiado clara para analizarla",
    arreglo: "Cargue otra imagen sin reflejos.",
  },
};

/** Texto de W-07b según las causas que mande el servidor; nunca se recalculan aquí. */
function descripcionCalidad(calidad: CalidadImagen | null | undefined): string {
  const causas = (calidad?.causas ?? []).filter((causa) => causa in CALIDAD);
  if (causas.length === 0) {
    return "La imagen no cumple los requisitos de calidad para analizarla, así que no se generó ningún resultado. Cargue otra imagen.";
  }
  const frases = causas.map((causa) => CALIDAD[causa].frase);
  const arreglos = causas.map((causa) => CALIDAD[causa].arreglo);
  const motivo = frases.length === 1 ? frases[0] : `${frases.slice(0, -1).join("; ")} y ${frases[frases.length - 1]}`;
  return `${motivo}, así que no se generó ningún resultado. ${arreglos[0]}`;
}

/** Sufijo de la etapa que falló: en calidad nombra la causa, como dibuja W-07b. */
function sufijoFallo(codigo: string, calidad: CalidadImagen | null | undefined): string {
  if (codigo !== "CALIDAD") return SUFIJOS.ERROR;
  const causa = (calidad?.causas ?? []).find((valor) => valor in CALIDAD);
  return causa ? CALIDAD[causa].etapa : SUFIJOS.ERROR;
}

interface Cabecera {
  titulo: string;
  descripcion: string;
}

/** Título y descripción de la tarjeta según cómo vaya el análisis. */
function cabecera(estado: EstadoAnalisisRespuesta | null): Cabecera {
  if (estado === null || estado.estado === "PROCESANDO") {
    return {
      titulo: "Analizando la imagen",
      descripcion: "Puede tardar unos segundos. No cierre esta ventana.",
    };
  }
  if (estado.estado === "COMPLETADO") {
    return { titulo: "Análisis completado", descripcion: "Abriendo el resultado…" };
  }
  if (estado.codigo_error === CodigoFalloAnalisis.CALIDAD_INSUFICIENTE) {
    return { titulo: "No pudimos analizar esta imagen", descripcion: descripcionCalidad(estado.calidad) };
  }
  // W-07c. `ERR-1003` (cola) y `ERR-1004` (error interno) no están dibujados: son fallos del
  // servicio igual que `ERR-1002`, así que se dicen con el mismo texto estándar, sin detalles
  // técnicos ni trazas (RF-R05 CA 5).
  return {
    titulo: "Servicio de análisis no disponible",
    descripcion:
      "El servicio que clasifica las imágenes no responde en este momento. Su imagen no se guardó. Intente de nuevo en unos minutos.",
  };
}

export default function ProgresoAnalisis({ titulo }: { titulo: string }) {
  const { idAnalisis = "" } = useParams();
  const navegar = useNavigate();
  const { estado, noEncontrado, detenido, reintentar } = useSondeoAnalisis(idAnalisis);
  const [reencolando, setReencolando] = useState(false);
  const [avisoReintento, setAvisoReintento] = useState<AvisoError | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  const procesando = estado === null || estado.estado === "PROCESANDO";
  const fallido = estado?.estado === "FALLIDO";
  const esCalidad = fallido && estado.codigo_error === CodigoFalloAnalisis.CALIDAD_INSUFICIENTE;

  // Al completarse se va al resultado. `replace`: «atrás» no debe volver a un progreso que ya
  // terminó. W-08 todavía no existe, así que esa ruta es una pantalla pendiente.
  useEffect(() => {
    if (estado?.estado === "COMPLETADO") {
      navegar(`/analisis/${encodeURIComponent(idAnalisis)}`, { replace: true });
    }
  }, [estado, idAnalisis, navegar]);

  // Al terminar en fallo, el foco va al título nuevo: el lector lee qué pasó y por qué, y el
  // siguiente tabulador cae en la acción que corresponde. Es el mismo recurso que usa la
  // disposición al cambiar de pantalla.
  useEffect(() => {
    if (fallido) tituloRef.current?.focus();
  }, [fallido]);

  // Región viva: solo habla cuando una etapa cambia de estado (ver la cabecera del archivo).
  const [anuncio, setAnuncio] = useState("");
  const anteriorRef = useRef<Map<string, EstadoEtapa>>(new Map());
  useEffect(() => {
    if (!estado) return;
    const anterior = anteriorRef.current;
    const cambiadas = estado.etapas.filter((etapa) => anterior.get(etapa.codigo) !== etapa.estado);
    anteriorRef.current = new Map(estado.etapas.map((etapa) => [etapa.codigo, etapa.estado]));
    // En la primera respuesta todas «cambian»: se anuncia solo la que está en curso.
    const interesante =
      cambiadas.find((etapa) => etapa.estado === "EN_CURSO") ??
      cambiadas.find((etapa) => etapa.estado === "ERROR") ??
      (anterior.size === 0 ? undefined : cambiadas.find((etapa) => etapa.estado === "LISTO"));
    if (!interesante) return;
    const definicion = ETAPAS.find((item) => item.codigo === interesante.codigo);
    if (!definicion) return;
    const texto =
      interesante.estado === "ERROR"
        ? `${definicion.fallo}, ${sufijoFallo(definicion.codigo, estado.calidad)}.`
        : `${definicion.etiqueta}, ${SUFIJOS[interesante.estado]}.`;
    setAnuncio(texto);
  }, [estado]);

  async function volverAEncolar() {
    if (reencolando) return;
    setReencolando(true);
    setAvisoReintento(null);
    try {
      await reintentarAnalisis(idAnalisis);
      reintentar();
    } catch (causa) {
      if (esErrorGlobal(causa)) return;
      if (causa instanceof ErrorApi && causa.codigo === CodigoErrorApi.NO_REINTENTABLE) {
        setAvisoReintento({
          titulo: "Este análisis ya no se puede reintentar",
          mensaje: "Solicite un análisis nuevo con otra imagen.",
        });
        return;
      }
      setAvisoReintento(avisoDeError(causa));
    } finally {
      setReencolando(false);
    }
  }

  if (noEncontrado) {
    return (
      <>
        <EncabezadoPagina titulo={titulo} />
        <EstadoVacio
          nivelTitulo="h2"
          titulo="No encontramos este análisis"
          mensaje="Puede que el enlace sea incorrecto o que el análisis no sea suyo."
        >
          <EnlaceBoton to="/nuevo-analisis" jerarquia="primario">
            Solicitar un análisis nuevo
          </EnlaceBoton>
        </EstadoVacio>
      </>
    );
  }

  const { titulo: tituloTarjeta, descripcion } = cabecera(estado);

  return (
    <>
      <EncabezadoPagina titulo={titulo} />

      <section className={estilos.tarjeta} aria-labelledby="progreso-titulo">
        <img src={mascota} alt="" className={estilos.mascota} />

        <h2 id="progreso-titulo" ref={tituloRef} tabIndex={-1} className={estilos.titulo}>
          {tituloTarjeta}
        </h2>
        <p className={estilos.descripcion}>{descripcion}</p>

        {/* `aria-busy` solo aquí: es la única parte que se reescribe en cada consulta. */}
        <ol className={estilos.etapas} aria-busy={procesando || undefined}>
          {ETAPAS.map((definicion) => {
            const etapa = estado?.etapas.find((item) => item.codigo === definicion.codigo);
            const estadoEtapa: EstadoEtapa = etapa?.estado ?? "PENDIENTE";
            const esError = estadoEtapa === "ERROR";
            // Con el análisis ya fallido, lo que quedó pendiente no se va a hacer.
            const sufijo = esError
              ? sufijoFallo(definicion.codigo, estado?.calidad)
              : fallido && estadoEtapa === "PENDIENTE"
                ? "no se realizó"
                : SUFIJOS[estadoEtapa];
            return (
              <li key={definicion.codigo} className={estilos.etapa} data-estado={estadoEtapa}>
                {esError ? (
                  <IconoError className={estilos.iconoEtapa} />
                ) : estadoEtapa === "LISTO" ? (
                  <IconoCheck className={estilos.iconoEtapa} />
                ) : estadoEtapa === "EN_CURSO" ? (
                  <IndicadorCarga className={estilos.iconoEtapa} />
                ) : (
                  <IconoPendiente className={estilos.iconoEtapa} />
                )}
                <span className={estilos.textoEtapa}>
                  {esError ? definicion.fallo : definicion.etiqueta} · {sufijo}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Fuera del `aria-busy` de arriba, a propósito. */}
        <p className={estilos.soloLector} role="status" aria-live="polite">
          {anuncio}
        </p>

        {/* El sondeo se detuvo tras varios fallos seguidos. No está dibujado en Figma: se usan
            los textos de los estados globales W-30 y W-31. */}
        {detenido && (
          <div className={estilos.avisoSondeo}>
            <Alerta tipo="error" titulo={detenido.titulo}>
              {detenido.mensaje}
            </Alerta>
            <Boton onClick={reintentar}>Reintentar</Boton>
          </div>
        )}

        {avisoReintento && (
          <div className={estilos.avisoSondeo}>
            <Alerta tipo="error" titulo={avisoReintento.titulo}>
              {avisoReintento.mensaje}
            </Alerta>
          </div>
        )}

        {procesando && !detenido && (
          <div className={estilos.consejo}>
            <img src={mascota} alt="" className={estilos.mascotaConsejo} />
            <div className={estilos.textoConsejo} role="status" aria-live="polite">
              <p className={estilos.tituloConsejo}>Consejo de TOPOLOGO</p>
              <p className={estilos.cuerpoConsejo}>
                Puede encontrar este análisis después en Historial, buscándolo por el documento del
                paciente.
              </p>
            </div>
          </div>
        )}

        {fallido && (
          <div className={estilos.acciones}>
            {esCalidad ? (
              // ERR-1001 no se reintenta: el backend responde 409 NO_REINTENTABLE. Lo que
              // corresponde es cargar otra imagen.
              <EnlaceBoton to="/nuevo-analisis" jerarquia="primario">
                Cargar otra imagen
              </EnlaceBoton>
            ) : (
              <Boton
                cargando={reencolando}
                etiquetaCargando="Reintentando…"
                onClick={() => void volverAEncolar()}
              >
                Reintentar
              </Boton>
            )}
            <EnlaceBoton to="/dashboard" jerarquia="secundario">
              Volver al inicio
            </EnlaceBoton>
          </div>
        )}
      </section>
    </>
  );
}
