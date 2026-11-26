// Estado de W-27 (casos recibidos por traslado): carga de la bandeja, filtro por doctor de
// origen, búsqueda por documento, apertura de los bloques y marcado de «visto».
//
// No se usa `useHistorial`: su genérico exige `{items, paginacion}` y esta respuesta viene
// agrupada por traslado y sin paginar. La forma es la de `useDashboardDoctor`.
//
// **El documento del paciente solo vive aquí, en memoria** (CLAUDE.md § 6): viaja en el cuerpo
// del POST y no toca la URL, ni el almacenamiento, ni la consola.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorApi } from "../services/api";
import {
  ANALISIS_POR_BLOQUE,
  SIN_LIMITE,
  buscarCasosRecibidos,
  marcarTrasladoVisto,
  obtenerBandejaRecibidos,
} from "../services/casosRecibidos";
import { CodigoErrorApi } from "../services/codigosError";
import { useSesion } from "../sesion/ProveedorSesion";
import type { BandejaRecibidos, BusquedaRecibidos } from "../types";
import type { AvisoError } from "../utils/avisosError";
import { AVISO_DEMASIADOS_INTENTOS, avisoDeError, esDemasiadosIntentos, esErrorGlobal } from "../utils/avisosError";

/** Qué se está pidiendo. Va en un solo estado para que cada disparo lo deje coherente. */
interface Vista {
  /** Cadena vacía = «Todos los doctores». */
  origenId: string;
  /** `null` = bandeja completa; con valor = búsqueda por documento. */
  busqueda: BusquedaRecibidos | null;
  /** `limite=0`: lo activa «Ver los N análisis» (el límite del contrato es de toda la bandeja). */
  sinLimite: boolean;
  intento: number;
  /** La petición no borra lo que ya se ve: sin esqueleto. Solo «Ver los N análisis». */
  conservar: boolean;
}

const VISTA_INICIAL: Vista = {
  origenId: "",
  busqueda: null,
  sinLimite: false,
  intento: 0,
  conservar: false,
};

export interface BandejaCargada {
  bandeja: BandejaRecibidos | null;
  cargando: boolean;
  /** Primera carga, filtro o búsqueda: W-27h pinta el esqueleto en lugar de los bloques. */
  mostrarEsqueleto: boolean;
  aviso: AvisoError | null;
  recargar: () => void;

  origenId: string;
  cambiarOrigen: (origenId: string) => void;

  busqueda: BusquedaRecibidos | null;
  buscar: (busqueda: BusquedaRecibidos) => void;
  limpiarBusqueda: () => void;
  /** 422 DOCUMENTO_INVALIDO: se pinta en el campo, no en una alerta. */
  errorDocumento: string | undefined;
  limpiarErrorDocumento: () => void;

  /** Traslados desplegados. Los nuevos llegan abiertos (W-27b). */
  abiertos: ReadonlySet<string>;
  alternarBloque: (trasladoId: string) => void;

  /** Traslados a los que se les pidió «Ver los N análisis». */
  completos: ReadonlySet<string>;
  verTodos: (trasladoId: string) => void;

  /**
   * `analisis_total` real de un traslado, aunque ahora se esté mostrando una búsqueda, que solo
   * devuelve los totales del paciente. Alimenta el «· N en el traslado» de W-27f.
   * `null` si ese traslado no se ha visto nunca sin filtrar por paciente (ver CR-1).
   */
  totalDelTraslado: (trasladoId: string) => number | null;
}

