// Pantalla W-27 · Casos recibidos por traslado (Figma 79:5652 a 98:8408, y M-27 en celular).
// Solo rol DOCTOR.
//
// La bandeja viene **agrupada por traslado**: un bloque por evento, el más reciente primero
// (RF-A07 CA 1), no una lista plana de análisis. Nunca se dice qué administrador hizo el
// traslado ni se muestra el seudónimo del paciente (CA 7): el contrato no los entrega.
//
// **El documento del paciente no toca la URL.** Vive en el estado del buscador, viaja en el
// cuerpo del POST y, para abrir el historial con la búsqueda hecha, se entrega por memoria de
// módulo (CLAUDE.md § 6). La URL de esta pantalla no lleva nada: tampoco el filtro, para que
// no haga falta pensar dos veces qué puede quedar escrito en ella.
//
// **El contador del menú.** `casos_recibidos_nuevos` solo se refresca con `GET /auth/sesion`,
// y abrir un traslado no toca la sesión: sin esto la insignia diría «2» con la bandeja ya
// revisada. El hook sincroniza el contador del contexto con el `nuevos` del servidor en cada
// carga y lo descuenta en cada «visto». El resumen de abajo lee ese mismo número, así que el
// menú y la pantalla no pueden contradecirse.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoLista from "../components/CampoLista";
import CampoTexto from "../components/CampoTexto";
import EncabezadoPagina from "../components/EncabezadoPagina";
import EstadoVacio from "../components/EstadoVacio";
import { ANALISIS_POR_BLOQUE } from "../services/casosRecibidos";
import { obtenerTiposDocumento } from "../services/catalogos";
import { useUsuarioActual } from "../sesion/UsuarioActual";
import type { BandejaRecibidos, TipoDocumento } from "../types";
import { esErrorGlobal } from "../utils/avisosError";
import { dejarBusquedaParaHistorial } from "../utils/busquedaPacienteEnMemoria";
import BloqueTraslado from "./BloqueTraslado";
import { EsqueletoCasosRecibidos, nombreDeOrigen } from "./TablaCasosRecibidos";
import { useBandejaRecibidos } from "./useBandejaRecibidos";
import estilos from "./CasosRecibidos.module.css";

const DESCRIPCION =
  "Casos que un administrador le reasignó desde otros doctores. Se agrupan por traslado.";

