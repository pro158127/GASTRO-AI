// Pantalla W-26 · Umbrales de inferencia (RF-A01, RF-A02 y RNF-08).
import { useEffect, useMemo, useState } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import DialogoConfirmacion from "../components/DialogoConfirmacion";
import EncabezadoPagina from "../components/EncabezadoPagina";
import {
  guardarConfiguracionInferencia,
  obtenerConfiguracionInferencia,
} from "../services/configuracionInferencia";
import type { ConfiguracionInferencia } from "../services/configuracionInferencia";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import estilos from "./ParametrosInferencia.module.css";

type Borrador = {
  porCaracteristica: boolean;
  global: string;
  caracteristicas: Record<number, string>;
};

const fecha = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

function porcentaje(valor: number | null): string {
  return valor === null ? "Sin definir" : `${Math.round(valor * 100)} %`;
}

function borradorDesde(config: ConfiguracionInferencia): Borrador {
  return {
    porCaracteristica: config.usar_umbral_por_caracteristica,
    global: String(Math.round(config.umbral_global * 100)),
    caracteristicas: Object.fromEntries(config.caracteristicas.map((caracteristica) => [
      caracteristica.id,
      String(Math.round((caracteristica.umbral ?? caracteristica.umbral_por_defecto ?? config.umbral_global) * 100)),
    ])),
  };
}

function fechaLegible(valor: string): string {
  const instante = new Date(valor);
  return Number.isNaN(instante.getTime()) ? "Sin registro previo" : fecha.format(instante);
}

