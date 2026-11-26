// Pantalla W-21 · Bitácora (Figma 70:5771), con W-21b · filtrando (101:2230). Solo rol
// ADMINISTRADOR. RF-A02, RNF-05.
//
// **Los filtros viven en la query string**, como en W-16: ninguno es un dato personal —un
// código de acción, un id de usuario, un resultado y dos fechas— y así una bitácora filtrada se
// puede recargar, compartir con el otro administrador y recuperar con «atrás». (W-24, la
// pantalla de logs técnicos, usa estado local; es una inconsistencia conocida del proyecto y no
// el patrón a seguir.)
//
// **Dos llamadas, no una.** Las opciones de los dos desplegables se piden una sola vez al
// montar (`GET /admin/bitacora/filtros`); la página se pide cada vez que cambian los filtros o
// la página (`GET /admin/bitacora`). Son cosas distintas y no se piden juntas.
//
// **Ninguna es pasiva**: las pide la persona al entrar o al filtrar.
//
// El ciclo de carga de la lista es `useHistorial`, el mismo molde que W-16: lista paginada con
// filtros, con la guarda de respuestas tardías, el esqueleto de dos tiempos que dibuja W-21b y
// el gancho `alFallar` donde se atiende el 422 del período.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoLista from "../components/CampoLista";
import CampoTexto from "../components/CampoTexto";
import ControlesPaginacion from "../components/ControlesPaginacion";
import EncabezadoPagina from "../components/EncabezadoPagina";
import EstadoVacio from "../components/EstadoVacio";
import IconoCandado from "../components/iconos/IconoCandado";
import type { Opcion } from "../components/CampoOpciones";
import {
  EVENTOS_POR_PAGINA,
  FILTRO_INICIAL,
  hayFiltros,
  listarBitacora,
  obtenerFiltrosBitacora,
} from "../services/bitacora";
import type { FiltroBitacora } from "../services/bitacora";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import type { FiltrosBitacora, ResultadoBitacora } from "../types";
import { esErrorGlobal } from "../utils/avisosError";
import { nombreDeOrigen } from "./TablaCasosRecibidos";
import TablaBitacora, { EsqueletoBitacora, SENTIDO_ORDEN } from "./TablaBitacora";
import { useHistorial } from "./useHistorial";
import estilos from "./Bitacora.module.css";

const RESULTADOS: readonly { valor: ResultadoBitacora; etiqueta: string }[] = [
  { valor: "EXITO", etiqueta: "Correctos" },
  { valor: "FALLO", etiqueta: "Fallidos" },
];

function esResultado(valor: string): valor is ResultadoBitacora {
  return valor === "EXITO" || valor === "FALLO";
}

/** Lee el filtro de la URL. Lo que no se entienda cae en el valor inicial, sin romper nada. */
function filtroDesdeUrl(parametros: URLSearchParams): FiltroBitacora {
  const pagina = Number.parseInt(parametros.get("pagina") ?? "", 10);
  const resultado = parametros.get("resultado") ?? "";
  return {
    pagina: Number.isInteger(pagina) && pagina >= 1 ? pagina : 1,
    accion: parametros.get("accion") ?? "",
    actorId: parametros.get("actor") ?? "",
    resultado: esResultado(resultado) ? resultado : "",
    desde: parametros.get("desde") ?? "",
    hasta: parametros.get("hasta") ?? "",
  };
}

/** «Mostrando 1–8 de 245 eventos · del más reciente al más antiguo». */
function textoResumen(total: number, mostrados: number, pagina: number): string {
  if (mostrados === 0) return `0 eventos con esos filtros`;
  const desde = (pagina - 1) * EVENTOS_POR_PAGINA + 1;
  const hasta = desde + mostrados - 1;
  const rango = desde === hasta ? `${desde}` : `${desde}–${hasta}`;
  return `Mostrando ${rango} de ${total} eventos · ${SENTIDO_ORDEN}`;
}

/** Opciones del desplegable «Tipo de evento»: el texto lo redacta el servidor. */
function opcionesDeAcciones(filtros: FiltrosBitacora | null): Opcion[] {
  return (filtros?.acciones ?? []).map((accion) => ({
    valor: accion.codigo,
    etiqueta: accion.texto,
  }));
}

