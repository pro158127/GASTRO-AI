// Pantalla W-25 · Reasignación de casos activos (Figma 74:5436), con D-10 (confirmación de
// reasignar, 100:4042) y la salida a D-10b (vuelta al detalle con la notificación, 100:4122).
// RF-A06, parte del flujo F5.
//
// Se entra desde W-11 cuando el administrador va a desactivar o eliminar a un doctor que tiene
// casos activos (D-02): no tiene ítem propio en el menú. Al terminar se vuelve al detalle para
// completar esa baja.
//
// **También cubre RF-A06 como reasignación suelta (#116, hasta ahora sin implementar).** El paso
// 1 es un desplegable de doctor de origen, como dibuja Figma («Viene seleccionado desde el
// detalle de la cuenta; se puede cambiar»), y el endpoint `reasignar-casos` no da de baja a
// nadie. Si el administrador cambia el origen, esta pantalla deja de ser el paso previo de la
// baja que lo trajo: se borra la baja pendiente y la notificación final ya no dice «ya puede
// desactivar o eliminar la cuenta», porque sería falso.
//
// Decisiones del equipo sobre lo que Figma dibuja y la API entrega:
// - **Una fila por análisis.** Figma dibuja cuatro filas para «(4) casos» con las columnas «ID de
//   análisis» y «Fecha», es decir, da por hecho un análisis por caso. La API devuelve los
//   análisis anidados dentro de cada caso, y un caso puede tener varios. Se aplana a una fila por
//   análisis (las columnas dibujadas son de análisis) y los conteos del título y del botón salen
//   de `total_casos`, que es el mismo número que dicen el detalle y el 409 DESTINO_REQUERIDO.
//   Cuando los dos totales no coinciden se añade una frase que lo explica, para que la cuenta de
//   filas no desmienta al título.
// - **Las dos columnas se ordenan aquí.** `EncabezadoTabla` advierte que no se use en columnas
//   que ordena el navegador, porque con varias páginas mentiría. Aquí no hay páginas: el endpoint
//   devuelve todos los casos de una vez, así que ordenar la lista completa dice la verdad. Abre
//   por fecha descendente, que es el orden en el que llega del servidor y el que dibuja Figma.
// - **Se reasignan todos los casos** (`caso_ids: null`). Figma no dibuja casillas para elegir
//   cuáles, y la baja solo avanza cuando el doctor se queda sin ninguno.
// - Figma no dibuja el estado vacío (un doctor sin casos activos), el de error de red ni el de
//   una cuenta que no es doctor. Se usan `EstadoVacio` y `Alerta` como en el resto de la
//   aplicación. Pendiente de dibujar.
// - La etiqueta del paso 1 es la de Figma («Doctor que será desactivado o eliminado») cuando se
//   llega con una baja pendiente. Sin baja pendiente diría algo que no va a pasar, así que ahí se
//   nombra lo que sí es cierto.
//
// Seguridad: los identificadores de caso y de análisis solo viven en el estado de esta pantalla;
// no van a la URL, al almacenamiento ni a la consola, y tampoco vuelven al servidor. De los casos
// solo se muestra el código del análisis y su fecha: nada clínico ni del paciente (CA 2).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoLista from "../components/CampoLista";
import DialogoConfirmacion from "../components/DialogoConfirmacion";
import EncabezadoPagina from "../components/EncabezadoPagina";
import EncabezadoTabla from "../components/EncabezadoTabla";
import type { OrdenColumna } from "../components/EncabezadoTabla";
import EnlaceBoton from "../components/EnlaceBoton";
import Esqueleto from "../components/Esqueleto";
import EstadoVacio from "../components/EstadoVacio";
import type { Opcion } from "../components/CampoOpciones";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import {
  listarCasosActivos,
  listarDoctoresActivos,
  obtenerUsuario,
  reasignarCasos,
} from "../services/usuariosAdmin";
import type { AnalisisCasoActivo, CasosActivosDoctor, UsuarioDetalle, UsuarioResumen } from "../types";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import { fechaHoraCorta } from "../utils/fechas";
import { dejarNotificacion } from "../utils/notificacionPendiente";
import { nombreCompleto } from "../utils/presentacionUsuario";
import { dejarBajaPendiente, leerBajaPendiente, limpiarBajaPendiente } from "../utils/reasignacionPendiente";
import type { BajaPendiente } from "../utils/reasignacionPendiente";
import estilos from "./ReasignarCasos.module.css";