function plural(cantidad: number, singular: string, plural_: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural_}`;
}

export default function CasosRecibidos({ titulo }: { titulo: string }) {
  const navegar = useNavigate();
  const { casosSinRevisar } = useUsuarioActual();
  const {
    bandeja,
    cargando,
    mostrarEsqueleto,
    aviso,
    recargar,
    origenId,
    cambiarOrigen,
    busqueda,
    buscar,
    limpiarBusqueda,
    errorDocumento,
    limpiarErrorDocumento,
    abiertos,
    alternarBloque,
    completos,
    verTodos,
    totalDelTraslado,
  } = useBandejaRecibidos();

  // Catálogo de tipos de documento, con sus tres estados, igual que en W-16.
  const [tipos, setTipos] = useState<TipoDocumento[] | null>(null);
  const [errorTipos, setErrorTipos] = useState(false);
  const [intentoTipos, setIntentoTipos] = useState(0);

  const [tipo, setTipo] = useState("");
  const [numero, setNumero] = useState("");
  const [errorNumero, setErrorNumero] = useState<string | undefined>();

  const resultadosRef = useRef<HTMLDivElement>(null);
  const enfocarResultadosRef = useRef(false);

  useEffect(() => {
    let vigente = true;
    setErrorTipos(false);
    obtenerTiposDocumento()
      .then((items) => {
        if (vigente) setTipos(items);
      })
      .catch((causa: unknown) => {
        if (!vigente || esErrorGlobal(causa)) return;
        setErrorTipos(true);
      });
    return () => {
      vigente = false;
    };
  }, [intentoTipos]);

  // El tipo arranca en el primero de la lista, como un `<select>` nativo.
  useEffect(() => {
    if (tipo === "" && tipos && tipos.length > 0) setTipo(tipos[0].codigo);
  }, [tipos, tipo]);

  useEffect(() => {
    if (!cargando && enfocarResultadosRef.current) {
      enfocarResultadosRef.current = false;
      resultadosRef.current?.focus();
    }
  }, [cargando]);

  const maximo = tipos?.find((t) => t.codigo === tipo)?.longitud_maxima;

  function enviarBusqueda(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpio = numero.trim();
    if (limpio === "") {
      setErrorNumero("Escriba el número de documento del paciente.");
      return;
    }
    setErrorNumero(undefined);
    enfocarResultadosRef.current = true;
    buscar({ tipo_documento: tipo, numero_documento: limpio });
  }

  function limpiar() {
    setNumero("");
    setErrorNumero(undefined);
    limpiarBusqueda();
  }

  /** Abre W-16 con el tipo y el número ya escritos, sin pasarlos por la URL (WCAG 3.3.7). */
  function irAlHistorial() {
    if (busqueda) {
      dejarBusquedaParaHistorial({
        tipo_documento: busqueda.tipo_documento,
        numero_documento: busqueda.numero_documento,
      });
    }
    navegar("/historial?pestana=paciente");
  }

  // El error del servidor por el documento se pinta en el campo, no en una alerta.
  const mensajeNumero = errorNumero ?? errorDocumento;

  // W-27a: nunca ha recibido nada. Sin buscador, sin filtro y sin botón: no hay nada que
  // buscar y el doctor no puede pedir traslados.
  const bandejaSinNada =
    bandeja !== null && busqueda === null && origenId === "" && bandeja.total_traslados === 0;

  const hayBarra = bandeja !== null && !bandejaSinNada;
  // El filtro aparece cuando hay más de un doctor de origen (W-27c); con uno solo no filtra nada.
  const hayFiltro = (bandeja?.doctores_origen.length ?? 0) > 1;

  return (
    <>
      <EncabezadoPagina titulo={titulo} descripcion={DESCRIPCION} />

      {hayBarra && (
        <div className={estilos.barra}>
          <form className={estilos.buscador} onSubmit={enviarBusqueda} noValidate>
            <CampoLista
              etiqueta="Tipo de documento"
              opciones={(tipos ?? []).map((t) => ({ valor: t.codigo, etiqueta: t.nombre }))}
              valor={tipo}
              onCambio={setTipo}
              cargando={tipos === null && !errorTipos}
              textoCargando="Cargando los tipos de documento…"
              error={
                errorTipos
                  ? {
                      texto: "No se pudieron cargar los tipos de documento.",
                      nombreAccion: "cargar los tipos de documento",
                      onReintentar: () => setIntentoTipos((n) => n + 1),
                    }
                  : undefined
              }
            />
            <CampoTexto
              etiqueta="Número de documento"
              value={numero}
              onChange={(evento) => {
                setNumero(evento.target.value);
                setErrorNumero(undefined);
                limpiarErrorDocumento();
              }}
              mensajeError={mensajeNumero}
              ayuda="Busca solo entre sus casos recibidos. El número de documento no se guarda."
              placeholder="Ej.: 1144567890"
              inputMode="numeric"
              maxLength={maximo}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            <div className={estilos.acciones}>
              <Boton
                type="submit"
                jerarquia="primario"
                cargando={cargando && busqueda !== null}
                etiquetaCargando="Buscando…"
              >
                Buscar
              </Boton>
              {busqueda !== null && (
                <Boton jerarquia="terciario" onClick={limpiar}>
                  Limpiar búsqueda
                </Boton>
              )}
            </div>
          </form>

          {hayFiltro && (
            <div className={estilos.filtro}>
              <CampoLista
                etiqueta="Doctor de origen"
                marcador="Todos los doctores"
                opciones={(bandeja?.doctores_origen ?? []).map((doctor) => ({
                  valor: doctor.id,
                  etiqueta: nombreDeOrigen(doctor),
                }))}
                valor={origenId}
                onCambio={cambiarOrigen}
              />
            </div>
          )}
        </div>
      )}

      {aviso && (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={aviso.titulo}>
            {aviso.mensaje}
          </Alerta>
          <div>
            <Boton jerarquia="secundario" onClick={recargar}>
              Reintentar
            </Boton>
          </div>
        </div>
      )}

      <div
        ref={resultadosRef}
        tabIndex={-1}
        className={estilos.resultados}
        aria-busy={cargando || undefined}
      >
        {mostrarEsqueleto && (
          <div className={estilos.esqueleto}>
            <p className={estilos.soloLector} role="status">
              Cargando los casos recibidos…
            </p>
            <EsqueletoCasosRecibidos />
          </div>
        )}

        {!mostrarEsqueleto && !aviso && bandeja !== null && (
          <Contenido
            bandeja={bandeja}
            bandejaSinNada={bandejaSinNada}
            busqueda={busqueda !== null}
            origenId={origenId}
            casosSinRevisar={casosSinRevisar}
            abiertos={abiertos}
            alternarBloque={alternarBloque}
            completos={completos}
            verTodos={verTodos}
            totalDelTraslado={totalDelTraslado}
            onQuitarFiltro={() => cambiarOrigen("")}
            onIrAlHistorial={irAlHistorial}
          />
        )}
      </div>
    </>
  );
}

interface PropiedadesContenido {
  bandeja: BandejaRecibidos;
  bandejaSinNada: boolean;
  busqueda: boolean;
  origenId: string;
  casosSinRevisar: number;
  abiertos: ReadonlySet<string>;
  alternarBloque: (id: string) => void;
  completos: ReadonlySet<string>;
  verTodos: (id: string) => void;
  totalDelTraslado: (id: string) => number | null;
  onQuitarFiltro: () => void;
  onIrAlHistorial: () => void;
}

function Contenido({
  bandeja,
  bandejaSinNada,
  busqueda,
  origenId,
  casosSinRevisar,
  abiertos,
  alternarBloque,
  completos,
  verTodos,
  totalDelTraslado,
  onQuitarFiltro,
  onIrAlHistorial,
}: PropiedadesContenido) {
  // W-27a · nunca ha recibido casos. Es el estado más común: la mayoría de los doctores no
  // recibirá ninguno.
  if (bandejaSinNada) {
    return (
      <EstadoVacio
        nivelTitulo="h2"
        titulo="Aún no ha recibido casos por traslado"
        mensaje="Cuando un administrador le reasigne casos de otro doctor, aparecerán aquí, agrupados por traslado y con el doctor de origen."
      />
    );
  }

  // W-27g · la búsqueda no encontró nada. El texto no deja deducir si el paciente existe ni
  // si lo atiende otro doctor: el servidor devuelve este mismo vacío en los tres casos
  // (RF-A07 CA 8, RF-H01 CA 5).
  if (busqueda && bandeja.total_traslados === 0) {
    return (
      <>
        <p className={estilos.resumen} role="status">
          Resultados para el documento ingresado: ningún caso recibido
        </p>
        <EstadoVacio
          nivelTitulo="h2"
          titulo="Este paciente no tiene casos recibidos por traslado"
          mensaje="Revise el número. Si usted ha atendido a este paciente, sus análisis están en Historial."
        >
          <Boton jerarquia="primario" onClick={onIrAlHistorial}>
            Buscar en Historial
          </Boton>
        </EstadoVacio>
      </>
    );
  }

  // El filtro por doctor de origen sin resultados. No está dibujado en Figma (CR-4): se dice
  // lo que pasa y se deja a mano la forma de deshacerlo, sin inventar una pantalla.
  if (!busqueda && origenId !== "" && bandeja.total_traslados === 0) {
    return (
      <>
        <p className={estilos.resumen} role="status">
          Ningún caso recibido de ese doctor.
        </p>
        <div>
          <Boton jerarquia="secundario" onClick={onQuitarFiltro}>
            Ver todos los doctores
          </Boton>
        </div>
      </>
    );
  }

  const resumen = busqueda
    ? `Resultados para el documento ingresado: ${plural(bandeja.total_casos, "caso", "casos")} en ${plural(bandeja.total_traslados, "traslado", "traslados")}`
    : `${plural(bandeja.total_casos, "caso recibido", "casos recibidos")} en ${plural(bandeja.total_traslados, "traslado", "traslados")}${
        casosSinRevisar > 0 ? ` · ${casosSinRevisar} sin revisar` : ""
      }`;

  return (
    <>
      <p className={estilos.resumen} role="status">
        {resumen}
      </p>

      {/* El aviso de W-27e y W-27f: lo que se ve aquí es solo lo recibido por traslado, para
          que una historia parcial no parezca completa. Dos variantes según si el doctor tiene
          análisis propios de ese paciente. */}
      {busqueda && bandeja.analisis_propios_paciente !== null && (
        <div className={estilos.avisoHistorial}>
          <Alerta tipo="info" titulo="Estos son solo los casos recibidos por traslado">
            {bandeja.analisis_propios_paciente > 0
              ? `Este paciente también tiene ${plural(bandeja.analisis_propios_paciente, "análisis suyo", "análisis suyos")}. Para ver su historia completa (propios y recibidos), abra su historial.`
              : "Este paciente no tiene análisis suyos todavía. Su historial completo muestra estos mismos casos en orden cronológico."}
          </Alerta>
          <div className={estilos.accionAviso}>
            <Boton jerarquia="secundario" onClick={onIrAlHistorial}>
              Ver historial completo del paciente
            </Boton>
          </div>
        </div>
      )}

      <ul className={estilos.bloques}>
        {bandeja.traslados.map((traslado) => {
          // En la búsqueda se muestra todo lo del paciente (la petición va sin límite); en la
          // bandeja, las primeras filas hasta que se pida «Ver los N análisis».
          const completo = busqueda || completos.has(traslado.id);
          const filas = completo
            ? traslado.analisis
            : traslado.analisis.slice(0, ANALISIS_POR_BLOQUE);
          return (
            <BloqueTraslado
              key={traslado.id}
              traslado={traslado}
              abierto={abiertos.has(traslado.id)}
              onAlternar={() => alternarBloque(traslado.id)}
              filas={filas}
              hayMas={!completo && traslado.analisis_total > filas.length}
              onVerTodos={() => verTodos(traslado.id)}
              totalEnElTraslado={busqueda ? totalDelTraslado(traslado.id) : null}
            />
          );
        })}
      </ul>
    </>
  );
}
