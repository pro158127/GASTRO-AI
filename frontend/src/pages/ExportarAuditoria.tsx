// «Exportar auditoría» de W-19 (Figma 101:877, dentro del encabezado), con sus dos estados:
// W-19c exportando (101:852) y W-19d exportada (101:1097). RF-DB02 CA 7 y 10. Solo ADMINISTRADOR.
//
// **El frame dibuja un botón y nada más, y el servicio exige un período con los dos extremos.**
// No hay ni un campo de fecha en toda la pantalla, pero `GET /admin/auditoria/exportar` rechaza
// con 422 si falta `desde` o `hasta`, y el propio W-19d se delata al decir «Archivo CSV con el
// período elegido»: elegido ¿dónde? La maqueta está incompleta. Se resuelve con un diálogo que
// pide el período antes de exportar, que es lo único compatible con el contrato: un período fijo
// escondido dejaría al administrador sin poder pedir el rango que le piden a él, y los dos
// códigos de error de fecha solo tienen sentido si hay dónde corregirlos.
//
// **Tres desviaciones del frame, todas a propósito:**
//
//  1. El aviso de «generando» de W-19c es el componente «Notificación» en variante Info (azul,
//     icono de información). `Notificacion` en código solo tiene `exito` y `error`, y la comparten
//     ocho pantallas: no se le añade una variante por esto. Se usa `Alerta tipo="info"`, que ya
//     es exactamente ese icono y ese color, dentro del diálogo —que es donde está la mirada— en
//     vez de flotando arriba a la derecha.
//  2. El nombre de archivo de W-19d («Auditoria_cuentas_2FA_2026-10-19.csv») **no existe**: el
//     servidor manda `auditoria_{desde}_{hasta}.csv`, con dos fechas y en minúscula
//     (`backend/app/services/bitacora.py:225`). No se escribe en ninguna parte; se nombra el
//     archivo solo cuando se pudo leer de `Content-Disposition`.
//  3. «Se guardó en su carpeta de descargas» no se sabe, igual que en W-17e: lo decide el
//     navegador, que puede preguntar, ir a otra carpeta o que la persona cancele el diálogo. Se
//     dice que la descarga se inició y dónde mirar.
//
// **Y el botón no exporta la bitácora.** Son cuatro tipos de evento, no el registro completo que
// el administrador acaba de ver en W-21. Esa advertencia vive en el diálogo, donde se decide, y
// no solo en un aviso que se va a los seis segundos.
import { useId, useRef, useState } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoTexto from "../components/CampoTexto";
import Notificacion from "../components/Notificacion";
import type { TipoNotificacion } from "../components/Notificacion";
import IconoDescargar from "../components/iconos/IconoDescargar";
import { useAtraparFoco } from "../disposicion/useAtraparFoco";
import { ErrorApi } from "../services/api";
import { exportarAuditoria } from "../services/auditoria";
import { CodigoErrorApi } from "../services/codigosError";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import { diaEnColombia, diaEnColombiaMenos, diasEntre } from "../utils/fechas";
import { useEntregaDeArchivo } from "./useEntregaDeArchivo";
import estilos from "./ExportarAuditoria.module.css";

const ETIQUETA = "Exportar auditoría";
const GENERANDO = "Generando auditoría…";

/**
 * Con cuántos días llega relleno el período: los últimos 30, contando hoy.
 *
 * No se deja en blanco a propósito. Un formulario vacío con un máximo de días invita al 422 en
 * el primer intento, y «el mes en curso» daría un período de un solo día cada día 1, con lo que
 * quien pulse sin mirar se lleva un CSV vacío creyendo que exportó el mes.
 */
const DIAS_RELLENO = 30;

/** Solo para el atributo `download` cuando no se pudo leer el nombre real; no se muestra. */
const NOMBRE_DE_RESPALDO = "auditoria-gastroai.csv";

const QUE_INCLUYE =
  "Elija el período. El archivo incluye solo la creación de cuentas y las verificaciones en dos pasos, no toda la bitácora.";
const DONDE_BUSCAR = "Si no lo encuentra, revise las descargas de su navegador.";
const TITULO_EXITO = "Auditoría exportada";
const TITULO_FALLO = "No se pudo exportar la auditoría";
const VOLVER_A_PULSAR = `Vuelva a pulsar «${ETIQUETA}» para intentarlo de nuevo.`;

