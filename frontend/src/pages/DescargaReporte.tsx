// Pantalla W-17 · «Descargar reporte» del detalle de un análisis (64:3706), con sus tres
// estados: W-17d generando (98:6767), W-17e descarga iniciada (98:6941) y W-17f error al
// generar (98:7025). RF-H02. Solo DOCTOR, igual que las dos peticiones.
//
// **Este componente se monta solo en la rama COMPLETADO de `ResultadoAnalisis`.** El servicio
// rechaza con 422 ANALISIS_SIN_RESULTADO cualquier análisis que no esté COMPLETADO, así que un
// botón en la rama FALLIDO sería un botón que falla siempre; y PROCESANDO ni llega a pintarse,
// porque redirige a W-07. No está deshabilitado en las otras ramas: no está. Por eso el estado
// vive aquí y no en la pantalla —sin nodo no hay botón que deshabilitar por descuido.
//
// Secundario (botón blanco con borde e icono de descarga, como lo dibujan W-17e y W-17f) a la
// izquierda de «Nuevo análisis», que sigue siendo el primario de esta cabecera.
//
// Dos peticiones y dos puntos de fallo, con **títulos distintos a propósito**: «no se pudo
// generar» y «se generó pero no se pudo descargar» no son lo mismo para quien lo lee. Lo
// segundo le ahorra pensar que no tiene nada.
//
// El aviso de éxito se cierra solo a los 6 s (`tipo="exito"` de `Notificacion`); el de error no
// se cierra solo, a propósito. Un solo estado de carga para las dos peticiones: un
// «Descargando…» para la segunda sería un cuarto estado que Figma no dibuja.
//
// **Reintentar genera un reporte nuevo, y eso es una decisión, no un descuido.** No se guarda
// el `id` para reintentar solo la descarga, así que cada fallo del GET deja un reporte huérfano
// en el almacén (`reportes/{id}.pdf`). Se acepta por simplicidad: el PDF no identifica al
// paciente y solo lo puede leer quien lo generó.
import { useState } from "react";
import Boton from "../components/Boton";
import Notificacion from "../components/Notificacion";
import type { TipoNotificacion } from "../components/Notificacion";
import IconoDescargar from "../components/iconos/IconoDescargar";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import { descargarArchivoReporte, generarReporteDeAnalisis } from "../services/reportes";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import { useEntregaDeArchivo } from "./useEntregaDeArchivo";
import estilos from "./DescargaReporte.module.css";

const ETIQUETA = "Descargar reporte";

/**
 * Lo que el frontend **sí** sabe. W-17e dice «Reporte descargado — "Reporte_A-2026-000147.pdf"
 * se guardó en su carpeta de descargas», y de esa frase no se sostiene casi nada:
 *
 * - El nombre lo decide el servidor en `Content-Disposition`; se nombra solo cuando se pudo
 *   leer esa cabecera, y el que manda es `Reporte_GastroAI_{codigo}.pdf`, no el del frame.
 * - Dónde queda el archivo lo decide el navegador: puede preguntar, puede ir a otra carpeta y
 *   la persona puede cancelar el diálogo. Así que no se afirma el destino; se dice dónde
 *   mirar.
 * - Y «descargado» tampoco: lo único seguro es que la descarga **empezó**.
 */
const DONDE_BUSCAR = "Si no la encuentra, revise las descargas de su navegador.";
const TITULO_EXITO = "Reporte generado";
const TITULO_FALLO_GENERAR = "No se pudo generar el reporte";
const TITULO_FALLO_DESCARGAR = "El reporte se generó pero no se pudo descargar";
const VOLVER_A_PULSAR = `Vuelva a pulsar «${ETIQUETA}» para intentarlo de nuevo.`;

/** Solo para el atributo `download` cuando no se pudo leer el nombre real; no se muestra. */
const NOMBRE_DE_RESPALDO = "reporte-gastroai.pdf";