const RUTA_USUARIOS = "/usuarios";
const FILAS_ESQUELETO = 4;

/** Columnas que se pueden ordenar. */
type ColumnaCasos = "codigo" | "fecha";

interface Orden {
  columna: ColumnaCasos;
  descendente: boolean;
}

/** Como llega del servidor y como lo dibuja Figma: lo más reciente primero. */
const ORDEN_INICIAL: Orden = { columna: "fecha", descendente: true };

type Carga =
  | { fase: "cargando" }
  | { fase: "error"; aviso: AvisoError }
  | { fase: "noEncontrado" }
  | { fase: "listo"; origen: UsuarioDetalle; casos: CasosActivosDoctor };

/** «4 casos» / «1 caso», para el botón y el título del diálogo. */
function textoCasos(cantidad: number): string {
  return cantidad === 1 ? "1 caso" : `${cantidad} casos`;
}

/** «Luis Gómez · luis.gomez@usc.edu.co», como dibuja Figma; sin correo, solo el nombre. */
function etiquetaDoctor(doctor: UsuarioResumen | UsuarioDetalle): string {
  const nombre = nombreCompleto(doctor);
  return doctor.correo ? `${nombre} · ${doctor.correo}` : nombre;
}

/** Texto de D-10b: lo que cambió, y el paso siguiente si quedaba una baja a medias. */
function mensajeReasignados(cantidad: number, origen: string, destino: string, conBaja: boolean): string {
  const movido =
    cantidad === 1
      ? `El caso activo de ${origen} ahora es de ${destino}.`
      : `Los ${cantidad} casos activos de ${origen} ahora son de ${destino}.`;
  return conBaja ? `${movido} Ya puede desactivar o eliminar la cuenta.` : movido;
}