/**
 * Campo donde se pinta un período inválido cuando el servidor no dice cuál es.
 *
 * `PERIODO_INVALIDO` llega **sin `campos`**: el servicio lo lanza pasando `extra=` por nombre y
 * saltándose la lista (`backend/app/services/bitacora.py:228-229`), al contrario que
 * `RANGO_FECHAS_INVALIDO`, que sí la manda. Así que lo elige el frontend, y elige «Desde»
 * porque es el extremo que señala el otro error de fechas: los dos problemas del período se
 * corrigen en el mismo sitio.
 */
const CAMPO_PERIODO = "desde";

type AvisoFlotante = AvisoError & { tipo: TipoNotificacion };

type ErroresCampos = Record<string, string>;

/** El aviso flotante cuando el fallo no es del período. */
function falloAlExportar(causa: unknown): AvisoFlotante {
  const mensaje =
    causa instanceof ErrorApi && causa.codigo === CodigoErrorApi.SERVICIO_NO_DISPONIBLE
      ? "No pudimos generar la auditoría."
      : avisoDeError(causa).mensaje;
  return { tipo: "error", titulo: TITULO_FALLO, mensaje: `${mensaje} ${VOLVER_A_PULSAR}` };
}

/**
 * Los errores de fecha del servidor, repartidos por campo, o `null` si el fallo no es de fecha.
 *
 * En `RANGO_FECHAS_INVALIDO` **el servidor dice qué campo está mal y qué decir**, así que se
 * recorre `campos` en vez de codificar «desde» a mano, igual que en W-21; si algún día señala
 * otro campo, esto sigue funcionando. El respaldo es para el caso imposible de que llegue sin
 * lista: un error que no se pinta en ninguna parte sería peor que uno pintado en «Desde».
 */
function erroresDeFecha(causa: unknown): ErroresCampos | null {
  if (!(causa instanceof ErrorApi)) return null;

  if (causa.codigo === CodigoErrorApi.RANGO_FECHAS_INVALIDO) {
    const mensajes: ErroresCampos = {};
    for (const campo of causa.campos) mensajes[campo.campo] = campo.mensaje;
    if (Object.keys(mensajes).length > 0) return mensajes;
    return { [CAMPO_PERIODO]: "Debe ser anterior o igual a «Hasta»." };
  }

  if (causa.codigo === CodigoErrorApi.PERIODO_INVALIDO) {
    // El número lo dice el servidor en `max_dias`; aquí no se escribe ninguno. Sin él, el texto
    // no inventa una cifra. El diálogo no deja enviar sin los dos extremos, así que la otra
    // rama de este código («falta la fecha inicial y la final») no es alcanzable desde aquí.
    return {
      [CAMPO_PERIODO]:
        causa.maxDias === null
          ? "El período elegido es demasiado largo. Acórtelo e intente de nuevo."
          : `El período no puede superar ${causa.maxDias} días.`,
    };
  }

  // 422 DATOS_INVALIDOS: una fecha que el servidor no pudo leer. No debería llegar desde un
  // `<input type="date">`, pero si llega, el mensaje del servidor va a su campo.
  if (causa.codigo === CodigoErrorApi.DATOS_INVALIDOS && causa.campos.length > 0) {
    const mensajes: ErroresCampos = {};
    for (const campo of causa.campos) mensajes[campo.campo] = campo.mensaje;
    return mensajes;
  }

  return null;
}

interface PropiedadesDialogo {
  desde: string;
  hasta: string;
  onCambioDesde: (valor: string) => void;
  onCambioHasta: (valor: string) => void;
  erroresCampos: ErroresCampos;
  exportando: boolean;
  onExportar: () => void;
  onCancelar: () => void;
}