export default function ParametrosInferencia({ titulo }: { titulo: string }) {
  const [configuracion, setConfiguracion] = useState<ConfiguracionInferencia | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [confirmacion, setConfirmacion] = useState(false);
  const [aviso, setAviso] = useState<AvisoError | null>(null);
  const [exito, setExito] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setAviso(null);
    obtenerConfiguracionInferencia()
      .then((respuesta) => {
        if (!vigente) return;
        setConfiguracion(respuesta);
        setBorrador(borradorDesde(respuesta));
      })
      .catch((fallo: unknown) => {
        if (vigente && !esErrorGlobal(fallo)) setAviso(avisoDeError(fallo));
      })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [intento]);

  const sucio = useMemo(() => {
    if (!configuracion || !borrador) return false;
    const original = borradorDesde(configuracion);
    return borrador.porCaracteristica !== original.porCaracteristica
      || (!borrador.porCaracteristica && borrador.global !== original.global)
      || configuracion.caracteristicas.some((c) => borrador.caracteristicas[c.id] !== original.caracteristicas[c.id]);
  }, [borrador, configuracion]);

  const rangoMin = configuracion ? Math.round(configuracion.rango.min * 100) : 10;
  const rangoMax = configuracion ? Math.round(configuracion.rango.max * 100) : 90;
  const valores = borrador
    ? [
      ...(borrador.porCaracteristica ? [] : [borrador.global]),
      ...(borrador.porCaracteristica ? configuracion?.caracteristicas.map((c) => borrador.caracteristicas[c.id]) ?? [] : []),
    ]
    : [];
  const valido = valores.length > 0 && valores.every((valor) => {
    if (valor === null) return true;
    const numero = Number(valor);
    return Number.isFinite(numero) && numero >= rangoMin && numero <= rangoMax;
  });

  function actualizarCampo(campo: "global", valor: string): void;
  function actualizarCampo(campo: number, valor: string): void;
  function actualizarCampo(campo: "global" | number, valor: string) {
    setExito(false);
    setBorrador((anterior) => {
      if (!anterior) return anterior;
      return campo === "global"
        ? { ...anterior, global: valor }
        : { ...anterior, caracteristicas: { ...anterior.caracteristicas, [campo]: valor } };
    });
  }

  function restablecer(): void {
    if (!configuracion) return;
    const inicial = borradorDesde(configuracion);
    inicial.global = "50";
    inicial.caracteristicas = Object.fromEntries(configuracion.caracteristicas.map((c) => [
      c.id,
      String(Math.round((c.umbral_por_defecto ?? 0.5) * 100)),
    ]));
    setBorrador(inicial);
    setExito(false);
  }

  async function guardar(): Promise<void> {
    if (!borrador || !configuracion || guardando || !valido) return;
    setGuardando(true);
    setAviso(null);
    setExito(false);
    try {
      const respuesta = await guardarConfiguracionInferencia({
        usar_umbral_por_caracteristica: borrador.porCaracteristica,
        umbral_global: borrador.porCaracteristica ? configuracion.umbral_global : Number(borrador.global) / 100,
        umbrales: configuracion.caracteristicas.map((c) => ({
          caracteristica_id: c.id,
          umbral: borrador.porCaracteristica ? Number(borrador.caracteristicas[c.id]) / 100 : null,
        })),
      });
      setConfiguracion(respuesta);
      setBorrador(borradorDesde(respuesta));
      setConfirmacion(false);
      setExito(true);
    } catch (fallo: unknown) {
      if (!esErrorGlobal(fallo)) setAviso(avisoDeError(fallo));
    } finally {
      setGuardando(false);
    }
  }

  const activas = configuracion?.caracteristicas.filter((c) => c.activa) ?? [];

  return (
    <div className={estilos.pagina}>
      <EncabezadoPagina titulo={titulo} descripcion="Ajustes del procesamiento que no modifican los pesos del modelo ni requieren al equipo de desarrollo." />

      <Alerta tipo="info" titulo="Los cambios solo afectan los análisis siguientes">
        Los análisis ya generados conservan el umbral con el que se hicieron (RF-A01 CA 2). Cada cambio queda en la bitácora.
      </Alerta>

      {aviso && (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={aviso.titulo}>{aviso.mensaje}</Alerta>
          {!configuracion && <Boton jerarquia="secundario" onClick={() => setIntento((n) => n + 1)}>Reintentar</Boton>}
        </div>
      )}
      {exito && <Alerta tipo="exito" titulo="Umbral actualizado">El nuevo valor se aplicará a los análisis que se hagan desde ahora. El cambio quedó en la bitácora.</Alerta>}

      {cargando && !configuracion && <p className={estilos.cargando} role="status">Cargando parámetros de inferencia…</p>}

      {configuracion && borrador && (
        <section className={estilos.tarjeta} aria-labelledby="titulo-umbral">
          <div>
            <h2 id="titulo-umbral" className={estilos.tituloSeccion}>Umbral mínimo de confianza</h2>
            <p className={estilos.descripcion}>Una característica se marca «sobre el umbral» cuando su probabilidad iguala o supera este valor. Lo ven los doctores en la marca de cada barra del resultado.</p>
          </div>

          <fieldset className={estilos.modos} disabled={guardando}>
            <legend className={estilos.soloLector}>Modo del umbral</legend>
            <label className={estilos.opcion}>
              <input type="radio" name="modo-umbral" checked={!borrador.porCaracteristica} onChange={() => { setExito(false); setBorrador((b) => b && ({ ...b, porCaracteristica: false })); }} />
              <span><strong>Un umbral para todas las características</strong><small>El mismo valor se aplica a atrofia gástrica, gastritis y H. pylori.</small></span>
            </label>
            <label className={estilos.opcion}>
              <input type="radio" name="modo-umbral" checked={borrador.porCaracteristica} onChange={() => { setExito(false); setBorrador((b) => b && ({ ...b, porCaracteristica: true })); }} />
              <span><strong>Un umbral por característica</strong><small>Un valor distinto para cada característica, por ejemplo los del model card.</small></span>
            </label>
          </fieldset>

          {!borrador.porCaracteristica ? (
            <label className={estilos.campo} htmlFor="umbral-global">
              <span>Umbral (%)</span>
              <input id="umbral-global" type="number" min={rangoMin} max={rangoMax} step="1" value={borrador.global} aria-invalid={Number(borrador.global) < rangoMin || Number(borrador.global) > rangoMax} onChange={(e) => actualizarCampo("global", e.target.value)} />
              <small>Valor actual: {porcentaje(configuracion.umbral_global)}. Rango permitido: {rangoMin} % a {rangoMax} %. Valor inicial del sistema: 50 %.</small>
            </label>
          ) : (
            <div className={estilos.camposCaracteristicas}>
              {activas.map((c) => (
                <label className={estilos.campo} key={c.id} htmlFor={`umbral-${c.id}`}>
                  <span>{c.nombre} (%)</span>
                  <input id={`umbral-${c.id}`} type="number" min={rangoMin} max={rangoMax} step="1" value={borrador.caracteristicas[c.id] ?? ""} aria-invalid={Number(borrador.caracteristicas[c.id]) < rangoMin || Number(borrador.caracteristicas[c.id]) > rangoMax} onChange={(e) => actualizarCampo(c.id, e.target.value)} />
                  <small>Valor vigente: {porcentaje(c.umbral)} · Model card: {porcentaje(c.umbral_por_defecto)}. Entre {rangoMin} % y {rangoMax} %.</small>
                </label>
              ))}
            </div>
          )}

          <p className={estilos.ultimoCambio}>
            Configuración vigente desde: {fechaLegible(configuracion.actualizado_en)}
            {configuracion.actualizado_por && ` · ${configuracion.actualizado_por.nombre} ${configuracion.actualizado_por.apellido}`}
            {` · ${configuracion.usar_umbral_por_caracteristica ? "Umbrales individuales" : `Umbral global ${porcentaje(configuracion.umbral_global)}`}`}
          </p>

          {sucio && !valido && <p className={estilos.errorValidacion} role="alert">Usa valores entre {rangoMin} % y {rangoMax} %.</p>}
          <div className={estilos.acciones}>
            <Boton aria-disabled={!sucio || !valido || guardando} onClick={() => setConfirmacion(true)}>Guardar cambio</Boton>
            <Boton jerarquia="secundario" aria-disabled={guardando} onClick={restablecer}>Restablecer valor inicial</Boton>
          </div>
        </section>
      )}

      {confirmacion && borrador && configuracion && (
        <DialogoConfirmacion
          titulo={borrador.porCaracteristica
            ? "¿Cambiar los umbrales por característica?"
            : `¿Cambiar el umbral de ${porcentaje(configuracion.umbral_global)} a ${porcentaje(Number(borrador.global) / 100)}?`}
          mensaje="Se aplicará a los análisis que se hagan desde ahora. Los análisis ya generados conservan el umbral con el que se hicieron (RF-A01 CA 2). El cambio queda en la bitácora."
          etiquetaConfirmar="Cambiar umbral"
          etiquetaCancelar="Cancelar"
          confirmarEsPrimario
          enviando={guardando}
          etiquetaEnviando="Guardando…"
          onCancelar={() => setConfirmacion(false)}
          onConfirmar={() => void guardar()}
        />
      )}
    </div>
  );
}
