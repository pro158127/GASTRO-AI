// Pantalla W-06 · Nuevo análisis (Figma 47:600 y sus variantes). Solo rol DOCTOR.
//
// Estados dibujados que implementa: W-06a (inicio), W-06b (listo para solicitar), W-06c
// (formato no permitido), W-06d (imagen demasiado pesada y resolución insuficiente), W-06e
// (documento no válido), W-06f (subiendo), W-06g (verificando), W-06h (consultando el
// historial del paciente), W-06i (sin análisis con usted), W-06j (los números coinciden) y
// W-06k (los números no coinciden).
//
// **Quedan fuera a propósito**, y no por olvido: el botón «Ver historial de este paciente» del
// aviso de W-06b y la pantalla W-06l («Nuevo análisis abierto desde Historial con el documento
// ya escrito»). Las dos dependen de W-16 (Historial), que hoy es una pantalla pendiente: el
// botón llevaría a un marcador de posición y W-06l no se puede alcanzar ni probar. El traspaso
// del documento entre las dos pantallas —que va en memoria, nunca en la URL— se diseña cuando
// esté su consumidor delante.
//
// Dos pasos en el servidor (../ARCHITECTURE.md § 3.5): `POST /imagenes` deja la imagen en un
// área temporal que vence, y `POST /analisis` la consume junto con el documento. El documento
// solo vive en el estado de este componente: no va a la URL, ni a `sessionStorage`, ni a la
// consola.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoLista from "../components/CampoLista";
import CampoTexto from "../components/CampoTexto";
import EncabezadoPagina from "../components/EncabezadoPagina";
import IndicadorCarga from "../components/iconos/IndicadorCarga";
import ZonaCargaImagen, { idBotonSeleccionar } from "../components/ZonaCargaImagen";
import type { EstadoZonaCarga } from "../components/ZonaCargaImagen";
import { crearAnalisis } from "../services/analisis";
import { ErrorApi } from "../services/api";
import { obtenerTiposDocumento } from "../services/catalogos";
import { CodigoErrorApi } from "../services/codigosError";
import { cargarImagen } from "../services/imagenes";
import { consultarPaciente } from "../services/pacientes";
import type { HistorialPaciente, ImagenCargada, TipoDocumento } from "../types";
import type { AvisoError } from "../utils/avisosError";
import { avisoDeError, esDemasiadosIntentos, esErrorGlobal, AVISO_DEMASIADOS_INTENTOS } from "../utils/avisosError";
import {
  documentosCoinciden,
  esDocumentoValido,
  LONGITUD_MAXIMA_CAMPO,
  normalizarDocumento,
} from "../utils/documentoPaciente";
import { fechaCorta } from "../utils/fechas";
import estilos from "./NuevoAnalisis.module.css";

/** Peso máximo si el servidor no lo dice en `max_bytes` (el contrato fija 10 MB). */
const PESO_MAXIMO_POR_OMISION = 10 * 1024 * 1024;

const AYUDA_NUMERO =
  "Solo se usa para identificar el caso y no se guarda. Puede escribirlo con puntos o guiones.";
const AYUDA_CONFIRMACION = "Escríbalo de nuevo; no lo copie del campo anterior.";
const MENSAJE_DOCUMENTO_INVALIDO = "Escriba entre 6 y 10 dígitos. Puede incluir puntos o guiones.";
const MENSAJE_NO_COINCIDEN = "Los números no coinciden. Revíselos antes de continuar.";