/**
 * El diálogo del período. **No existe en Figma**: es la pieza que falta en la maqueta, no un
 * patrón del sistema de diseño, y por eso vive aquí y no en `components/`.
 *
 * Es el esqueleto de `DialogoCambiarRol` (el precedente más cercano: un diálogo con un control
 * dentro), con `role="dialog"` y no `alertdialog` —hay campos que rellenar, no una alerta— y con
 * `useAtraparFoco` resolviendo foco inicial, foco atrapado, Esc y foco devuelto al cerrar.
 * Mientras se exporta, Esc no cierra: la petición ya salió.
 *
 * **Dónde va el `aria-busy`, que no es un detalle.** No va en el contenedor del diálogo: ese
 * atributo silencia cualquier región live que quede dentro, y dentro está justamente el
 * `role="status"` de la `Alerta` que anuncia la espera. El lector se callaría durante los
 * segundos que ese aviso existe para cubrir. Así que `aria-busy` se acota a lo que de verdad
 * está ocupado —los dos campos—, la `Alerta` queda fuera de su alcance como hermana, y cada
 * botón marca el suyo (`Boton` pone `aria-busy` cuando está cargando). Si alguien «simplifica»
 * subiendo el atributo al contenedor, rompe el aviso sin que se note.
 */
function DialogoPeriodo({
  desde,
  hasta,
  onCambioDesde,
  onCambioHasta,
  erroresCampos,
  exportando,
  onExportar,
  onCancelar,
}: PropiedadesDialogo) {
  const dialogoRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idMensaje = useId();
  useAtraparFoco(dialogoRef, () => {
    if (!exportando) onCancelar();
  });

  return (
    <div className={estilos.capa}>
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idMensaje}
        className={estilos.dialogo}
      >
        <h2 id={idTitulo} className={estilos.titulo}>
          {ETIQUETA}
        </h2>
        <p id={idMensaje} className={estilos.mensaje}>
          {QUE_INCLUYE}
        </p>

        {/* El `aria-busy` llega hasta aquí y no más: ver la cabecera del componente. */}
        <div className={estilos.campos} aria-busy={exportando || undefined}>
          <CampoTexto
            etiqueta="Desde"
            type="date"
            value={desde}
            onChange={(evento) => onCambioDesde(evento.target.value)}
            mensajeError={erroresCampos.desde}
            disabled={exportando}
          />
          <CampoTexto
            etiqueta="Hasta"
            type="date"
            value={hasta}
            onChange={(evento) => onCambioHasta(evento.target.value)}
            mensajeError={erroresCampos.hasta}
            disabled={exportando}
          />
        </div>

        {/* W-19c, fuera del alcance del `aria-busy` para que su `role="status"` se anuncie. No
            repite qué incluye el archivo: eso ya está fijo dos líneas más arriba. */}
        {exportando && (
          <Alerta tipo="info" titulo="Generando la auditoría">
            Le avisaremos cuando la descarga esté lista.
          </Alerta>
        )}

        {/* El primario a la derecha y el orden del DOM igual al visual (WCAG 2.4.3). */}
        <div className={estilos.acciones}>
          {/* aria-disabled y no `disabled`: el botón conserva el foco mientras se exporta. */}
          <Boton
            jerarquia="secundario"
            aria-disabled={exportando || undefined}
            onClick={onCancelar}
          >
            Cancelar
          </Boton>
          <Boton cargando={exportando} etiquetaCargando={GENERANDO} onClick={onExportar}>
            Exportar
          </Boton>
        </div>
      </div>
    </div>
  );
}

