// Tarjeta «Valoración profesional» de W-08 (Figma 47:870), con W-08e (guardando, 96:2718),
// W-08f (guardada, 96:2917), W-08g (error al guardar, 96:3119) y W-08h (salir sin guardar,
// 96:3321). RF-D04.
//
// **La valoración es irreversible**: hay una por análisis y por doctor, no se edita, y un
// segundo envío responde 409 OBSERVACION_YA_REGISTRADA sin sobrescribir nada. Figma no lo
// dice en ninguna parte, así que se añaden dos avisos —marcados como propuesta— y la tarjeta
// pasa a solo lectura en cuanto hay una registrada:
//
// 1. Una línea fija bajo las opciones, para que se lea mientras se elige y no al final.
// 2. Un diálogo de confirmación al guardar, con la valoración elegida.
//
// W-08f deja dibujado el formulario editable y el botón activo después de guardar. Aquí no:
// invitar a pulsar algo que el servidor ya rechaza con un 409 es peor que no tener el botón.
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router";
import type { BlockerFunction } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoAreaTexto from "../components/CampoAreaTexto";
import CampoOpciones from "../components/CampoOpciones";
import DialogoConfirmacion from "../components/DialogoConfirmacion";
import Notificacion from "../components/Notificacion";
import { crearObservacion } from "../services/analisis";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import { useSesion } from "../sesion/ProveedorSesion";
import type { ObservacionAnalisis, Valoracion } from "../types";
import { TEXTO_OBSERVACION_MAXIMO } from "../types";
import { fechaHoraCorta } from "../utils/fechas";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import estilos from "./ResultadoValoracion.module.css";

const OPCIONES: readonly { valor: Valoracion; etiqueta: string }[] = [
  { valor: "COINCIDE", etiqueta: "Coincide" },
  { valor: "NO_COINCIDE", etiqueta: "No coincide" },
  { valor: "NO_CONCLUYENTE", etiqueta: "No concluyente" },
];

const ETIQUETAS: Record<Valoracion, string> = {
  COINCIDE: "Coincide",
  NO_COINCIDE: "No coincide",
  NO_CONCLUYENTE: "No concluyente",
};

const AVISO_IRREVERSIBLE =
  "Solo puede registrar una valoración por análisis y después no se puede modificar.";

const FORMATO_NUMERO = new Intl.NumberFormat("es-CO");

interface PropiedadesResultadoValoracion {
  idAnalisis: string;
  /** La observación de quien mira, si ya la registró (`es_mia`). */
  observacionPropia: ObservacionAnalisis | null;
  /**
   * Las de los demás doctores (`es_mia: false`), en el orden que manda el servidor. Aparecen
   * cuando el caso llegó por traslado: quien lo recibe agrega la suya sin tocar la del
   * doctor de origen (RF-A07 CA 3).
   */
  observacionesAjenas: ObservacionAnalisis[];
  /** Vuelve a pedir el detalle: se usa cuando el 409 revela una valoración de otra pestaña. */
  onRecargar: () => void;
}

/**
 * Una valoración ya registrada, en solo lectura. La usan tres sitios: lo que se ve tras
 * guardar, lo que se ve al recargar la pantalla y cada valoración de otro profesional.
 */
function ValoracionRegistrada({
  valoracion,
  texto,
  quien,
  cuando,
  etiqueta = "Su valoración",
}: {
  valoracion: Valoracion;
  texto: string | null;
  quien: string;
  cuando: string;
  etiqueta?: string;
}) {
  return (
    <dl className={estilos.registrada}>
      <dt className={estilos.etiquetaDato}>{etiqueta}</dt>
      <dd className={estilos.valorDato}>{ETIQUETAS[valoracion]}</dd>
      {texto && (
        <>
          <dt className={estilos.etiquetaDato}>Observación</dt>
          <dd className={estilos.valorDato}>{texto}</dd>
        </>
      )}
      <dt className={estilos.etiquetaDato}>Registrada</dt>
      <dd className={estilos.valorDato}>
        {[quien, cuando].filter(Boolean).join(" · ")}
      </dd>
    </dl>
  );
}

