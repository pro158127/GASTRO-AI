// Pestaña «Mis análisis» de W-16 (Figma 81:7288), con W-16d (sin análisis, 81:7555),
// W-16f (el ID no coincide con nada, 81:7980) y W-16g (filtrando, 98:6572).
//
// **Los filtros viven en la query string.** Ninguno es un dato personal —el código del
// análisis, el origen y unas fechas—, y `GET /analisis` nunca devuelve datos del paciente.
// A cambio, volver del detalle con «atrás» restaura la vista sola, recargar funciona y el
// enlace se puede pasar a un colega. La pestaña de paciente hace lo contrario, y por el
// motivo contrario.
//
// **No hay búsqueda en vivo**: Figma dibuja un botón «Aplicar filtros», así que el campo del
// ID se escribe en el estado local y solo pasa a la URL al enviar el formulario. Es lo
// contrario que W-09, donde el campo busca solo tras una espera.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoLista from "../components/CampoLista";
import CampoTexto from "../components/CampoTexto";
import ControlesPaginacion from "../components/ControlesPaginacion";
import EnlaceBoton from "../components/EnlaceBoton";
import EstadoVacio from "../components/EstadoVacio";
import {
  ANALISIS_POR_PAGINA,
  FILTRO_INICIAL,
  LONGITUD_MAXIMA_CODIGO,
  hayFiltros,
  listarMisAnalisis,
} from "../services/historial";
import type { FiltroHistorial } from "../services/historial";
import type { EstadoAnalisis, OrdenHistorial, OrigenHistorial } from "../types";
import TablaHistorial, { EsqueletoHistorial } from "./TablaHistorial";
import { useHistorial } from "./useHistorial";
import estilos from "./Historial.module.css";

const ORIGENES: readonly { valor: OrigenHistorial; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "propios", etiqueta: "Propios" },
  { valor: "recibidos", etiqueta: "Recibidos por traslado" },
];

function esOrigen(valor: string): valor is OrigenHistorial {
  return valor === "todos" || valor === "propios" || valor === "recibidos";
}

/**
 * PROPUESTA no dibujada: Figma no pinta el filtro por estado, pero la API lo acepta y sin él
 * un análisis fallido no se puede quitar de la lista y la ensucia. Queda anotado en
 * `CONTRATOS_API.md` junto a los otros tres desvíos de esta pantalla.
 */
const ESTADOS: readonly { valor: EstadoAnalisis; etiqueta: string }[] = [
  { valor: "COMPLETADO", etiqueta: "Completados" },
  { valor: "PROCESANDO", etiqueta: "En proceso" },
  { valor: "FALLIDO", etiqueta: "Fallidos" },
];

function esEstado(valor: string): valor is EstadoAnalisis {
  return valor === "COMPLETADO" || valor === "PROCESANDO" || valor === "FALLIDO";
}

/** Lee el filtro de la URL. Lo que no se entienda cae en el valor inicial, sin romper nada. */
function filtroDesdeUrl(parametros: URLSearchParams): FiltroHistorial {
  const pagina = Number.parseInt(parametros.get("pagina") ?? "", 10);
  const origen = parametros.get("origen") ?? "";
  const estado = parametros.get("estado") ?? "";
  const orden = parametros.get("orden");
  return {
    pagina: Number.isInteger(pagina) && pagina >= 1 ? pagina : 1,
    origen: esOrigen(origen) ? origen : "todos",
    estado: esEstado(estado) ? estado : "",
    codigo: (parametros.get("codigo") ?? "").slice(0, LONGITUD_MAXIMA_CODIGO),
    desde: parametros.get("desde") ?? "",
    hasta: parametros.get("hasta") ?? "",
    orden: orden === "solicitado_en" ? "solicitado_en" : "-solicitado_en",
  };
}

