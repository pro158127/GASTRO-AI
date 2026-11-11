// Pantalla W-02 · Cambio obligatorio de contraseña (con W-02b: no cumple la política).
// Paso 1 de 2 del primer ingreso. Figma dibuja un solo campo; aquí hay dos («Nueva contraseña» y
// «Confirmar contraseña») porque el backend exige `confirmacion`. Desviación autorizada por el
// equipo; pendiente de agregar a Figma.
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoContrasena from "../components/CampoContrasena";
import DisposicionAcceso from "../components/DisposicionAcceso";
import { ErrorApi, cambiarContrasena } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import { useSesion } from "../sesion/ProveedorSesion";
import type { RequisitoContrasena } from "../types";
import {
  AVISO_DEMASIADOS_INTENTOS,
  avisoDeError,
  esDemasiadosIntentos,
} from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import estilos from "./AccesoPasos.module.css";

const ID_NUEVA = "contrasena-nueva";
const ID_CONFIRMACION = "contrasena-confirmacion";

// W-02: texto de ayuda del campo.
const AYUDA_NUEVA =
  "Entre 12 y 64 caracteres. Puede usar espacios: una frase larga es más segura que los símbolos. No se aceptan contraseñas comunes ni filtradas.";

// W-02b: un mensaje por regla que falla; dice qué hacer y no borra lo escrito.
const MENSAJE_LONGITUD = "Use entre 12 y 64 caracteres.";
const MENSAJE_COMUN_O_FILTRADA =
  "Esta contraseña es muy común o apareció en una filtración de datos. Elija otra de entre 12 y 64 caracteres; puede ser una frase.";
// No dibujados en Figma (pendientes de agregar): reglas SIN_DATOS_PROPIOS y DISTINTA_A_LA_TEMPORAL,
// la confirmación distinta y el caso en que el servidor no manda la regla que falla.
const MENSAJE_DATOS_PROPIOS =
  "Esta contraseña incluye datos propios, como su correo o el nombre de la plataforma. Elija otra de entre 12 y 64 caracteres; puede ser una frase.";
const MENSAJE_IGUAL_A_LA_TEMPORAL =
  "La contraseña nueva debe ser distinta de la temporal. Elija otra de entre 12 y 64 caracteres; puede ser una frase.";
const MENSAJE_POLITICA_GENERICO =
  "La contraseña no cumple la política del sistema. Elija otra de entre 12 y 64 caracteres; puede ser una frase.";
const MENSAJE_CONFIRMACION =
  "Las contraseñas no coinciden. Escriba la misma contraseña en ambos campos.";

/** Mensaje de la primera regla que falla, en el orden en que las manda el backend. */
function mensajeDePolitica(requisitos: RequisitoContrasena[]): string {
  const falla = requisitos.find((requisito) => !requisito.cumple);
  switch (falla?.codigo) {
    case "LONGITUD_MINIMA":
    case "LONGITUD_MAXIMA":
      return MENSAJE_LONGITUD;
    case "NO_COMUN":
    case "NO_FILTRADA":
      return MENSAJE_COMUN_O_FILTRADA;
    case "SIN_DATOS_PROPIOS":
      return MENSAJE_DATOS_PROPIOS;
    case "DISTINTA_A_LA_TEMPORAL":
      return MENSAJE_IGUAL_A_LA_TEMPORAL;
    default:
      return MENSAJE_POLITICA_GENERICO;
  }
}