/** «28 MB», «640 KB»: suficiente para decir por qué un archivo no cabe. */
function pesoLegible(bytes: number): string {
  const mega = bytes / (1024 * 1024);
  if (mega >= 1) return `${Math.round(mega)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Lo que la zona de carga muestra cuando el archivo no sirve (W-06c, W-06d). */
interface ErrorImagen {
  titulo: string;
  detalle: string;
}

/**
 * Texto del error de `POST /imagenes` por su código. El `mensaje` del servidor no se muestra
 * nunca: los textos son los de Figma y se eligen por `codigo`.
 */
function errorDeImagen(causa: unknown, archivo: File): ErrorImagen | null {
  if (!(causa instanceof ErrorApi)) return null;
  switch (causa.codigo) {
    case CodigoErrorApi.IMAGEN_FORMATO_NO_PERMITIDO:
      return {
        titulo: "Este formato no se puede analizar",
        detalle: `«${archivo.name}» no es un formato admitido. Cargue una imagen JPEG o PNG.`,
      };
    case CodigoErrorApi.IMAGEN_DEMASIADO_PESADA:
      return {
        titulo: "La imagen supera el tamaño permitido",
        detalle: `«${archivo.name}» pesa ${pesoLegible(archivo.size)}. El máximo es ${pesoLegible(
          causa.maxBytes ?? PESO_MAXIMO_POR_OMISION
        )}. Reduzca el tamaño o cargue otra imagen.`,
      };
    case CodigoErrorApi.IMAGEN_RESOLUCION_INSUFICIENTE: {
      const { ancho, alto } = causa.minimo ?? { ancho: 224, alto: 224 };
      return {
        titulo: "La imagen es demasiado pequeña",
        detalle: `La imagen mide menos de ${ancho} × ${alto} píxeles. Cargue una de mayor resolución.`,
      };
    }
    case CodigoErrorApi.IMAGEN_ILEGIBLE:
      return {
        titulo: "No pudimos leer la imagen",
        detalle: `No pudimos leer «${archivo.name}». Puede estar dañada: cargue otra imagen.`,
      };
    default:
      // 5xx, sin red o cualquier otro: no es culpa del archivo, así que va en la alerta de la
      // pantalla (W-30 o W-31) y la zona vuelve a estar vacía.
      return null;
  }
}

/** Catálogo de tipos de documento con sus tres estados, como `useRoles` para los roles. */
interface EstadoTipos {
  tipos: TipoDocumento[];
  cargando: boolean;
  error: boolean;
  reintentar: () => void;
}

function useTiposDocumento(): EstadoTipos {
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(false);
    obtenerTiposDocumento()
      .then((items) => {
        if (!vigente) return;
        setTipos(items);
        setCargando(false);
      })
      .catch((causa: unknown) => {
        if (!vigente) return;
        setCargando(false);
        // Los 401/403 ya los atiende el proveedor de sesión; aquí solo importa que el campo
        // sepa que no tiene opciones.
        if (!esErrorGlobal(causa)) setError(true);
      });
    return () => {
      vigente = false;
    };
  }, [intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { tipos, cargando, error, reintentar };
}

/** Consulta del historial del paciente (W-06h a W-06k), para el par (tipo, número) de ahora. */
type Consulta =
  | { fase: "sin" }
  | { fase: "consultando" }
  | { fase: "listo"; historial: HistorialPaciente }
  /** No se pudo comprobar: se pide la confirmación igual, que es lo prudente. */
  | { fase: "fallo" };

/** Carga de la imagen en curso. `fraccion` es `null` mientras el navegador no sabe el total. */
interface CargaEnCurso {
  nombre: string;
  fraccion: number | null;
}

export default function NuevoAnalisis({ titulo }: { titulo: string }) {
  const navegar = useNavigate();
  const idBase = useId();
  const idZona = `${idBase}-imagen`;
  const idNumero = `${idBase}-numero`;
  const idConfirmacion = `${idBase}-confirmacion`;
  const idRazon = `${idBase}-razon`;

  const catalogoTipos = useTiposDocumento();
  const [tipoDocumento, setTipoDocumento] = useState("");
  const [numero, setNumero] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  const [imagen, setImagen] = useState<ImagenCargada | null>(null);
  const [carga, setCarga] = useState<CargaEnCurso | null>(null);
  const [errorImagen, setErrorImagen] = useState<ErrorImagen | null>(null);

  const [consulta, setConsulta] = useState<Consulta>({ fase: "sin" });
  const [claveConsultada, setClaveConsultada] = useState<string | null>(null);
  /** Par (tipo, número) de la última consulta pedida, para descartar respuestas atrasadas. */
  const consultaVigenteRef = useRef<string | null>(null);

  const [errorTipo, setErrorTipo] = useState<string | undefined>();
  const [errorNumero, setErrorNumero] = useState<string | undefined>();
  const [errorConfirmacion, setErrorConfirmacion] = useState<string | undefined>();
  const [avisoFormulario, setAvisoFormulario] = useState<AvisoError | null>(null);
  const [enviando, setEnviando] = useState(false);

  // El primer tipo del catálogo queda elegido, como dibuja W-06a («Cédula de ciudadanía (CC)»):
  // el campo nunca se ve en blanco.
  useEffect(() => {
    if (tipoDocumento === "" && catalogoTipos.tipos.length > 0) {
      setTipoDocumento(catalogoTipos.tipos[0].codigo);
    }
  }, [catalogoTipos.tipos, tipoDocumento]);

  const subiendo = carga !== null;
  const numeroValido = esDocumentoValido(numero);
  const clave = `${tipoDocumento}|${normalizarDocumento(numero)}`;
  const consultaAlDia = claveConsultada === clave;
  // Sin análisis con este doctor, o sin poder comprobarlo: se escribe el número dos veces.
  const requiereConfirmacion =
    consultaAlDia &&
    (consulta.fase === "fallo" || (consulta.fase === "listo" && !consulta.historial.tiene_historial));
  const confirmacionCoincide = documentosCoinciden(numero, confirmacion);

  function enfocarZona() {
    document.getElementById(idBotonSeleccionar(idZona))?.focus();
  }

  /** Deja la zona lista para volver a cargar, sin tocar nada de lo que se escribió. */
  function pedirOtraImagen(error: ErrorImagen) {
    setImagen(null);
    setErrorImagen(error);
    enfocarZona();
  }

  async function subirImagen(archivo: File) {
    setErrorImagen(null);
    setAvisoFormulario(null);
    setImagen(null);
    setCarga({ nombre: archivo.name, fraccion: null });
    try {
      const cargada = await cargarImagen(archivo, {
        alProgreso: (fraccion) => setCarga((actual) => (actual ? { ...actual, fraccion } : actual)),
      });
      setImagen(cargada);
    } catch (causa) {
      if (esErrorGlobal(causa)) return;
      const problema = errorDeImagen(causa, archivo);
      if (problema) {
        setErrorImagen(problema);
        enfocarZona();
      } else {
        setAvisoFormulario(avisoDeError(causa));
      }
    } finally {
      setCarga(null);
    }
  }

  /**
   * W-06h. Se consulta al salir del campo y al cambiar el tipo de documento (cambia el
   * seudónimo), nunca en cada tecla: nginx limita esta ruta a 30 peticiones por minuto. El par
   * ya consultado se recuerda para no repetir la llamada.
   */
  // Función normal y no `useCallback`: solo la llaman manejadores de evento, nunca un efecto,
  // así que memorizarla no ahorra nada y sí arriesgaría quedarse con una versión vieja.
  async function consultarHistorial(tipo: string, numeroCrudo: string) {
    const normalizado = normalizarDocumento(numeroCrudo);
    const claveNueva = `${tipo}|${normalizado}`;
    // Cambiar el tipo mientras una consulta está en el aire dispara otra. Si la primera
    // respondiera después, pintaría el historial del documento anterior bajo el de ahora: se
    // descarta toda respuesta que ya no corresponda a la última consulta pedida.
    consultaVigenteRef.current = claveNueva;
    setClaveConsultada(claveNueva);
    setConsulta({ fase: "consultando" });
    try {
      const historial = await consultarPaciente(tipo, normalizado);
      if (consultaVigenteRef.current !== claveNueva) return;
      setConsulta({ fase: "listo", historial });
    } catch (causa) {
      if (consultaVigenteRef.current !== claveNueva) return;
      if (esErrorGlobal(causa)) return;
      if (causa instanceof ErrorApi && causa.codigo === CodigoErrorApi.DOCUMENTO_INVALIDO) {
        // El servidor no acepta este documento: es W-06e, no un fallo de la consulta. No se
        // mueve el foco: salir del campo no debe devolver a él (WCAG 3.2.2).
        consultaVigenteRef.current = null;
        setClaveConsultada(null);
        setConsulta({ fase: "sin" });
        repartirErrorDocumento(causa, false);
        return;
      }
      if (esDemasiadosIntentos(causa)) setAvisoFormulario(AVISO_DEMASIADOS_INTENTOS);
      // No se pudo comprobar: el formulario sigue utilizable y se pide la confirmación, que es
      // el camino prudente cuando no se sabe si el paciente es nuevo.
      setConsulta({ fase: "fallo" });
    }
  }

  /**
   * 422 DOCUMENTO_INVALIDO: el mensaje va al campo que diga `campos` (W-06e). `enfocar` solo
   * cuando el error es respuesta a una acción de la persona (pulsar «Solicitar análisis»);
   * tras un `blur` el foco se queda donde ella lo dejó.
   */
  function repartirErrorDocumento(causa: ErrorApi, enfocar: boolean) {
    const campos = causa.campos.map(({ campo }) => campo);
    if (campos.includes("tipo_documento")) setErrorTipo("Elija un tipo de documento válido.");
    if (campos.includes("numero_documento") || campos.length === 0) {
      setErrorNumero(MENSAJE_DOCUMENTO_INVALIDO);
      if (enfocar) document.getElementById(idNumero)?.focus();
    }
  }

  function cambiarTipo(nuevo: string) {
    setTipoDocumento(nuevo);
    setErrorTipo(undefined);
    setClaveConsultada(null);
    setConsulta({ fase: "sin" });
    if (esDocumentoValido(numero)) void consultarHistorial(nuevo, numero);
  }

  function cambiarNumero(valor: string) {
    setNumero(valor);
    setErrorNumero(undefined);
    setErrorConfirmacion(undefined);
    if (`${tipoDocumento}|${normalizarDocumento(valor)}` !== claveConsultada) {
      consultaVigenteRef.current = null;
      setClaveConsultada(null);
      setConsulta({ fase: "sin" });
    }
  }

  function salirDelNumero() {
    if (numero === "") return;
    if (!esDocumentoValido(numero)) {
      setErrorNumero(MENSAJE_DOCUMENTO_INVALIDO);
      return;
    }
    setErrorNumero(undefined);
    if (!consultaAlDia && tipoDocumento !== "") void consultarHistorial(tipoDocumento, numero);
  }

  function salirDeConfirmacion() {
    if (confirmacion === "" || confirmacionCoincide) {
      setErrorConfirmacion(undefined);
      return;
    }
    setErrorConfirmacion(MENSAJE_NO_COINCIDEN);
  }

  const puedeSolicitar =
    imagen !== null &&
    !subiendo &&
    tipoDocumento !== "" &&
    numeroValido &&
    consulta.fase !== "consultando" &&
    (!requiereConfirmacion || confirmacionCoincide);

  /** Lo que falta para poder solicitar, al lado del botón no disponible (Figma lo exige). */
  function razonNoDisponible(): string | null {
    if (puedeSolicitar) return null;
    if (subiendo) return "Espere a que termine la carga de la imagen.";
    if (consulta.fase === "consultando") return "Espere a que termine la comprobación del paciente.";
    if (imagen === null && !numeroValido)
      return "Cargue una imagen válida y escriba el número de documento para continuar.";
    if (imagen === null) return "Cargue una imagen válida para continuar.";
    if (!numeroValido) return "Escriba el número de documento del paciente para continuar.";
    if (requiereConfirmacion && !confirmacionCoincide)
      return "Confirme el número de documento para continuar.";
    return "Complete los datos del paciente para continuar.";
  }

  async function solicitar() {
    if (!puedeSolicitar || imagen === null || enviando) return;
    setEnviando(true);
    setAvisoFormulario(null);
    try {
      const analisis = await crearAnalisis({
        imagen_id: imagen.imagen_id,
        tipo_documento: tipoDocumento,
        numero_documento: normalizarDocumento(numero),
        // Solo se manda cuando el paciente no tiene análisis con este doctor (RF-D01 CA 12).
        ...(requiereConfirmacion ? { confirmacion_documento: normalizarDocumento(confirmacion) } : {}),
      });
      navegar(`/nuevo-analisis/${encodeURIComponent(analisis.id)}`);
    } catch (causa) {
      if (esErrorGlobal(causa)) return;
      atenderFalloSolicitud(causa);
    } finally {
      setEnviando(false);
    }
  }

  function atenderFalloSolicitud(causa: unknown) {
    if (causa instanceof ErrorApi) {
      switch (causa.codigo) {
        case CodigoErrorApi.DOCUMENTO_INVALIDO:
          repartirErrorDocumento(causa, true);
          return;
        case CodigoErrorApi.DOCUMENTO_NO_COINCIDE:
          // El servidor sabe que el paciente es nuevo aunque la consulta dijera otra cosa (o no
          // se pudiera hacer): se muestra el campo de confirmación y su error, sin decir cuál de
          // los dos números está mal.
          setConsulta({ fase: "fallo" });
          setClaveConsultada(clave);
          setErrorConfirmacion(MENSAJE_NO_COINCIDEN);
          document.getElementById(idConfirmacion)?.focus();
          return;
        case CodigoErrorApi.IMAGEN_EXPIRADA:
          // Lo único que caducó es la imagen: el documento y la consulta se conservan tal cual,
          // y solo hay que volver a cargar el archivo, que la persona ya tiene a mano.
          pedirOtraImagen({
            titulo: "La imagen cargada ya no está disponible",
            detalle: "Vuelva a cargarla para solicitar el análisis. Los datos del paciente se conservan.",
          });
          return;
        case CodigoErrorApi.SERVICIO_NO_DISPONIBLE:
          // Figma no dibuja este estado en W-06 (W-07c es la pantalla de progreso, y aquí el
          // análisis nunca llegó a crearse): se usa el mismo texto, en una alerta.
          setAvisoFormulario({
            titulo: "El análisis no está disponible en este momento",
            mensaje:
              "No pudimos iniciar el análisis. Intente de nuevo en unos minutos; si continúa, avise al administrador.",
          });
          return;
        default:
          break;
      }
    }
    setAvisoFormulario(avisoDeError(causa));
  }

  const zona: EstadoZonaCarga = carga
    ? {
        fase: "ocupada",
        nombre: carga.nombre,
        detalle:
          carga.fraccion === null
            ? "Subiendo…"
            : carga.fraccion < 1
              ? `Subiendo… ${Math.round(carga.fraccion * 100)} %`
              : "Verificando la imagen…",
      }
    : errorImagen
      ? { fase: "error", titulo: errorImagen.titulo, detalle: errorImagen.detalle }
      : imagen
        ? { fase: "cargada", nombre: imagen.nombre }
        : { fase: "vacia" };

  const textoEstadoCarga = carga
    ? carga.fraccion === null
      ? `Subiendo «${carga.nombre}»…`
      : carga.fraccion < 1
        ? `Subiendo «${carga.nombre}»… ${Math.round(carga.fraccion * 100)} %`
        : `Verificando «${carga.nombre}»…`
    : undefined;

  // Paso del flujo que está en curso: 1 hasta tener imagen, 2 mientras falta el paciente, 3
  // cuando solo queda pulsar «Solicitar análisis».
  const pasoActual = imagen === null || subiendo ? 1 : puedeSolicitar ? 3 : 2;
  const razon = razonNoDisponible();

  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Cargue la imagen endoscópica, escriba el tipo y número de documento del paciente y solicite el análisis."
      />

      <ol className={estilos.pasos}>
        {["1 · Imagen", "2 · Paciente", "3 · Solicitar"].map((etiqueta, indice) => (
          <li
            key={etiqueta}
            className={estilos.paso}
            data-actual={indice + 1 === pasoActual || undefined}
            aria-current={indice + 1 === pasoActual ? "step" : undefined}
          >
            {etiqueta}
          </li>
        ))}
      </ol>

      <section className={estilos.tarjeta} aria-labelledby={`${idBase}-titulo`}>
        <h2 id={`${idBase}-titulo`} className={estilos.soloLector}>
          Imagen y datos del paciente
        </h2>

        <div className={estilos.columnas}>
          <ZonaCargaImagen
            id={idZona}
            estado={zona}
            textoEstado={textoEstadoCarga}
            onArchivo={(archivo) => void subirImagen(archivo)}
          />

          <div className={estilos.datos}>
            <h3 className={estilos.subtitulo}>Paciente</h3>

            <CampoLista
              id={`${idBase}-tipo`}
              etiqueta="Tipo de documento"
              opciones={catalogoTipos.tipos.map((tipo) => ({
                valor: tipo.codigo,
                etiqueta: `${tipo.nombre} (${tipo.codigo})`,
              }))}
              valor={tipoDocumento}
              onCambio={cambiarTipo}
              mensajeError={errorTipo}
              disabled={subiendo || enviando}
              cargando={catalogoTipos.cargando}
              textoCargando="Cargando los tipos de documento…"
              error={
                catalogoTipos.error
                  ? {
                      texto: "No pudimos cargar los tipos de documento.",
                      nombreAccion: "cargar los tipos de documento",
                      onReintentar: catalogoTipos.reintentar,
                    }
                  : undefined
              }
            />

            <CampoTexto
              id={idNumero}
              etiqueta="Número de documento"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              maxLength={LONGITUD_MAXIMA_CAMPO}
              value={numero}
              onChange={(evento) => cambiarNumero(evento.target.value)}
              onBlur={salirDelNumero}
              ayuda={AYUDA_NUMERO}
              mensajeError={errorNumero}
              readOnly={enviando}
              required
            />

            {/* W-06h: el indicador va junto al campo y se anuncia con texto. */}
            {consulta.fase === "consultando" && (
              <div className={estilos.consultando}>
                <IndicadorCarga className={estilos.indicadorConsulta} />
                <p className={estilos.textoConsulta} role="status">
                  Buscando análisis de este paciente…
                </p>
              </div>
            )}

            {/* W-06b: el paciente ya tiene análisis con este doctor. */}
            {consultaAlDia && consulta.fase === "listo" && consulta.historial.tiene_historial && (
              <Alerta tipo="exito" titulo="Paciente con historial">
                {textoHistorial(consulta.historial)}
              </Alerta>
            )}

            {/* W-06i: sin análisis con usted, o sin haberlo podido comprobar. */}
            {requiereConfirmacion && (
              <>
                <Alerta tipo="info" titulo="Sin análisis con usted">
                  {consulta.fase === "fallo"
                    ? "No pudimos comprobar si ya atendió a este paciente. Confirme el número para evitar errores de escritura."
                    : "Si es la primera vez que atiende a este paciente, confirme el número para evitar errores de escritura."}
                </Alerta>
                <CampoTexto
                  id={idConfirmacion}
                  etiqueta="Confirmar número de documento"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={LONGITUD_MAXIMA_CAMPO}
                  value={confirmacion}
                  onChange={(evento) => {
                    setConfirmacion(evento.target.value);
                    setErrorConfirmacion(undefined);
                  }}
                  onBlur={salirDeConfirmacion}
                  // W-06j: cuando coinciden, la ayuda lo confirma.
                  ayuda={confirmacionCoincide ? "Los números coinciden." : AYUDA_CONFIRMACION}
                  mensajeError={errorConfirmacion}
                  readOnly={enviando}
                  required
                />
              </>
            )}

            <p className={estilos.nota}>
              La imagen se anonimiza antes de enviarse al modelo y no se usa para entrenarlo.
            </p>

            {avisoFormulario && (
              <Alerta tipo="error" titulo={avisoFormulario.titulo}>
                {avisoFormulario.mensaje}
              </Alerta>
            )}

            <Boton
              anchoCompleto
              cargando={enviando}
              etiquetaCargando="Solicitando análisis…"
              aria-disabled={!puedeSolicitar || undefined}
              aria-describedby={razon ? idRazon : undefined}
              onClick={() => void solicitar()}
            >
              Solicitar análisis
            </Boton>

            {razon && (
              <p id={idRazon} className={estilos.razon}>
                {razon}
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

/** «Tiene 2 análisis con usted. El último fue el 18/10/2026.» (W-06b). */
function textoHistorial(historial: HistorialPaciente): string {
  const cuantos =
    historial.total_analisis === 1
      ? "Tiene 1 análisis con usted."
      : `Tiene ${historial.total_analisis} análisis con usted.`;
  const ultimo = fechaCorta(historial.ultimo_analisis_en);
  return ultimo ? `${cuantos} El último fue el ${ultimo}.` : cuantos;
}