export default function ExportarAuditoria() {
  const [abierto, setAbierto] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState<AvisoFlotante | null>(null);
  const [erroresCampos, setErroresCampos] = useState<ErroresCampos>({});
  const entregarAlNavegador = useEntregaDeArchivo();

  // Los últimos 30 días, en días de Colombia (que es como los interpreta el servidor). Viven
  // aquí y no dentro del diálogo: así cerrarlo —por un fallo o a mano— no borra lo elegido.
  const [desde, setDesde] = useState(() => diaEnColombiaMenos(DIAS_RELLENO - 1));
  const [hasta, setHasta] = useState(() => diaEnColombia());

  /**
   * Cuántos días puede abarcar el período, **aprendido del servidor** en el primer rechazo.
   *
   * Arranca en `null` a propósito: el tope vive en el backend (`PERIODO_MAXIMO_DIAS`) y
   * escribirlo también aquí sería duplicar un número que mañana puede cambiar allá. Mientras no
   * se sepa, el período largo lo rechaza el servidor; desde ese momento se comprueba antes de
   * salir. Con el relleno de 30 días, el caso casi no se provoca por descuido.
   */
  const [maxDias, setMaxDias] = useState<number | null>(null);

  /**
   * Comprobaciones del navegador, que son **solo ayuda**: la autoridad es el servidor.
   *
   * Lo de los extremos vacíos no es cosmético: `desde` y `hasta` son fechas opcionales en el
   * servidor, y mandar una cadena vacía no es «no mandar nada», sino un 422 distinto del del
   * período (ver `services/auditoria.ts`).
   */
  function comprobar(): ErroresCampos {
    const fallos: ErroresCampos = {};
    if (desde === "") fallos.desde = "Indique la fecha inicial.";
    if (hasta === "") fallos.hasta = "Indique la fecha final.";
    if (Object.keys(fallos).length > 0) return fallos;

    const dias = diasEntre(desde, hasta);
    if (dias === null) return fallos;
    if (dias < 0) {
      fallos.desde = "Debe ser anterior o igual a «Hasta».";
    } else if (maxDias !== null && dias > maxDias - 1) {
      // `diasEntre` es la diferencia y `maxDias` cuenta los dos extremos: de ahí el -1, que es
      // exactamente como lo mide el servidor (`bitacora.py:191`).
      fallos.desde = `El período no puede superar ${maxDias} días.`;
    }
    return fallos;
  }

  function abrir() {
    setErroresCampos({});
    setAviso(null);
    setAbierto(true);
  }

  function cancelar() {
    if (exportando) return;
    setAbierto(false);
  }

  async function exportar() {
    if (exportando) return;

    const fallos = comprobar();
    if (Object.keys(fallos).length > 0) {
      setErroresCampos(fallos);
      return;
    }

    setErroresCampos({});
    setExportando(true);
    try {
      const { blob, nombreArchivo } = await exportarAuditoria(desde, hasta);
      entregarAlNavegador(blob, nombreArchivo ?? NOMBRE_DE_RESPALDO);
      // Primero se cierra el diálogo y después aparece el aviso: un aviso de éxito con el
      // diálogo todavía encima diría que la acción terminó y que sigue pendiente a la vez.
      setAbierto(false);
      setAviso({
        tipo: "exito",
        titulo: TITULO_EXITO,
        // Ni una palabra sobre cuántas filas trae: el frontend no las cuenta y no se pone a
        // interpretar el CSV para saberlo. Un período sin eventos devuelve un archivo con solo
        // la cabecera, y eso es un éxito, no un fallo.
        mensaje: nombreArchivo
          ? `Se inició la descarga de «${nombreArchivo}». ${DONDE_BUSCAR}`
          : `Se inició la descarga del archivo CSV. ${DONDE_BUSCAR}`,
      });
    } catch (causa) {
      // 401, 403 PERMISO_DENEGADO y la etapa pendiente ya los atienden los manejadores
      // globales (W-01, W-28): la pantalla no dice nada más.
      if (esErrorGlobal(causa)) return;

      if (causa instanceof ErrorApi && causa.maxDias !== null) setMaxDias(causa.maxDias);

      const porCampo = erroresDeFecha(causa);
      if (porCampo) {
        // El diálogo sigue abierto y el error se pinta en su campo: cerrarlo para enseñar un
        // aviso flotante haría perder el período que la persona acababa de escribir.
        setErroresCampos(porCampo);
        return;
      }

      setAbierto(false);
      setAviso(falloAlExportar(causa));
    } finally {
      setExportando(false);
    }
  }

  return (
    <>
      <Boton
        jerarquia="secundario"
        cargando={exportando}
        etiquetaCargando={GENERANDO}
        icono={<IconoDescargar className={estilos.icono} />}
        onClick={abrir}
      >
        {ETIQUETA}
      </Boton>

      {abierto && (
        <DialogoPeriodo
          desde={desde}
          hasta={hasta}
          onCambioDesde={setDesde}
          onCambioHasta={setHasta}
          erroresCampos={erroresCampos}
          exportando={exportando}
          onExportar={() => void exportar()}
          onCancelar={cancelar}
        />
      )}

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