export default function CambioContrasena() {
  const { avanzarEtapa, cerrarSesion } = useSesion();

  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [errorNueva, setErrorNueva] = useState<string | null>(null);
  const [errorConfirmacion, setErrorConfirmacion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<(AvisoError & { tipo: "advertencia" | "error" }) | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Campo que debe recibir el foco tras un envío fallido (WCAG 3.3.1); su error se lee por
  // aria-describedby.
  const [campoConFoco, setCampoConFoco] = useState<string | null>(null);
  const enviandoRef = useRef(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = "Cambio de contraseña · Gastro-AI";
    // Al llegar a la pantalla, el foco va al título.
    tituloRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (campoConFoco) document.getElementById(campoConFoco)?.focus();
  }, [campoConFoco]);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviandoRef.current) return;

    setAviso(null);
    setErrorNueva(null);
    setErrorConfirmacion(null);
    setCampoConFoco(null);

    // La validación del cliente es solo ayuda; la autoridad es el servidor.
    if (nueva.length === 0) {
      setErrorNueva(MENSAJE_LONGITUD);
      setCampoConFoco(ID_NUEVA);
      return;
    }
    if (nueva !== confirmacion) {
      setErrorConfirmacion(MENSAJE_CONFIRMACION);
      setCampoConFoco(ID_CONFIRMACION);
      return;
    }

    enviandoRef.current = true;
    setEnviando(true);
    try {
      const respuesta = await cambiarContrasena(nueva, confirmacion);
      // Las guardas llevan a la pantalla de la etapa que sigue (W-03 o W-04).
      avanzarEtapa(respuesta.etapa);
    } catch (error) {
      // Se conserva lo escrito en ambos campos.
      manejarError(error);
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  function manejarError(error: unknown) {
    if (error instanceof ErrorApi) {
      // Sesión vencida o etapa equivocada: los manejadores globales ya redirigen.
      if (
        error.codigo === CodigoErrorApi.SESION_EXPIRADA ||
        error.codigo === CodigoErrorApi.ETAPA_INVALIDA
      ) {
        return;
      }
      if (error.codigo === CodigoErrorApi.CONTRASENA_NO_CUMPLE_POLITICA) {
        const fallaNueva = error.campos.some((campo) => campo.campo === "contrasena_nueva");
        const fallaConfirmacion = error.campos.some((campo) => campo.campo === "confirmacion");
        if (fallaNueva || fallaConfirmacion) {
          if (fallaNueva) setErrorNueva(mensajeDePolitica(error.requisitos));
          if (fallaConfirmacion) setErrorConfirmacion(MENSAJE_CONFIRMACION);
          setCampoConFoco(fallaNueva ? ID_NUEVA : ID_CONFIRMACION);
          return;
        }
      }
    }
    if (esDemasiadosIntentos(error)) {
      setAviso({ tipo: "advertencia", ...AVISO_DEMASIADOS_INTENTOS });
      return;
    }
    // Sin conexión (W-30), 5xx y cualquier otro fallo no previsto (W-31).
    setAviso({ tipo: "error", ...avisoDeError(error) });
  }

  return (
    <DisposicionAcceso ancho={480}>
      <p className={estilos.paso}>Primer ingreso · Paso 1 de 2</p>
      <h1 ref={tituloRef} tabIndex={-1} className={estilos.titulo}>
        Cree su contraseña definitiva
      </h1>
      <p className={estilos.introduccion}>
        Su cuenta tiene una contraseña temporal. Para continuar, defina una contraseña personal.
      </p>
      <form className={estilos.formulario} method="post" onSubmit={manejarEnvio} noValidate>
        {aviso && (
          <Alerta tipo={aviso.tipo} titulo={aviso.titulo}>
            {aviso.mensaje}
          </Alerta>
        )}
        <CampoContrasena
          id={ID_NUEVA}
          etiqueta="Nueva contraseña"
          name="contrasena_nueva"
          autoComplete="new-password"
          ayuda={AYUDA_NUEVA}
          mensajeError={errorNueva ?? undefined}
          value={nueva}
          onChange={(evento) => setNueva(evento.target.value)}
        />
        <CampoContrasena
          id={ID_CONFIRMACION}
          etiqueta="Confirmar contraseña"
          name="confirmacion"
          autoComplete="new-password"
          mensajeError={errorConfirmacion ?? undefined}
          value={confirmacion}
          onChange={(evento) => setConfirmacion(evento.target.value)}
        />
        <div className={estilos.acciones}>
          <Boton type="submit" anchoCompleto cargando={enviando} etiquetaCargando="Guardando…">
            Guardar y continuar
          </Boton>
          {/* No dibujado en Figma (pendiente de agregar): salida para quien no quiere seguir. */}
          <Boton jerarquia="terciario" anchoCompleto onClick={cerrarSesion}>
            Cancelar
          </Boton>
        </div>
      </form>
    </DisposicionAcceso>
  );
}
