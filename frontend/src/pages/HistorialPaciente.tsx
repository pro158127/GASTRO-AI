// Pestaña «Buscar por paciente» de W-16 (Figma 63:3389), con W-16e (antes de buscar,
// 81:7871) y W-16b (sin resultados, 63:3760).
//
// **Nada de esta pestaña va a la URL.** El documento del paciente solo vive en el estado de
// este componente (CLAUDE.md § 6) y, para sobrevivir a la ida y vuelta al detalle, en
// memoria de módulo: ver `src/utils/busquedaPacienteEnMemoria.ts`, que explica cuándo se
// borra y por qué no puede ser al desmontar.
//
// **La trampa de privacidad de esta pantalla.** Un paciente ajeno o inexistente responde
// 200 con `items: []`, no 404 (RF-H01 CA 5). El mismo vacío lo devuelven un paciente que no
// existe, uno de otro doctor y uno sin análisis, así que el texto no puede decir «ese
// paciente no existe» ni nada que deje deducirlo: solo que no hay análisis suyos **con
// usted**.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigationType } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoLista from "../components/CampoLista";
import CampoTexto from "../components/CampoTexto";
import ControlesPaginacion from "../components/ControlesPaginacion";
import EnlaceBoton from "../components/EnlaceBoton";
import EstadoVacio from "../components/EstadoVacio";
import { obtenerTiposDocumento } from "../services/catalogos";
import { ANALISIS_POR_PAGINA, buscarAnalisisDePaciente } from "../services/historial";
import type { BusquedaPaciente } from "../services/historial";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import type { OrdenHistorial, TipoDocumento } from "../types";
import {
  guardarBusquedaParaVolver,
  leerBusquedaEntregada,
  leerBusquedaGuardada,
  limpiarBusquedaEntregada,
  limpiarBusquedaGuardada,
} from "../utils/busquedaPacienteEnMemoria";
import { esErrorGlobal } from "../utils/avisosError";
import TablaHistorial, { EsqueletoHistorial } from "./TablaHistorial";
import { useHistorial } from "./useHistorial";
import estilos from "./Historial.module.css";

/** «3 análisis · del más antiguo al más reciente». */
function textoResumen(
  total: number,
  mostrados: number,
  pagina: number,
  orden: OrdenHistorial
): string {
  const sentido =
    orden === "solicitado_en" ? "del más antiguo al más reciente" : "del más reciente al más antiguo";
  if (total === 0) return `0 análisis · ${sentido}`;
  const desde = (pagina - 1) * ANALISIS_POR_PAGINA + 1;
  const hasta = desde + mostrados - 1;
  const rango = total <= ANALISIS_POR_PAGINA ? `${total} análisis` : `${desde}–${hasta} de ${total} análisis`;
  return `${rango} · ${sentido}`;
}