/**
 * Opciones del desplegable «Usuario».
 *
 * `GET /admin/bitacora/filtros` manda el nombre **ya compuesto** («Ana Pérez») y **sin
 * `apellido`**, al revés que el `actor` de cada fila. Aun así se reutiliza `nombreDeOrigen`
 * pasando el apellido vacío: su `.trim()` absorbe el hueco y así «(cuenta eliminada)» (RF-A07
 * CA 4) sigue escrito en un solo sitio del proyecto, en vez de en una quinta copia aquí.
 */
function opcionesDeUsuarios(filtros: FiltrosBitacora | null): Opcion[] {
  return (filtros?.usuarios ?? []).map((usuario) => ({
    valor: usuario.id,
    etiqueta: nombreDeOrigen({
      nombre: usuario.nombre,
      apellido: "",
      cuenta_eliminada: usuario.cuenta_eliminada,
    }),
  }));
}

/**
 * Carga única de las opciones de los dos desplegables. No es `useHistorial`: no hay páginas ni
 * filtros, es un catálogo que se pide al montar y ya. El fallo no tumba la pantalla: cada
 * `CampoLista` muestra su propio estado de error con «Reintentar», y la lista de eventos se
 * sigue viendo sin filtrar.
 */
function useFiltrosBitacora() {
  const [filtros, setFiltros] = useState<FiltrosBitacora | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setFallo(false);
    obtenerFiltrosBitacora()
      .then((respuesta) => {
        if (vigente) setFiltros(respuesta);
      })
      .catch((causa: unknown) => {
        // Los globales (401, 403) no se pintan: el proveedor de sesión ya está llevando a
        // otra pantalla.
        if (vigente && !esErrorGlobal(causa)) setFallo(true);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { filtros, cargando, fallo, reintentar };
}

export default function Bitacora({ titulo }: { titulo: string }) {
  const [parametros, setParametros] = useSearchParams();
  const filtro = filtroDesdeUrl(parametros);
  const filtrado = hayFiltros(filtro);

  // Lo elegido en los cinco controles antes de pulsar «Aplicar filtros». Figma dibuja un solo
  // botón para los cinco, así que ninguno filtra por su cuenta.
  const [accionElegida, setAccionElegida] = useState(filtro.accion);
  const [usuarioElegido, setUsuarioElegido] = useState(filtro.actorId);
  const [resultadoElegido, setResultadoElegido] = useState<"" | ResultadoBitacora>(filtro.resultado);
  const [desdeEscrito, setDesdeEscrito] = useState(filtro.desde);
  const [hastaEscrito, setHastaEscrito] = useState(filtro.hasta);

  /**
   * Mensajes de error por campo del 422 RANGO_FECHAS_INVALIDO. **El servidor dice qué campo
   * está mal y qué decir** (`campos: [{campo, mensaje}]`), así que no se codifica «desde» a
   * mano: se recorre `campos` y cada mensaje va a su campo. Si mañana el servidor señala otro,
   * esto sigue funcionando.
   */
  const [erroresCampos, setErroresCampos] = useState<Record<string, string>>({});

  const catalogos = useFiltrosBitacora();

  const resultadosRef = useRef<HTMLDivElement>(null);
  const enfocarResultadosRef = useRef(false);

  // La consulta tiene que ser estable o el efecto del hook se repetiría en cada render.
  const consultar = useCallback(
    () => listarBitacora(filtro),
    // Las piezas del filtro, no el objeto: `filtroDesdeUrl` crea uno nuevo en cada render.
    [filtro.pagina, filtro.accion, filtro.actorId, filtro.resultado, filtro.desde, filtro.hasta]
  );

  /**
   * El 422 del período no es una alerta suelta: es un error de un campo del formulario, y se
   * pinta ahí sin borrar lo escrito. Devolver `true` significa «ya lo atendí».
   */
  const alFallar = useCallback((causa: unknown): boolean => {
    if (!(causa instanceof ErrorApi)) return false;
    if (causa.codigo !== CodigoErrorApi.RANGO_FECHAS_INVALIDO) return false;
    const mensajes: Record<string, string> = {};
    for (const campo of causa.campos) mensajes[campo.campo] = campo.mensaje;
    setErroresCampos(mensajes);
    return true;
  }, []);

  const { pagina, cargando, mostrarEsqueleto, error, reintentar } = useHistorial(consultar, {
    alFallar,
  });

  // Tras cambiar de página el foco va a la lista nueva: el botón pulsado puede quedar
  // deshabilitado al llegar al extremo y el foco no debe perderse.
  useEffect(() => {
    if (!cargando && enfocarResultadosRef.current) {
      enfocarResultadosRef.current = false;
      resultadosRef.current?.focus();
    }
  }, [cargando]);

  /** Escribe el filtro en la URL. `replace` para no llenar el historial de «atrás». */
  function aplicar(cambios: Partial<FiltroBitacora>, nuevaPagina = 1) {
    const siguiente = { ...filtro, ...cambios, pagina: nuevaPagina };
    const nuevos = new URLSearchParams(parametros);
    const escribir = (clave: string, valor: string, omitirSi: string) => {
      if (valor === omitirSi) nuevos.delete(clave);
      else nuevos.set(clave, valor);
    };
    escribir("pagina", String(siguiente.pagina), "1");
    escribir("accion", siguiente.accion, "");
    escribir("actor", siguiente.actorId, "");
    escribir("resultado", siguiente.resultado, "");
    escribir("desde", siguiente.desde, "");
    escribir("hasta", siguiente.hasta, "");
    // Lo que diga el servidor de la consulta anterior deja de valer en cuanto se lanza otra.
    setErroresCampos({});
    setParametros(nuevos, { replace: true });
  }

  function enviarFiltros(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    aplicar({
      accion: accionElegida,
      actorId: usuarioElegido,
      resultado: resultadoElegido,
      desde: desdeEscrito,
      hasta: hastaEscrito,
    });
  }

  function limpiarFiltros() {
    setAccionElegida("");
    setUsuarioElegido("");
    setResultadoElegido("");
    setDesdeEscrito("");
    setHastaEscrito("");
    aplicar(FILTRO_INICIAL);
  }

  function irAPagina(nueva: number) {
    enfocarResultadosRef.current = true;
    aplicar({}, nueva);
  }

  function reintentarCarga() {
    setErroresCampos({});
    reintentar();
  }

  const filas = pagina?.items ?? [];
  const rangoInvalido = Object.keys(erroresCampos).length > 0;
  const listo = !error && !rangoInvalido && !mostrarEsqueleto && pagina !== null;
  // Sin un solo filtro puesto y sin un solo evento: la bitácora está vacía de verdad.
  const bitacoraVacia = listo && !filtrado && pagina.paginacion.total === 0;

  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Registro automático de inicios de sesión y acciones críticas. Solo lectura."
        acciones={
          <p className={estilos.avisoSoloLectura}>
            <IconoCandado className={estilos.iconoCandado} />
            Nadie puede modificar la bitácora
          </p>
        }
      />

      {/* Los filtros se ven también con la bitácora vacía, al revés que en W-16d. Allí «aún no
          tiene análisis» es lo normal el primer día; aquí una bitácora sin un solo evento es
          casi imposible —el propio inicio de sesión del administrador ya escribió una fila—,
          así que es señal de que algo va mal, y esconder los filtros en ese momento haría
          pensar que lo que falla son los filtros. */}
      <form className={estilos.filtros} onSubmit={enviarFiltros} noValidate>
        <CampoLista
          etiqueta="Tipo de evento"
          opciones={opcionesDeAcciones(catalogos.filtros)}
          valor={accionElegida}
          marcador="Todos los eventos"
          onCambio={setAccionElegida}
          cargando={catalogos.cargando}
          textoCargando="Cargando los tipos de evento…"
          error={
            catalogos.fallo
              ? {
                  texto: "No se pudieron cargar los tipos de evento.",
                  nombreAccion: "cargar los tipos de evento",
                  onReintentar: catalogos.reintentar,
                }
              : undefined
          }
        />
        <CampoLista
          etiqueta="Usuario"
          opciones={opcionesDeUsuarios(catalogos.filtros)}
          valor={usuarioElegido}
          marcador="Todos los usuarios"
          onCambio={setUsuarioElegido}
          cargando={catalogos.cargando}
          textoCargando="Cargando los usuarios…"
          error={
            catalogos.fallo
              ? {
                  texto: "No se pudieron cargar los usuarios.",
                  nombreAccion: "cargar los usuarios",
                  onReintentar: catalogos.reintentar,
                }
              : undefined
          }
        />
        {/* PROPUESTA no dibujada: Figma no pinta este filtro, pero la API lo acepta y la alerta
            de W-19 manda aquí a revisar intentos fallidos. Sin él hay que buscarlos a ojo entre
            245 eventos. Queda anotado en CONTRATOS_API.md (BI-1). */}
        <CampoLista
          etiqueta="Resultado"
          opciones={RESULTADOS}
          valor={resultadoElegido}
          marcador="Todos los resultados"
          onCambio={(valor) => setResultadoElegido(esResultado(valor) ? valor : "")}
        />
        <CampoTexto
          etiqueta="Desde"
          type="date"
          value={desdeEscrito}
          onChange={(evento) => setDesdeEscrito(evento.target.value)}
          mensajeError={erroresCampos.desde}
        />
        <CampoTexto
          etiqueta="Hasta"
          type="date"
          value={hastaEscrito}
          onChange={(evento) => setHastaEscrito(evento.target.value)}
          mensajeError={erroresCampos.hasta}
        />
        <div className={estilos.accionFiltros}>
          <Boton type="submit" jerarquia="secundario" cargando={cargando}>
            Aplicar filtros
          </Boton>
        </div>
      </form>

      {error ? (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={error.titulo}>
            {error.mensaje}
          </Alerta>
          <div>
            <Boton jerarquia="secundario" onClick={reintentarCarga}>
              Reintentar
            </Boton>
          </div>
        </div>
      ) : (
        <section className={estilos.tarjetaLista} aria-labelledby="titulo-bitacora">
          <h2 id="titulo-bitacora" className={estilos.tituloLista}>
            Eventos registrados
          </h2>

          {/* `aria-busy` marca la región que está cambiando; el «Cargando…» va aparte, en el
              pie, porque una región live no puede vivir dentro de un `aria-busy`. */}
          <div
            ref={resultadosRef}
            tabIndex={-1}
            className={estilos.resultados}
            aria-busy={cargando || undefined}
          >
            {mostrarEsqueleto && <EsqueletoBitacora />}

            {listo && filas.length > 0 && <TablaBitacora filas={filas} />}

            {/* La bitácora no tiene ni un evento. */}
            {bitacoraVacia && (
              <EstadoVacio
                nivelTitulo="h3"
                titulo="La bitácora está vacía"
                mensaje="Todavía no se ha registrado ningún evento. Aparecerán aquí en cuanto alguien inicie sesión o se haga un cambio en las cuentas."
              />
            )}

            {/* Hay eventos, pero ninguno coincide con los filtros puestos. */}
            {listo && filas.length === 0 && filtrado && (
              <EstadoVacio
                nivelTitulo="h3"
                titulo="Ningún evento con esos filtros"
                mensaje="Pruebe con otro tipo de evento, otro usuario, otro resultado o un período más amplio."
              >
                <Boton onClick={limpiarFiltros}>Limpiar filtros</Boton>
              </EstadoVacio>
            )}
          </div>

          <div className={estilos.pieLista}>
            <p className={estilos.resumen} role="status">
              {mostrarEsqueleto
                ? "Buscando eventos…"
                : rangoInvalido
                  ? "Corrija el período para ver los eventos."
                  : listo
                    ? textoResumen(
                        pagina.paginacion.total,
                        filas.length,
                        pagina.paginacion.pagina
                      )
                    : ""}
            </p>
            {listo && pagina.paginacion.total > EVENTOS_POR_PAGINA && (
              <ControlesPaginacion
                paginacion={pagina.paginacion}
                cargando={cargando}
                onIrAPagina={irAPagina}
              />
            )}
          </div>
        </section>
      )}
    </>
  );
}