/** «Mostrando 1–8 de 51 análisis · del más reciente al más antiguo». */
function textoResumen(
  total: number,
  mostrados: number,
  pagina: number,
  orden: OrdenHistorial
): string {
  const sentido =
    orden === "solicitado_en" ? "del más antiguo al más reciente" : "del más reciente al más antiguo";
  if (mostrados === 0) return `Mostrando 0 de ${total} análisis · ${sentido}`;
  const desde = (pagina - 1) * ANALISIS_POR_PAGINA + 1;
  const hasta = desde + mostrados - 1;
  const rango = desde === hasta ? `${desde}` : `${desde}–${hasta}`;
  return `Mostrando ${rango} de ${total} análisis · ${sentido}`;
}

export default function HistorialMisAnalisis() {
  const [parametros, setParametros] = useSearchParams();
  const filtro = filtroDesdeUrl(parametros);
  const filtrado = hayFiltros(filtro);

  // Lo elegido en los cuatro controles antes de pulsar «Aplicar filtros». Figma dibuja un
  // solo botón para los cuatro, así que ninguno filtra por su cuenta: que el desplegable
  // recargara la lista al tocarlo y los demás no sería un botón que a veces no hace falta.
  const [codigoEscrito, setCodigoEscrito] = useState(filtro.codigo);
  const [origenElegido, setOrigenElegido] = useState<OrigenHistorial>(filtro.origen);
  const [estadoElegido, setEstadoElegido] = useState<"" | EstadoAnalisis>(filtro.estado);
  const [desdeEscrito, setDesdeEscrito] = useState(filtro.desde);
  const [hastaEscrito, setHastaEscrito] = useState(filtro.hasta);

  // W-16d y W-16f se distinguen sin pedir nada más: «sin filtros y total 0» solo puede ser
  // «todavía no tiene análisis». W-09 sí necesitaba recordar el total sin filtro porque su
  // texto dice «0 de 5 usuarios para «valentina»»; aquí el resumen no compara contra nada.
  const resultadosRef = useRef<HTMLDivElement>(null);
  const enfocarResultadosRef = useRef(false);

  // La consulta tiene que ser estable o el efecto del hook se repetiría en cada render.
  const consultar = useCallback(
    () => listarMisAnalisis(filtro),
    // Las piezas del filtro, no el objeto: `filtroDesdeUrl` crea uno nuevo en cada render.
    [
      filtro.pagina,
      filtro.origen,
      filtro.estado,
      filtro.codigo,
      filtro.desde,
      filtro.hasta,
      filtro.orden,
    ]
  );
  const { pagina, cargando, mostrarEsqueleto, error, reintentar } = useHistorial(consultar);


  // Tras cambiar de página el foco va a la lista nueva: el botón pulsado puede quedar
  // deshabilitado al llegar al extremo y el foco no debe perderse.
  useEffect(() => {
    if (!cargando && enfocarResultadosRef.current) {
      enfocarResultadosRef.current = false;
      resultadosRef.current?.focus();
    }
  }, [cargando]);

  /** Escribe el filtro en la URL. `replace` para no llenar el historial de «atrás». */
  function aplicar(cambios: Partial<FiltroHistorial>, nuevaPagina = 1) {
    const siguiente = { ...filtro, ...cambios, pagina: nuevaPagina };
    const nuevos = new URLSearchParams(parametros);
    const escribir = (clave: string, valor: string, omitirSi: string) => {
      if (valor === omitirSi) nuevos.delete(clave);
      else nuevos.set(clave, valor);
    };
    escribir("pagina", String(siguiente.pagina), "1");
    escribir("origen", siguiente.origen, "todos");
    escribir("estado", siguiente.estado, "");
    escribir("codigo", siguiente.codigo.trim(), "");
    escribir("desde", siguiente.desde, "");
    escribir("hasta", siguiente.hasta, "");
    escribir("orden", siguiente.orden, "-solicitado_en");
    setParametros(nuevos, { replace: true });
  }

  function enviarFiltros(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    aplicar({
      codigo: codigoEscrito,
      origen: origenElegido,
      estado: estadoElegido,
      desde: desdeEscrito,
      hasta: hastaEscrito,
    });
  }

  function limpiarFiltros() {
    setCodigoEscrito("");
    setOrigenElegido("todos");
    setEstadoElegido("");
    setDesdeEscrito("");
    setHastaEscrito("");
    aplicar({ ...FILTRO_INICIAL, orden: filtro.orden });
  }

  function irAPagina(nueva: number) {
    enfocarResultadosRef.current = true;
    aplicar({}, nueva);
  }

  const filas = pagina?.items ?? [];
  const listo = !error && !mostrarEsqueleto && pagina !== null;
  // W-16d: nunca ha habido análisis. Sin filtros puestos y sin un solo resultado.
  const sinNingunAnalisis = listo && !filtrado && pagina.paginacion.total === 0;

  return (
    <>
      {/* W-16d no dibuja los filtros: no hay nada que filtrar. */}
      {!sinNingunAnalisis && (
        <form className={estilos.filtros} onSubmit={enviarFiltros} noValidate>
          <CampoTexto
            etiqueta="Buscar por ID de análisis"
            placeholder="A-2026-000000"
            value={codigoEscrito}
            onChange={(evento) => setCodigoEscrito(evento.target.value)}
            maxLength={LONGITUD_MAXIMA_CODIGO}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          <CampoLista
            etiqueta="Origen"
            opciones={ORIGENES}
            valor={origenElegido}
            onCambio={(valor) => {
              if (esOrigen(valor)) setOrigenElegido(valor);
            }}
          />
          {/* PROPUESTA no dibujada: ver el comentario de ESTADOS. */}
          <CampoLista
            etiqueta="Estado"
            opciones={ESTADOS}
            valor={estadoElegido}
            marcador="Todos"
            onCambio={(valor) => setEstadoElegido(esEstado(valor) ? valor : "")}
          />
          <CampoTexto
            etiqueta="Desde"
            type="date"
            value={desdeEscrito}
            onChange={(evento) => setDesdeEscrito(evento.target.value)}
          />
          <CampoTexto
            etiqueta="Hasta"
            type="date"
            value={hastaEscrito}
            onChange={(evento) => setHastaEscrito(evento.target.value)}
          />
          <div className={estilos.accionFiltros}>
            <Boton type="submit" jerarquia="secundario">
              Aplicar filtros
            </Boton>
          </div>
        </form>
      )}

      {error ? (
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
      ) : (
        <section className={estilos.tarjetaLista} aria-labelledby="titulo-mis-analisis">
          <h2 id="titulo-mis-analisis" className={estilos.tituloLista}>
            Mis análisis
          </h2>

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
                titulo="Mis análisis"
                orden={filtro.orden}
                onCambiarOrden={(orden) => aplicar({ orden })}
              />
            )}

            {/* W-16d · todavía no hay ningún análisis. */}
            {sinNingunAnalisis && (
              <EstadoVacio
                nivelTitulo="h3"
                titulo="Aún no tiene análisis"
                mensaje="Cuando solicite su primer análisis aparecerá aquí, con su resultado y su fecha."
              >
                <EnlaceBoton jerarquia="primario" to="/nuevo-analisis">
                  Nuevo análisis
                </EnlaceBoton>
              </EstadoVacio>
            )}

            {/* W-16f · hay análisis, pero ninguno coincide. El texto dice «suyo» a propósito:
                no se revela si ese ID existe para otro doctor. */}
            {listo && filas.length === 0 && filtrado && (
              <EstadoVacio
                nivelTitulo="h3"
                titulo="No encontramos ningún análisis suyo con esos filtros"
                mensaje="Revise el ID, el origen o las fechas. Si el ID es de otro doctor, no aparecerá aquí."
              >
                <Boton onClick={limpiarFiltros}>Limpiar filtros</Boton>
              </EstadoVacio>
            )}
          </div>

          {!sinNingunAnalisis && (
            <div className={estilos.pieLista}>
              <p className={estilos.resumen} role="status">
                {mostrarEsqueleto
                  ? "Cargando análisis…"
                  : listo
                    ? textoResumen(
                        pagina.paginacion.total,
                        filas.length,
                        pagina.paginacion.pagina,
                        filtro.orden
                      )
                    : ""}
              </p>
              {listo && pagina.paginacion.total > ANALISIS_POR_PAGINA && (
                <ControlesPaginacion
                  paginacion={pagina.paginacion}
                  cargando={cargando}
                  onIrAPagina={irAPagina}
                />
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