export default function ResultadoValoracion({
  idAnalisis,
  observacionPropia,
  observacionesAjenas,
  onRecargar,
}: PropiedadesResultadoValoracion) {
  const { autenticado } = useSesion();

  // Lo que devuelve el 201, para no depender de que el detalle se recargue para pintar W-08f.
  const [recienRegistrada, setRecienRegistrada] = useState<{
    valoracion: Valoracion;
    texto: string | null;
    quien: string;
    cuando: string;
  } | null>(null);

  const [valoracion, setValoracion] = useState<Valoracion | "">("");
  const [texto, setTexto] = useState("");
  const [errorValoracion, setErrorValoracion] = useState<string | undefined>();
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [notificacion, setNotificacion] = useState<(AvisoError & { tipo: "exito" | "error" }) | null>(
    null
  );
  /** Llegó un 409: ya había una valoración registrada y esta no se va a poder guardar. */
  const [yaRegistrada, setYaRegistrada] = useState(false);
  /** Lo que se había escrito cuando llegó ese 409, para poder copiarlo. `null` si no había. */
  const [borradorPerdido, setBorradorPerdido] = useState<string | null>(null);

  /**
   * Al guardar, el formulario desaparece y con él el botón que tenía el foco: sin esto el
   * foco se iría al `body` y quien navega con teclado o lector quedaría al principio de la
   * página. Se lleva al título de la tarjeta, que es el mismo recurso que usa W-07 al
   * terminar en fallo.
   */
  const tituloRef = useRef<HTMLHeadingElement>(null);

  const sobran = texto.length - TEXTO_OBSERVACION_MAXIMO;
  const textoSobrepasado = sobran > 0;

  // ---------------------------------------------------------------- salir sin guardar (W-08h)
  //
  // Hay DOS caminos de salida y no comparten función, que es el fallo de la tarea 4 que avisa
  // NuevoAnalisis.tsx: allí, compartir una función entre «salir» y «cancelar» hizo que
  // «Cancelar» dejara de preguntar.
  //
  // 1. Salir con algo escrito y sin guardar → `useBlocker` abre W-08h. Es el camino genérico.
  // 2. Salir después de guardar → sin diálogo. Lo desarma `desarmarAvisoTrasGuardar`, que es
  //    SOLO para el camino del 201: cualquier otra salida tiene que seguir pasando por
  //    `useBlocker` sin tocar ese `ref`.
  //
  // Con la sesión cerrada no se pregunta: las guardas ya están llevando al inicio de sesión.
  //
  // `yaRegistrada` también desarma el aviso, y no solo el guardado con éxito: tras el 409 el
  // texto ya no se puede guardar por ningún camino, así que preguntar «¿salir sin guardar?»
  // sería ofrecer una decisión que no existe. El texto no se pierde de vista, queda en la
  // tarjeta para poder copiarlo.
  const yaNoSePuedeGuardar = recienRegistrada !== null || yaRegistrada;
  const hayBorrador = (valoracion !== "" || texto.trim() !== "") && !yaNoSePuedeGuardar;
  const avisarAlSalir = hayBorrador && autenticado;
  const avisarAlSalirRef = useRef(avisarAlSalir);
  avisarAlSalirRef.current = avisarAlSalir;

  const debeBloquear = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      avisarAlSalirRef.current && currentLocation.pathname !== nextLocation.pathname,
    []
  );
  const bloqueo = useBlocker(debeBloquear);

  // El formulario acaba de desaparecer: el foco va al título en vez de perderse.
  useEffect(() => {
    if (recienRegistrada !== null || yaRegistrada) tituloRef.current?.focus();
  }, [recienRegistrada, yaRegistrada]);

  // Recargar o cerrar la pestaña con la valoración a medias: aviso nativo del navegador.
  useEffect(() => {
    if (!avisarAlSalir) return;
    function alSalir(evento: BeforeUnloadEvent) {
      evento.preventDefault();
    }
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [avisarAlSalir]);

  /**
   * Desarma el aviso de salida. **Solo para el camino del 201.** Se pone el `ref` a mano,
   * sin esperar al siguiente render: una navegación inmediata después de guardar vería el
   * valor viejo y abriría un diálogo que ya no tiene nada que preguntar, porque la tarjeta
   * queda en solo lectura y no hay nada que descartar.
   */
  function desarmarAvisoTrasGuardar() {
    avisarAlSalirRef.current = false;
  }

  // ------------------------------------------------------------------------------- guardar

  function alPulsarGuardar() {
    if (valoracion === "") {
      setErrorValoracion("Elija una de las tres opciones para registrar su valoración.");
      return;
    }
    if (textoSobrepasado) return;
    setErrorValoracion(undefined);
    setConfirmando(true);
  }

  async function guardar() {
    if (valoracion === "" || guardando) return;
    setGuardando(true);
    try {
      const guardada = await crearObservacion(idAnalisis, { valoracion, texto });
      desarmarAvisoTrasGuardar();
      setRecienRegistrada({
        valoracion: guardada.valoracion,
        texto: guardada.texto,
        quien: `${guardada.autor.nombre} ${guardada.autor.apellido}`.trim(),
        cuando: fechaHoraCorta(guardada.registrada_en),
      });
      setConfirmando(false);
      setNotificacion({
        tipo: "exito",
        titulo: "Valoración guardada",
        mensaje: "Su valoración y su observación quedaron registradas con fecha y hora.",
      });
    } catch (causa) {
      setConfirmando(false);
      if (esErrorGlobal(causa)) return;
      if (causa instanceof ErrorApi && causa.codigo === CodigoErrorApi.OBSERVACION_YA_REGISTRADA) {
        // Otra pestaña (o la misma sesión en otro momento) ya registró la suya. No se
        // sobrescribe nunca, así que lo escrito aquí no se va a poder guardar: se conserva a
        // la vista para poder copiarlo en vez de tirarlo en silencio.
        setYaRegistrada(true);
        setBorradorPerdido(texto.trim() || null);
        desarmarAvisoTrasGuardar();
        onRecargar();
        return;
      }
      // W-08g: notificación de error que no se cierra sola. No se pierde lo escrito.
      setNotificacion({ tipo: "error", ...avisoDeError(causa) });
    } finally {
      setGuardando(false);
    }
  }

  // -------------------------------------------------------------------------------- pintar

  const registrada =
    recienRegistrada ??
    (observacionPropia
      ? {
          valoracion: observacionPropia.valoracion,
          texto: observacionPropia.texto,
          quien: `${observacionPropia.autor.nombre} ${observacionPropia.autor.apellido}`.trim(),
          cuando: fechaHoraCorta(observacionPropia.registrada_en),
        }
      : null);

  // Tras el 409 el formulario desaparece aunque la recarga del detalle todavía no haya
  // traído la observación: dejarlo en pantalla invitaría a pulsar Guardar para recibir otro
  // 409.
  const soloLectura = registrada !== null || yaRegistrada;

  return (
    <>
      <section className={estilos.tarjeta} aria-labelledby="titulo-valoracion">
        <h2 id="titulo-valoracion" ref={tituloRef} tabIndex={-1} className={estilos.titulo}>
          Valoración profesional{" "}
          {!soloLectura && <span className={estilos.opcional}>(opcional)</span>}
        </h2>

        {yaRegistrada && (
          <Alerta tipo="advertencia" titulo="Ya había una valoración registrada">
            Este análisis ya tiene su valoración, probablemente registrada desde otra pestaña.
            No se sobrescribe.
          </Alerta>
        )}

        {soloLectura ? (
          <>
            {registrada && <ValoracionRegistrada {...registrada} />}
            <p className={estilos.nota}>
              Las valoraciones no se modifican: queda registrada tal como se guardó.
            </p>
            {borradorPerdido && (
              <div className={estilos.borradorPerdido}>
                <p className={estilos.etiquetaDato}>Lo que había escrito aquí</p>
                <p className={estilos.valorDato}>{borradorPerdido}</p>
                <p className={estilos.nota}>
                  Este texto no se guardó y ya no se puede registrar. Cópielo si lo necesita.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <CampoOpciones
              etiqueta="¿Su valoración coincide con el resultado del modelo?"
              nombre="valoracion-profesional"
              opciones={OPCIONES}
              valor={valoracion}
              onCambio={(nuevo) => {
                setValoracion(nuevo as Valoracion);
                setErrorValoracion(undefined);
              }}
              mensajeError={errorValoracion}
              disabled={guardando}
            />

            <CampoAreaTexto
              etiqueta="Observación profesional"
              placeholder="Escriba su observación…"
              value={texto}
              onChange={(evento) => setTexto(evento.target.value)}
              maximo={TEXTO_OBSERVACION_MAXIMO}
              ayuda="Queda asociada a este análisis con su nombre y la fecha."
              mensajeError={
                textoSobrepasado
                  ? `Le ${sobran === 1 ? "sobra" : "sobran"} ${FORMATO_NUMERO.format(sobran)} ${
                      sobran === 1 ? "carácter" : "caracteres"
                    }: el máximo son ${FORMATO_NUMERO.format(TEXTO_OBSERVACION_MAXIMO)}.`
                  : undefined
              }
              disabled={guardando}
            />

            {/* Propuesta: Figma no dice en ninguna parte que esto no se pueda deshacer. */}
            <p className={estilos.nota}>{AVISO_IRREVERSIBLE}</p>

            <Boton
              jerarquia="primario"
              aria-disabled={textoSobrepasado || undefined}
              cargando={guardando}
              etiquetaCargando="Guardando…"
              onClick={alPulsarGuardar}
            >
              Guardar valoración
            </Boton>
          </>
        )}

        {/* PROPUESTA: ningún frame del archivo dibuja las valoraciones de otros doctores.
            W-17, que es el detalle desde el historial, solo muestra «Su valoración». El dato
            sí está en el contrato (RF-A07 CA 3: quien recibe un caso trasladado agrega la
            suya sin tocar la del doctor de origen) y en la API (`es_mia`), así que se pintan
            con el mismo formato de solo lectura que la propia, separadas y nombrando a su
            autor. Va al lote de diseño. */}
        {observacionesAjenas.length > 0 && (
          <div className={estilos.ajenas}>
            <h3 className={estilos.tituloAjenas}>
              {observacionesAjenas.length === 1
                ? "Valoración de otro profesional"
                : "Valoraciones de otros profesionales"}
            </h3>
            {observacionesAjenas.map((observacion) => (
              <ValoracionRegistrada
                key={observacion.id}
                etiqueta="Valoración"
                valoracion={observacion.valoracion}
                texto={observacion.texto}
                quien={`${observacion.autor.nombre} ${observacion.autor.apellido}`.trim()}
                cuando={fechaHoraCorta(observacion.registrada_en)}
              />
            ))}
          </div>
        )}
      </section>

      {confirmando && valoracion !== "" && (
        <DialogoConfirmacion
          titulo="¿Registrar esta valoración?"
          mensaje={`Se registrará «${ETIQUETAS[valoracion]}» con su nombre y la fecha. ${AVISO_IRREVERSIBLE}`}
          etiquetaConfirmar="Registrar valoración"
          etiquetaCancelar="Seguir editando"
          confirmarEsPrimario
          enviando={guardando}
          etiquetaEnviando="Guardando…"
          onConfirmar={() => void guardar()}
          onCancelar={() => setConfirmando(false)}
        />
      )}

      {/* W-08h. Mismo patrón que D-11 en W-06 (RNF-08). «Seguir aquí» es el principal. */}
      {bloqueo.state === "blocked" && (
        <DialogoConfirmacion
          titulo="¿Salir sin guardar su valoración?"
          mensaje="Lo que escribió se perderá. El resultado del análisis se conserva."
          etiquetaConfirmar="Salir sin guardar"
          etiquetaCancelar="Seguir aquí"
          onConfirmar={() => bloqueo.proceed()}
          onCancelar={() => bloqueo.reset()}
        />
      )}

      {notificacion && (
        <Notificacion
          tipo={notificacion.tipo}
          titulo={notificacion.titulo}
          mensaje={notificacion.mensaje}
          onCerrar={() => setNotificacion(null)}
        />
      )}
    </>
  );
}