export default function ReasignarCasos({ titulo }: { titulo: string }) {
  const { id = "" } = useParams();
  const navegar = useNavigate();

  /** Doctor cuyos casos se están reasignando. Empieza en el de la URL y se puede cambiar. */
  const [origenId, setOrigenId] = useState(id);
  const [intento, setIntento] = useState(0);
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL);
  const [destinoId, setDestinoId] = useState("");
  const [errorDestino, setErrorDestino] = useState<string | undefined>(undefined);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<AvisoError | null>(null);
  /**
   * Baja que quedó a medias en W-11. Lectura pura en el inicializador: dentro de StrictMode React
   * llama dos veces a esta función, así que no puede borrar nada (ver `reasignacionPendiente.ts`).
   */
  const [baja, setBaja] = useState<BajaPendiente | null>(() => leerBajaPendiente(id));

  const doctores = useDoctoresActivos();

  /**
   * Destino elegido en un intento anterior (el rebote del 409). Se aplica una sola vez, en cuanto
   * la lista de doctores confirma que ese doctor sigue disponible; después la referencia queda
   * vacía, para no volver a ponerlo si el administrador lo cambia a propósito.
   */
  const destinoPrevioRef = useRef(leerBajaPendiente(id)?.destinoId ?? null);

  useEffect(() => {
    const previo = destinoPrevioRef.current;
    if (previo === null) return;
    if (doctores.doctores.some((doctor) => doctor.id === previo && doctor.id !== origenId)) {
      destinoPrevioRef.current = null;
      setDestinoId(previo);
    }
  }, [doctores.doctores, origenId]);

  useEffect(() => {
    let vigente = true;
    setCarga({ fase: "cargando" });
    setErrorAccion(null);

    Promise.all([obtenerUsuario(origenId), listarCasosActivos(origenId)])
      .then(([origen, casos]) => {
        if (vigente) setCarga({ fase: "listo", origen, casos });
      })
      .catch((causa: unknown) => {
        if (!vigente || esErrorGlobal(causa)) return;
        if (causa instanceof ErrorApi && causa.codigo === CodigoErrorApi.NO_ENCONTRADO) {
          setCarga({ fase: "noEncontrado" });
          return;
        }
        setCarga({ fase: "error", aviso: avisoDeError(causa) });
      });

    return () => {
      vigente = false;
    };
  }, [origenId, intento]);

  /**
   * Cambiar el doctor de origen convierte esta pantalla en una reasignación suelta: la baja que
   * venía de W-11 era de otra cuenta, así que se cancela aquí y en la memoria compartida.
   */
  function cambiarOrigen(nuevo: string) {
    if (nuevo === origenId) return;
    if (baja) {
      limpiarBajaPendiente();
      setBaja(null);
    }
    if (destinoId === nuevo) setDestinoId("");
    setErrorDestino(undefined);
    setErrorAccion(null);
    setOrden(ORDEN_INICIAL);
    setOrigenId(nuevo);
  }

  function ordenarPor(columna: ColumnaCasos) {
    setOrden((actual) =>
      actual.columna === columna
        ? { columna, descendente: !actual.descendente }
        : { columna, descendente: columna === "fecha" }
    );
  }

  function volverAlDetalle() {
    navegar(`${RUTA_USUARIOS}/${encodeURIComponent(origenId)}`);
  }

  /** D-10 confirmado. Al terminar bien, D-10b: la notificación la muestra el detalle. */
  async function confirmarReasignacion(origen: UsuarioDetalle, casos: CasosActivosDoctor) {
    const destino = doctores.doctores.find((doctor) => doctor.id === destinoId);
    if (!destino) return;
    setEnviando(true);
    setErrorAccion(null);
    try {
      const { traslado } = await reasignarCasos(origen.id, destino.id);
      const origenNombre = nombreCompleto(origen);
      const destinoNombre = nombreCompleto(destino);
      // La baja sigue pendiente: reasignar no da de baja a nadie. Se guarda el destino elegido
      // para que un segundo rebote del 409 no haga repetir la elección.
      if (baja) dejarBajaPendiente({ ...baja, destinoId: destino.id });
      dejarNotificacion({
        titulo: "Casos reasignados",
        mensaje: mensajeReasignados(traslado.casos_trasladados, origenNombre, destinoNombre, baja !== null),
      });
      navegar(`${RUTA_USUARIOS}/${encodeURIComponent(origen.id)}`);
    } catch (causa: unknown) {
      if (esErrorGlobal(causa)) return;
      setConfirmando(false);
      atenderFalloReasignar(causa, nombreCompleto(origen), casos.total_casos);
    } finally {
      setEnviando(false);
    }
  }

  /** Traduce el fallo: al campo cuando es del destino, a la alerta cuando es de la pantalla. */
  function atenderFalloReasignar(causa: unknown, origenNombre: string, totalCasos: number) {
    if (causa instanceof ErrorApi) {
      if (causa.codigo === CodigoErrorApi.DESTINO_INVALIDO) {
        setErrorDestino("Ese doctor ya no tiene la cuenta activa. Elija otro de la lista actualizada.");
        setDestinoId("");
        doctores.reintentar();
        return;
      }
      if (causa.codigo === CodigoErrorApi.SIN_CASOS_ACTIVOS) {
        setErrorAccion({
          titulo: "Ya no quedan casos que reasignar",
          mensaje: `Los casos de ${origenNombre} se reasignaron desde otra sesión mientras tenía esta pantalla abierta.`,
        });
        setIntento((n) => n + 1);
        return;
      }
      if (causa.codigo === CodigoErrorApi.TRANSICION_INVALIDA) {
        setErrorAccion({
          titulo: "Esta cuenta no tiene casos asignados",
          mensaje: "Solo los doctores tienen casos asignados; esta cuenta ya no es uno de ellos.",
        });
        setIntento((n) => n + 1);
        return;
      }
      if (causa.codigo === CodigoErrorApi.CASOS_INVALIDOS) {
        setErrorAccion({
          titulo: "La lista de casos cambió",
          mensaje: `Alguno de los ${totalCasos} casos dejó de estar activo mientras tenía esta pantalla abierta. Se actualizó la lista.`,
        });
        setIntento((n) => n + 1);
        return;
      }
      if (causa.codigo === CodigoErrorApi.NO_ENCONTRADO) {
        setErrorAccion({
          titulo: "Esta cuenta ya no existe",
          mensaje: "Se eliminó mientras tenía esta pantalla abierta.",
        });
        return;
      }
    }
    setErrorAccion(avisoDeError(causa));
  }

  const origen = carga.fase === "listo" ? carga.origen : null;
  const casos = carga.fase === "listo" ? carga.casos : null;

  const opcionesOrigen = useMemo<Opcion[]>(() => {
    const lista = doctores.doctores.map((doctor) => ({ valor: doctor.id, etiqueta: etiquetaDoctor(doctor) }));
    // El doctor que viene del detalle puede no estar en la lista (una cuenta pendiente o ya
    // inactiva no sale con `estado=ACTIVO`), y es justo el que hay que poder ver elegido.
    if (origen && !lista.some((opcion) => opcion.valor === origen.id)) {
      lista.unshift({ valor: origen.id, etiqueta: etiquetaDoctor(origen) });
    }
    return lista;
  }, [doctores.doctores, origen]);

  const opcionesDestino = useMemo<Opcion[]>(
    () =>
      doctores.doctores
        .filter((doctor) => doctor.id !== origenId)
        .map((doctor) => ({ valor: doctor.id, etiqueta: etiquetaDoctor(doctor) })),
    [doctores.doctores, origenId]
  );

  /** Una fila por análisis, con el orden que pidan los encabezados. */
  const filas = useMemo<AnalisisCasoActivo[]>(() => {
    if (!casos) return [];
    const todos = casos.casos.flatMap((caso) => caso.analisis);
    const signo = orden.descendente ? -1 : 1;
    return [...todos].sort((a, b) =>
      orden.columna === "codigo"
        ? signo * a.codigo.localeCompare(b.codigo, "es")
        : signo * a.solicitado_en.localeCompare(b.solicitado_en)
    );
  }, [casos, orden]);

  const destino = doctores.doctores.find((doctor) => doctor.id === destinoId) ?? null;
  const ordenDe = (columna: ColumnaCasos): OrdenColumna =>
    orden.columna !== columna ? "ninguno" : orden.descendente ? "descendente" : "ascendente";

  function intentarReasignar() {
    if (destinoId === "") {
      setErrorDestino("Elija el doctor que recibirá los casos.");
      return;
    }
    setErrorDestino(undefined);
    setConfirmando(true);
  }

  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Antes de desactivar o eliminar a un doctor, pase sus casos activos a otro doctor activo."
      />

      <div className={estilos.contenido}>
        <Alerta tipo="info" titulo="Los registros anteriores no cambian">
          Los análisis ya generados conservan la referencia al doctor que los hizo, mediante la tabla de
          traslado (RF-A06 CA 5). Solo cambia quién tiene asignado cada caso activo.
        </Alerta>

        {errorAccion && (
          <Alerta tipo="error" titulo={errorAccion.titulo}>
            {errorAccion.mensaje}
          </Alerta>
        )}

        {carga.fase === "cargando" && <EsqueletoPasos />}

        {carga.fase === "error" && (
          <div className={estilos.errorCarga}>
            <Alerta tipo="error" titulo={carga.aviso.titulo}>
              {carga.aviso.mensaje}
            </Alerta>
            <div>
              <Boton jerarquia="secundario" onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </Boton>
            </div>
          </div>
        )}

        {carga.fase === "noEncontrado" && (
          <div className={estilos.tarjetaVacia}>
            <EstadoVacio
              nivelTitulo="h2"
              titulo="Esta cuenta ya no existe"
              mensaje="Se eliminó mientras tenía esta pantalla abierta."
            >
              <EnlaceBoton jerarquia="primario" to={RUTA_USUARIOS}>
                Volver a Usuarios
              </EnlaceBoton>
            </EstadoVacio>
          </div>
        )}

        {origen && casos && origen.rol !== "DOCTOR" && (
          <div className={estilos.tarjetaVacia}>
            <EstadoVacio
              nivelTitulo="h2"
              titulo="Esta cuenta no tiene casos asignados"
              mensaje={`Solo los doctores tienen casos activos, y ${nombreCompleto(origen)} tiene el rol ${origen.rol_nombre}.`}
            >
              <EnlaceBoton jerarquia="primario" to={`${RUTA_USUARIOS}/${encodeURIComponent(origen.id)}`}>
                Volver al detalle
              </EnlaceBoton>
            </EstadoVacio>
          </div>
        )}

        {origen && casos && origen.rol === "DOCTOR" && (
          <div className={estilos.tarjetaPasos}>
            <section className={estilos.paso}>
              <h2 className={estilos.tituloPaso}>1. Doctor de origen</h2>
              <CampoLista
                etiqueta={baja ? "Doctor que será desactivado o eliminado" : "Doctor que tiene los casos"}
                opciones={opcionesOrigen}
                valor={origenId}
                onCambio={cambiarOrigen}
                disabled={enviando}
                ayuda={
                  baja
                    ? "Viene seleccionado desde el detalle de la cuenta. Si elige a otro, esta reasignación deja de ser el paso previo de esa baja."
                    : "Viene seleccionado desde el detalle de la cuenta; se puede cambiar."
                }
                cargando={doctores.cargando}
                textoCargando="Cargando los doctores…"
                error={
                  doctores.error
                    ? {
                        texto: "No se pudieron cargar los doctores. Sin ellos no se puede elegir uno.",
                        nombreAccion: "cargar los doctores",
                        onReintentar: doctores.reintentar,
                      }
                    : undefined
                }
              />
            </section>

            <section className={estilos.paso}>
              <h2 className={estilos.tituloPaso}>
                2. Casos activos de {nombreCompleto(origen)} ({casos.total_casos})
              </h2>
              <p className={estilos.aclaracion}>
                Solo se muestran datos técnicos: sin imágenes, resultados ni datos de pacientes (CA 2).
                {casos.total_analisis !== casos.total_casos &&
                  ` Son ${casos.total_analisis} análisis repartidos en ${casos.total_casos} casos activos, uno por fila.`}
              </p>

              {casos.total_casos === 0 ? (
                // Figma no dibuja este caso. Se dice dentro del paso 2, no como pantalla vacía,
                // para que el paso 1 siga ahí y se pueda elegir a otro doctor.
                <p className={estilos.sinCasos} role="status">
                  {nombreCompleto(origen)} no tiene ningún caso que reasignar. Se puede desactivar o
                  eliminar la cuenta sin este paso.
                </p>
              ) : (
                <TablaCasos
                  filas={filas}
                  nombreOrigen={nombreCompleto(origen)}
                  ordenCodigo={ordenDe("codigo")}
                  ordenFecha={ordenDe("fecha")}
                  alOrdenar={ordenarPor}
                />
              )}
            </section>

            {casos.total_casos === 0 ? (
              <div className={estilos.acciones}>
                <EnlaceBoton jerarquia="primario" to={`${RUTA_USUARIOS}/${encodeURIComponent(origen.id)}`}>
                  Volver al detalle
                </EnlaceBoton>
              </div>
            ) : (
              <>
                <section className={estilos.paso}>
                  <h2 className={estilos.tituloPaso}>3. Doctor de destino</h2>
                  <CampoLista
                    etiqueta="Doctor que recibirá los casos"
                    opciones={opcionesDestino}
                    valor={destinoId}
                    marcador="Elija un doctor"
                    onCambio={(valor) => {
                      setDestinoId(valor);
                      setErrorDestino(undefined);
                    }}
                    disabled={enviando}
                    mensajeError={errorDestino}
                    ayuda={textoAyudaDestino(doctores)}
                    cargando={doctores.cargando}
                    textoCargando="Cargando los doctores…"
                    error={
                      doctores.error
                        ? {
                            texto: "No se pudieron cargar los doctores. Sin ellos no se puede elegir uno.",
                            nombreAccion: "cargar los doctores",
                            onReintentar: doctores.reintentar,
                          }
                        : undefined
                    }
                  />
                </section>

                <div className={estilos.acciones}>
                  <Boton onClick={intentarReasignar} disabled={enviando}>
                    Reasignar {textoCasos(casos.total_casos)}
                    <span className={estilos.soloLector}> de {nombreCompleto(origen)}</span>
                  </Boton>
                  <Boton jerarquia="secundario" onClick={volverAlDetalle} disabled={enviando}>
                    Cancelar
                  </Boton>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* D-10 */}
      {confirmando && origen && casos && destino && (
        <DialogoConfirmacion
          confirmarEsPrimario
          titulo={`¿Reasignar ${textoCasos(casos.total_casos)} a ${nombreCompleto(destino)}?`}
          mensaje={
            `Los casos activos de ${nombreCompleto(origen)} pasarán a ${nombreCompleto(destino)}. ` +
            `Los registros históricos conservan la referencia a ${nombreCompleto(origen)}. ` +
            "Quedará registrado en la bitácora."
          }
          etiquetaConfirmar="Reasignar casos"
          etiquetaCancelar="Cancelar"
          enviando={enviando}
          etiquetaEnviando="Reasignando…"
          onConfirmar={() => void confirmarReasignacion(origen, casos)}
          onCancelar={() => setConfirmando(false)}
        />
      )}
    </>
  );
}

/** Doctores con cuenta activa, para los dos desplegables. */
interface EstadoDoctores {
  doctores: UsuarioResumen[];
  /** Hay más doctores activos de los que cabe pedir en una página (tope del servidor). */
  incompleta: boolean;
  cargando: boolean;
  error: boolean;
  reintentar: () => void;
}

/**
 * Pide los doctores activos una sola vez, **sin excluir a nadie**: el paso 1 necesita la lista
 * completa (el origen está en ella) y el paso 3 es esa misma lista menos el origen, que se
 * calcula aquí. Así cambiar el doctor de origen no vuelve a salir a la red.
 *
 * Mismo patrón que `useRoles`: un 401 o un 403 ya los atienden los manejadores globales.
 */
function useDoctoresActivos(): EstadoDoctores {
  const [doctores, setDoctores] = useState<UsuarioResumen[]>([]);
  const [incompleta, setIncompleta] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(false);
    listarDoctoresActivos()
      .then((pagina) => {
        if (!vigente) return;
        setDoctores(pagina.items);
        setIncompleta(pagina.paginacion.total > pagina.items.length);
      })
      .catch((causa: unknown) => {
        if (vigente && !esErrorGlobal(causa)) setError(true);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [intento]);

  return { doctores, incompleta, cargando, error, reintentar: () => setIntento((n) => n + 1) };
}

function textoAyudaDestino(doctores: EstadoDoctores): string {
  const base = "Solo aparecen doctores con cuenta activa, distintos del doctor de origen (CA 3).";
  return doctores.incompleta
    ? `${base} Hay más de los que caben en la lista: solo se muestran los primeros ${doctores.doctores.length}.`
    : base;
}

/** Carga: la forma de la tarjeta de pasos, sin inventar contenido. */
function EsqueletoPasos() {
  return (
    <div className={estilos.tarjetaPasos} aria-busy="true">
      <p className={estilos.soloLector} role="status">
        Cargando los casos activos…
      </p>
      <div className={estilos.marcoTabla} aria-hidden="true">
        {Array.from({ length: FILAS_ESQUELETO }, (_, indice) => (
          <Esqueleto key={indice} forma="fila-tabla" />
        ))}
      </div>
    </div>
  );
}

interface PropiedadesTablaCasos {
  filas: AnalisisCasoActivo[];
  nombreOrigen: string;
  ordenCodigo: OrdenColumna;
  ordenFecha: OrdenColumna;
  alOrdenar: (columna: ColumnaCasos) => void;
}

/**
 * Una fila por análisis: su código y cuándo se solicitó. Nada más sale del servidor, y nada más
 * debe salir (RF-A06 CA 2).
 */
function TablaCasos({ filas, nombreOrigen, ordenCodigo, ordenFecha, alOrdenar }: PropiedadesTablaCasos) {
  return (
    <div className={estilos.marcoTabla}>
      <table className={estilos.tabla}>
        <caption className={estilos.soloLector}>Casos activos de {nombreOrigen}</caption>
        <thead>
          <tr>
            <EncabezadoTabla
              columna="ID de análisis"
              orden={ordenCodigo}
              onOrdenar={() => alOrdenar("codigo")}
              className={estilos.columnaCodigo}
            />
            <EncabezadoTabla
              columna="Fecha"
              orden={ordenFecha}
              onOrdenar={() => alOrdenar("fecha")}
              className={estilos.columnaFecha}
            />
          </tr>
        </thead>
        <tbody>
          {filas.map((analisis) => (
            <tr key={analisis.id}>
              <th scope="row" className={estilos.celdaCodigo}>
                {analisis.codigo}
              </th>
              <td className={estilos.celdaFecha}>{fechaHoraCorta(analisis.solicitado_en)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