type AvisoFlotante = AvisoError & { tipo: TipoNotificacion };

/** El aviso de W-17f cuando falla el POST: el reporte no existe. */
function falloAlGenerar(causa: unknown): AvisoFlotante {
  if (causa instanceof ErrorApi) {
    if (causa.codigo === CodigoErrorApi.NO_ENCONTRADO) {
      return {
        tipo: "error",
        titulo: TITULO_FALLO_GENERAR,
        mensaje:
          "Este análisis ya no está disponible para usted. Vuelva al historial y ábralo de nuevo.",
      };
    }
    if (causa.codigo === CodigoErrorApi.SERVICIO_NO_DISPONIBLE) {
      return {
        tipo: "error",
        titulo: TITULO_FALLO_GENERAR,
        mensaje: "No pudimos guardar el reporte. Intente de nuevo en unos minutos.",
      };
    }
  }
  // Red caída (W-30) o cualquier otro fallo (W-31, con el código que se dicta al
  // administrador). El título dice cuál de las dos peticiones falló; el mensaje es el de
  // siempre.
  return { tipo: "error", titulo: TITULO_FALLO_GENERAR, mensaje: avisoDeError(causa).mensaje };
}

/**
 * El aviso de W-17f cuando falla el GET: el reporte sí se generó. El 404 aquí no es un
 * análisis ajeno, es un reporte que no es de quien lo pide o que ya no está.
 */
function falloAlDescargar(causa: unknown): AvisoFlotante {
  const mensaje =
    causa instanceof ErrorApi && causa.codigo === CodigoErrorApi.SERVICIO_NO_DISPONIBLE
      ? "No pudimos leer el reporte."
      : causa instanceof ErrorApi && causa.codigo === CodigoErrorApi.NO_ENCONTRADO
        ? "El reporte ya no está disponible."
        : avisoDeError(causa).mensaje;
  return {
    tipo: "error",
    titulo: TITULO_FALLO_DESCARGAR,
    mensaje: `${mensaje} ${VOLVER_A_PULSAR}`,
  };
}

export default function DescargaReporte({ idAnalisis }: { idAnalisis: string }) {
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<AvisoFlotante | null>(null);
  const entregarAlNavegador = useEntregaDeArchivo();

  async function descargar() {
    if (generando) return;
    setGenerando(true);
    setAviso(null);

    let reporte;
    try {
      reporte = await generarReporteDeAnalisis(idAnalisis);
    } catch (causa) {
      // 401, 403 PERMISO_DENEGADO y la etapa pendiente ya los atienden los manejadores
      // globales (W-01, W-28): la pantalla no dice nada más.
      if (!esErrorGlobal(causa)) setAviso(falloAlGenerar(causa));
      setGenerando(false);
      return;
    }

    try {
      const { blob, nombreArchivo } = await descargarArchivoReporte(reporte.id);
      entregarAlNavegador(blob, nombreArchivo ?? NOMBRE_DE_RESPALDO);
      setAviso({
        tipo: "exito",
        titulo: TITULO_EXITO,
        mensaje: nombreArchivo
          ? `Se inició la descarga de «${nombreArchivo}». ${DONDE_BUSCAR}`
          : `Se inició la descarga del reporte en PDF. ${DONDE_BUSCAR}`,
      });
    } catch (causa) {
      if (!esErrorGlobal(causa)) setAviso(falloAlDescargar(causa));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <Boton
        jerarquia="secundario"
        cargando={generando}
        etiquetaCargando="Generando reporte…"
        icono={<IconoDescargar className={estilos.icono} />}
        onClick={() => void descargar()}
      >
        {ETIQUETA}
      </Boton>

      {aviso && (
        <Notificacion
          tipo={aviso.tipo}
          titulo={aviso.titulo}
          mensaje={aviso.mensaje}
          onCerrar={() => setAviso(null)}
        />
      )}
    </>
  );
}