export function useBandejaRecibidos(): BandejaCargada {
  const { fijarCasosRecibidosNuevos, descontarCasoRecibidoNuevo } = useSesion();

  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  const [bandeja, setBandeja] = useState<BandejaRecibidos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<AvisoError | null>(null);
  const [errorDocumento, setErrorDocumento] = useState<string | undefined>();

  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [completos, setCompletos] = useState<ReadonlySet<string>>(() => new Set<string>());

  /** Traslados a los que ya se les decidió si nacen abiertos: no se vuelve a sembrar. */
  const sembrados = useRef(new Set<string>());
  /** Traslados ya marcados como vistos en esta visita: un solo POST por traslado. */
  const marcados = useRef(new Set<string>());
  /** `analisis_total` por traslado, tomado de las cargas que no son búsquedas (CR-1). */
  const totales = useRef(new Map<string, number>());

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setAviso(null);

    const origenId = vista.origenId || undefined;
    const peticion = vista.busqueda
      ? buscarCasosRecibidos({ ...vista.busqueda, origen_id: origenId })
      : obtenerBandejaRecibidos({
          origenId,
          limite: vista.sinLimite ? SIN_LIMITE : ANALISIS_POR_BLOQUE,
        });

    peticion
      .then((respuesta) => {
        if (!vigente) return;
        setBandeja(respuesta);
        // `nuevos` llega siempre global, sin filtrar: es el número de la insignia del menú, y
        // acaba de responderlo el servidor, así que manda sobre el de la sesión.
        fijarCasosRecibidosNuevos(respuesta.nuevos);
        // Solo las cargas sin búsqueda traen el total real de cada bloque.
        if (!vista.busqueda) {
          for (const traslado of respuesta.traslados) {
            totales.current.set(traslado.id, traslado.analisis_total);
          }
        }
      })
      .catch((causa: unknown) => {
        if (!vigente) return;
        // La sesión (401) o los permisos (403) ya los atiende el proveedor de sesión.
        if (esErrorGlobal(causa)) return;
        // El documento mal escrito se pinta en el campo y se vuelve a la bandeja completa:
        // dejar una lista vacía insinuaría que ese paciente no tiene casos (RF-H01 CA 5).
        if (causa instanceof ErrorApi && causa.codigo === CodigoErrorApi.DOCUMENTO_INVALIDO) {
          const esDelNumero = causa.campos.some((campo) => campo.campo === "numero_documento");
          setErrorDocumento(
            esDelNumero
              ? "Revise el número: no tiene el formato de ese tipo de documento."
              : "Revise el tipo y el número de documento."
          );
          setVista((previa) => ({ ...previa, busqueda: null, conservar: false }));
          return;
        }
        // nginx limita la búsqueda a 30 por minuto por IP y responde 429 sin cuerpo de la API.
        setAviso(
          esDemasiadosIntentos(causa)
            ? { titulo: "Demasiados intentos", mensaje: AVISO_DEMASIADOS_INTENTOS.mensaje }
            : avisoDeError(causa)
        );
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [vista, fijarCasosRecibidosNuevos]);

  // Los traslados nuevos nacen abiertos (W-27b). Se siembra una sola vez por traslado, para no
  // volver a abrir lo que la persona cerró a mano cuando llegan datos nuevos.
  useEffect(() => {
    if (bandeja === null) return;
    const nuevos = bandeja.traslados.filter(
      (traslado) => traslado.nuevo && !sembrados.current.has(traslado.id)
    );
    for (const traslado of bandeja.traslados) sembrados.current.add(traslado.id);
    if (nuevos.length === 0) return;
    setAbiertos((previos) => {
      const siguiente = new Set(previos);
      for (const traslado of nuevos) siguiente.add(traslado.id);
      return siguiente;
    });
  }, [bandeja]);

  /**
   * Marcado de «visto»: un traslado deja de ser «Nuevo» al abrirlo por primera vez
   * (RF-A07 CA 6). «Abrirlo» es tenerlo desplegado delante, que es como llegan los nuevos, o
   * desplegarlo a mano. Un solo POST por traslado y por visita.
   *
   * Si el POST falla, se calla: no es una acción que la persona pidiera, una alerta sería
   * ruido, y la siguiente carga corrige el número. No se reintenta para no entrar en bucle.
   */
  useEffect(() => {
    if (bandeja === null) return;
    for (const traslado of bandeja.traslados) {
      if (!traslado.nuevo || !abiertos.has(traslado.id) || marcados.current.has(traslado.id)) {
        continue;
      }
      marcados.current.add(traslado.id);
      marcarTrasladoVisto(traslado.id)
        .then(descontarCasoRecibidoNuevo)
        .catch(() => undefined);
    }
  }, [bandeja, abiertos, descontarCasoRecibidoNuevo]);

  const recargar = useCallback(() => {
    setVista((previa) => ({ ...previa, intento: previa.intento + 1, conservar: false }));
  }, []);

  const cambiarOrigen = useCallback((origenId: string) => {
    setVista((previa) => ({ ...previa, origenId, sinLimite: false, conservar: false }));
    setCompletos(new Set<string>());
  }, []);

  const buscar = useCallback((busqueda: BusquedaRecibidos) => {
    setErrorDocumento(undefined);
    setVista((previa) => ({ ...previa, busqueda, sinLimite: false, conservar: false }));
  }, []);

  const limpiarBusqueda = useCallback(() => {
    setErrorDocumento(undefined);
    setVista((previa) => ({ ...previa, busqueda: null, sinLimite: false, conservar: false }));
    setCompletos(new Set<string>());
  }, []);

  const limpiarErrorDocumento = useCallback(() => setErrorDocumento(undefined), []);

  const alternarBloque = useCallback((trasladoId: string) => {
    setAbiertos((previos) => {
      const siguiente = new Set(previos);
      if (!siguiente.delete(trasladoId)) siguiente.add(trasladoId);
      return siguiente;
    });
  }, []);

  /**
   * «Ver los N análisis». El contrato tiene un solo `limite` para toda la bandeja, así que la
   * primera vez hay que repedirla con `limite=0`; los demás bloques siguen recortados en
   * pantalla (ver CONTRATOS_API.md, CR-2).
   */
  const verTodos = useCallback((trasladoId: string) => {
    setCompletos((previos) => new Set(previos).add(trasladoId));
    setVista((previa) =>
      previa.sinLimite ? previa : { ...previa, sinLimite: true, conservar: true }
    );
  }, []);

  const totalDelTraslado = useCallback(
    (trasladoId: string) => totales.current.get(trasladoId) ?? null,
    []
  );

  return useMemo(
    () => ({
      bandeja,
      cargando,
      mostrarEsqueleto: cargando && !vista.conservar,
      aviso,
      recargar,
      origenId: vista.origenId,
      cambiarOrigen,
      busqueda: vista.busqueda,
      buscar,
      limpiarBusqueda,
      errorDocumento,
      limpiarErrorDocumento,
      abiertos,
      alternarBloque,
      completos,
      verTodos,
      totalDelTraslado,
    }),
    [
      bandeja,
      cargando,
      vista.conservar,
      vista.origenId,
      vista.busqueda,
      aviso,
      recargar,
      cambiarOrigen,
      buscar,
      limpiarBusqueda,
      errorDocumento,
      limpiarErrorDocumento,
      abiertos,
      alternarBloque,
      completos,
      verTodos,
      totalDelTraslado,
    ]
  );
}