export default function HistorialPaciente() {
  const tipoNavegacion = useNavigationType();

  // Lectura pura en el inicializador: StrictMode lo llama dos veces y eso tiene que dar
  // igual. Dos huecos de memoria, excluyentes por tipo de navegación: al volver hacia atrás
  // se restaura la búsqueda que quedó al ir al detalle; en un PUSH, la que W-27 acaba de
  // entregar con «Ver historial completo del paciente». Entrar desde el menú también es un
  // PUSH, pero entonces el hueco está vacío porque el efecto de abajo lo vació la vez
  // anterior (ver el módulo de la memoria).
  const [guardada] = useState(() =>
    tipoNavegacion === "POP" ? leerBusquedaGuardada() : leerBusquedaEntregada()
  );

  // El borrado va aparte del leer, y corre en TODO montaje: así los dos huecos quedan vacíos
  // en cuanto el historial vuelve a abrirse, se haya restaurado algo o no.
  useEffect(() => {
    limpiarBusquedaGuardada();
    limpiarBusquedaEntregada();
  }, []);

  const [tipos, setTipos] = useState<TipoDocumento[] | null>(null);
  const [errorTipos, setErrorTipos] = useState(false);
  const [intentoTipos, setIntentoTipos] = useState(0);

  const [tipo, setTipo] = useState(guardada?.tipo_documento ?? "");
  const [numero, setNumero] = useState(guardada?.numero_documento ?? "");
  const [errorNumero, setErrorNumero] = useState<string | undefined>();

  /** La búsqueda que se está mostrando. `null` = todavía no se ha buscado nada (W-16e). */
  const [busqueda, setBusqueda] = useState<BusquedaPaciente | null>(guardada);
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState<OrdenHistorial>("solicitado_en");

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

  const consultar = useCallback(() => {
    // `activa` impide que esto corra sin búsqueda; el `throw` es solo para el tipo.
    if (busqueda === null) throw new Error("No hay búsqueda");
    return buscarAnalisisDePaciente(busqueda, { pagina, orden });
  }, [busqueda, pagina, orden]);

  /**
   * El 422 DOCUMENTO_INVALIDO se queda aquí y se pinta **en el campo**, con su icono y su
   * texto, sin borrar lo escrito (CLAUDE.md § 5). Es el único error de esta pestaña que
   * tiene un sitio mejor que una alerta suelta.
   */
  const atender = useCallback((causa: unknown) => {
    if (!(causa instanceof ErrorApi) || causa.codigo !== CodigoErrorApi.DOCUMENTO_INVALIDO) {
      return false;
    }
    const esDelNumero = causa.campos.some((campo) => campo.campo === "numero_documento");
    setErrorNumero(
      esDelNumero
        ? "Revise el número: no tiene el formato de ese tipo de documento."
        : "Revise el tipo y el número de documento."
    );
    // Se vuelve al estado «todavía no se ha buscado»: con el documento mal escrito no hay
    // resultados que mostrar, y dejar la tarjeta de resultados vacía parecería que el
    // paciente no tiene análisis, que es justo lo que no se puede insinuar.
    setBusqueda(null);
    return true;
  }, []);

  const {
    pagina: resultado,
    cargando,
    mostrarEsqueleto,
    error,
    reintentar,
  } = useHistorial(consultar, { activa: busqueda !== null, alFallar: atender });

  useEffect(() => {
    if (!cargando && enfocarResultadosRef.current) {
      enfocarResultadosRef.current = false;
      resultadosRef.current?.focus();
    }
  }, [cargando]);

  const maximo = tipos?.find((t) => t.codigo === tipo)?.longitud_maxima;

  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpio = numero.trim();
    if (limpio === "") {
      setErrorNumero("Escriba el número de documento del paciente.");
      return;
    }
    setErrorNumero(undefined);
    setPagina(1);
    setBusqueda({ tipo_documento: tipo, numero_documento: limpio });
  }

  function irAPagina(nueva: number) {
    enfocarResultadosRef.current = true;
    setPagina(nueva);
  }

  /** Antes de abrir un detalle se deja la búsqueda, para poder volver con «atrás». */
  function alIrAlDetalle() {
    if (busqueda !== null) guardarBusquedaParaVolver(busqueda);
  }

  const filas = resultado?.items ?? [];
  const listo = busqueda !== null && !error && !mostrarEsqueleto && resultado !== null;

  return (
    <>
      <form className={estilos.buscadorPaciente} onSubmit={buscar} noValidate>
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
          }}
          mensajeError={errorNumero}
          ayuda="Solo números, sin puntos ni espacios."
          inputMode="numeric"
          maxLength={maximo}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <div className={estilos.accionFiltros}>
          <Boton type="submit" jerarquia="primario" cargando={cargando} etiquetaCargando="Buscando…">
            Buscar
          </Boton>
        </div>
      </form>

      {/* W-16e · todavía no se ha buscado. Sin TOPOLOGO: no es un vacío, es el punto de
          partida, y lo dice la nota de la pantalla. */}
      {busqueda === null && (
        <p className={estilos.indicacion}>
          Escriba el tipo y el número de documento del paciente para ver sus análisis con usted.
          El número solo se usa para buscar y no se guarda.
        </p>
      )}

      {error && (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={error.titulo}>
            {error.mensaje}
          </Alerta>
          <div>
            <Boton jerarquia="secundario" onClick={reintentar}>
              Reintentar
            </Boton>
          </div>
        </div>
      )}

      {busqueda !== null && !error && (
        <section className={estilos.tarjetaLista} aria-labelledby="titulo-paciente">
          <div className={estilos.cabeceraLista}>
            <h2 id="titulo-paciente" className={estilos.tituloLista}>
              Análisis de este paciente
            </h2>
            {listo && filas.length > 0 && (
              <div className={estilos.accionesLista}>
                <EnlaceBoton jerarquia="secundario" to="/nuevo-analisis">
                  Nuevo análisis para este paciente
                </EnlaceBoton>
              </div>
            )}
          </div>

          <div
            ref={resultadosRef}
            tabIndex={-1}
            className={estilos.resultados}
            aria-busy={cargando || undefined}
          >
            {mostrarEsqueleto && <EsqueletoHistorial />}

            {listo && filas.length > 0 && (
              <TablaHistorial
                filas={filas}
                titulo="Análisis de este paciente"
                orden={orden}
                onCambiarOrden={(nuevo) => {
                  setOrden(nuevo);
                  setPagina(1);
                }}
                onIrAlDetalle={alIrAlDetalle}
              />
            )}

            {/* W-16b · sin resultados. El texto no deja deducir si el paciente existe ni si
                lo atiende otro doctor: el servidor devuelve este mismo vacío en los tres
                casos (RF-H01 CA 5). */}
            {listo && filas.length === 0 && (
              <EstadoVacio
                nivelTitulo="h3"
                titulo="No hay análisis de este paciente con usted"
                mensaje="Revise el tipo y el número de documento, o solicite un análisis nuevo."
              >
                <EnlaceBoton jerarquia="primario" to="/nuevo-analisis">
                  Nuevo análisis
                </EnlaceBoton>
              </EstadoVacio>
            )}
          </div>

          {listo && filas.length > 0 && (
            <>
              <div className={estilos.pieLista}>
                <p className={estilos.resumen} role="status">
                  {textoResumen(
                    resultado.paginacion.total,
                    filas.length,
                    resultado.paginacion.pagina,
                    orden
                  )}
                </p>
                {resultado.paginacion.total > ANALISIS_POR_PAGINA && (
                  <ControlesPaginacion
                    paginacion={resultado.paginacion}
                    cargando={cargando}
                    onIrAPagina={irAPagina}
                  />
                )}
              </div>
              <p className={estilos.notaLista}>
                Cada entrada abre el detalle con la imagen, el mapa de calor, el resultado, la
                confianza, el modelo usado y su valoración (RF-H01, RNF-25).
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}
