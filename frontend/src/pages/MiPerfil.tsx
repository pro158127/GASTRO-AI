// Pantalla W-18 · Mi perfil (Figma 65:3775; administrador W-18f 98:9860). RF-U04.
// Estados: W-18b guardando, W-18c cambios guardados (notificación), W-18d campo obligatorio
// vacío y W-18e diálogo al salir con cambios sin guardar.
//
// Se editan nombre, apellido y teléfono (opcional). El correo y el rol son de solo lectura con
// la razón visible (CA 2) y no se envían en el PATCH. Los datos personales solo viven en el
// estado de este componente: nada en la URL, en el almacenamiento del navegador ni en la consola.
//
// Textos que Figma todavía no dibuja (aprobados por el equipo, pendientes de agregar a Figma):
// «Escriba su apellido.», el error del teléfono, el texto del diálogo W-18e, «Cargando…» y los
// avisos W-30/W-31 al cargar o guardar.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useBlocker } from "react-router";
import type { BlockerFunction } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoTexto from "../components/CampoTexto";
import DialogoConfirmacion from "../components/DialogoConfirmacion";
import EncabezadoPagina from "../components/EncabezadoPagina";
import IndicadorCarga from "../components/iconos/IndicadorCarga";
import Notificacion from "../components/Notificacion";
import { ErrorApi, actualizarPerfil, obtenerPerfil } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import { useSesion } from "../sesion/ProveedorSesion";
import type { Perfil } from "../types";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import estilos from "./MiPerfil.module.css";

type CampoEditable = "nombre" | "apellido" | "telefono";

interface ValoresFormulario {
  nombre: string;
  apellido: string;
  telefono: string;
}

type ErroresFormulario = Partial<Record<CampoEditable, string>>;

type EstadoCarga =
  | { fase: "cargando" }
  | { fase: "error"; aviso: AvisoError }
  | { fase: "listo"; perfil: Perfil };

/** Textos de error por campo (W-18d y textos aprobados). Se eligen por campo, nunca con el mensaje del servidor. */
const MENSAJES_ERROR: Record<CampoEditable, string> = {
  nombre: "Escriba su nombre.",
  apellido: "Escriba su apellido.",
  telefono: "Escriba un teléfono de 7 a 15 dígitos; puede empezar con +.",
};

const ORDEN_CAMPOS: CampoEditable[] = ["nombre", "apellido", "telefono"];

const AYUDA_SOLO_ADMINISTRADOR = "Solo un administrador puede cambiarlo.";
const AYUDA_ROL_ADMINISTRADOR = "Lo cambia otro administrador (RF-U08). Siempre debe quedar al menos uno activo.";

/** Igual que el servidor: quita espacios, guiones, puntos y paréntesis («300 123-4567» → «3001234567»). */
function normalizarTelefono(valor: string): string {
  return valor.replace(/[\s\-().]/g, "");
}

const PATRON_TELEFONO = /^\+?[0-9]{7,15}$/;

function valoresDesdePerfil(perfil: Perfil): ValoresFormulario {
  return { nombre: perfil.nombre, apellido: perfil.apellido, telefono: perfil.telefono ?? "" };
}

function validar(valores: ValoresFormulario): ErroresFormulario {
  const errores: ErroresFormulario = {};
  if (valores.nombre.trim() === "") errores.nombre = MENSAJES_ERROR.nombre;
  if (valores.apellido.trim() === "") errores.apellido = MENSAJES_ERROR.apellido;
  const telefono = normalizarTelefono(valores.telefono);
  if (telefono !== "" && !PATRON_TELEFONO.test(telefono)) errores.telefono = MENSAJES_ERROR.telefono;
  return errores;
}

function esCampoEditable(campo: string): campo is CampoEditable {
  return (ORDEN_CAMPOS as string[]).includes(campo);
}

export default function MiPerfil({ titulo }: { titulo: string }) {
  const { autenticado, actualizarUsuario } = useSesion();
  const [carga, setCarga] = useState<EstadoCarga>({ fase: "cargando" });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCarga({ fase: "cargando" });
    obtenerPerfil()
      .then((perfil) => {
        if (vigente) setCarga({ fase: "listo", perfil });
      })
      .catch((error: unknown) => {
        if (vigente && !esErrorGlobal(error)) setCarga({ fase: "error", aviso: avisoDeError(error) });
      });
    return () => {
      vigente = false;
    };
  }, [intento]);

  return (
    <>
      <EncabezadoPagina titulo={titulo} descripcion="Consulte y actualice sus datos básicos." />
      {carga.fase === "cargando" && (
        <p className={estilos.cargando} role="status">
          <IndicadorCarga className={estilos.indicador} />
          Cargando…
        </p>
      )}
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
      {carga.fase === "listo" && (
        <FormularioPerfil
          perfilInicial={carga.perfil}
          autenticado={autenticado}
          alGuardar={(perfil) => actualizarUsuario({ nombre: perfil.nombre, apellido: perfil.apellido })}
        />
      )}
      {/* TEMPORAL: falta la tarjeta «Recorrido de la aplicación» (Figma 65:4106 / 98:9891) con
          «Ver recorrido». Se agrega cuando exista el recorrido guiado (T-13/T-14, W-19e…). */}
    </>
  );
}

interface PropiedadesFormularioPerfil {
  perfilInicial: Perfil;
  /** Con la sesión cerrada (manual o por inactividad) no se avisa de los cambios sin guardar. */
  autenticado: boolean;
  /** PATCH /perfil respondió: actualiza el nombre de la barra superior. */
  alGuardar: (perfil: Perfil) => void;
}

function FormularioPerfil({ perfilInicial, autenticado, alGuardar }: PropiedadesFormularioPerfil) {
  const idBase = useId();
  const idCampo = (campo: CampoEditable) => `${idBase}-${campo}`;
  const [perfil, setPerfil] = useState(perfilInicial);
  const [guardado, setGuardado] = useState<ValoresFormulario>(() => valoresDesdePerfil(perfilInicial));
  const [valores, setValores] = useState<ValoresFormulario>(guardado);
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [errorGuardar, setErrorGuardar] = useState<AvisoError | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [notificacion, setNotificacion] = useState(false);
  const guardandoRef = useRef(false);

  const hayCambios =
    valores.nombre !== guardado.nombre ||
    valores.apellido !== guardado.apellido ||
    valores.telefono !== guardado.telefono;
  const avisarAlSalir = hayCambios && autenticado;

  // W-18e: el bloqueo lee siempre el valor actual (no el del render en que se creó).
  const avisarAlSalirRef = useRef(avisarAlSalir);
  avisarAlSalirRef.current = avisarAlSalir;
  const debeBloquear = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      avisarAlSalirRef.current && currentLocation.pathname !== nextLocation.pathname,
    []
  );
  const bloqueo = useBlocker(debeBloquear);

  // Recargar o cerrar la pestaña con cambios sin guardar: aviso nativo del navegador.
  useEffect(() => {
    if (!avisarAlSalir) return;
    function alSalir(evento: BeforeUnloadEvent) {
      evento.preventDefault();
      evento.returnValue = "";
    }
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [avisarAlSalir]);

  function cambiar(campo: CampoEditable, valor: string) {
    setValores((previos) => ({ ...previos, [campo]: valor }));
    // El error de ese campo se quita al corregirlo; lo escrito nunca se borra.
    setErrores((previos) => (previos[campo] ? { ...previos, [campo]: undefined } : previos));
  }

  function enfocarPrimerError(conError: ErroresFormulario) {
    const campo = ORDEN_CAMPOS.find((c) => conError[c]);
    if (campo) document.getElementById(idCampo(campo))?.focus();
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardandoRef.current) return;
    setErrorGuardar(null);

    const conError = validar(valores);
    setErrores(conError);
    if (Object.keys(conError).length > 0) {
      enfocarPrimerError(conError);
      return;
    }

    const telefono = normalizarTelefono(valores.telefono);
    guardandoRef.current = true;
    setGuardando(true);
    try {
      const respuesta = await actualizarPerfil({
        nombre: valores.nombre.trim(),
        apellido: valores.apellido.trim(),
        telefono: telefono === "" ? null : telefono,
      });
      const nuevos = valoresDesdePerfil(respuesta);
      setPerfil(respuesta);
      setGuardado(nuevos);
      setValores(nuevos);
      setNotificacion(true);
      alGuardar(respuesta);
    } catch (error) {
      if (esErrorGlobal(error)) return;
      const delServidor: ErroresFormulario = {};
      if (error instanceof ErrorApi && error.codigo === CodigoErrorApi.DATOS_INVALIDOS) {
        for (const { campo } of error.campos) {
          if (esCampoEditable(campo)) delServidor[campo] = MENSAJES_ERROR[campo];
        }
      }
      if (Object.keys(delServidor).length > 0) {
        setErrores(delServidor);
        enfocarPrimerError(delServidor);
      } else {
        setErrorGuardar(avisoDeError(error));
      }
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  }

  // «Descartar cambios» del formulario: vuelve a lo guardado, sin diálogo.
  function descartar() {
    setValores(guardado);
    setErrores({});
    setErrorGuardar(null);
  }

  const esAdministrador = perfil.rol.codigo === "ADMINISTRADOR";

  return (
    <>
      <section className={estilos.tarjeta} aria-labelledby={`${idBase}-titulo`}>
        <h2 id={`${idBase}-titulo`} className={estilos.tituloTarjeta}>
          Datos personales
        </h2>
        <form className={estilos.formulario} noValidate onSubmit={enviar}>
          <div className={estilos.fila}>
            <CampoTexto
              id={idCampo("nombre")}
              etiqueta="Nombre"
              value={valores.nombre}
              onChange={(e) => cambiar("nombre", e.target.value)}
              mensajeError={errores.nombre}
              maxLength={100}
              autoComplete="given-name"
              required
            />
            <CampoTexto
              id={idCampo("apellido")}
              etiqueta="Apellido"
              value={valores.apellido}
              onChange={(e) => cambiar("apellido", e.target.value)}
              mensajeError={errores.apellido}
              maxLength={100}
              autoComplete="family-name"
              required
            />
          </div>
          <CampoTexto
            id={idCampo("telefono")}
            etiqueta="Teléfono (opcional)"
            type="tel"
            inputMode="tel"
            value={valores.telefono}
            onChange={(e) => cambiar("telefono", e.target.value)}
            mensajeError={errores.telefono}
            maxLength={30}
            autoComplete="tel"
          />
          <CampoTexto etiqueta="Correo electrónico" value={perfil.correo ?? ""} readOnly ayuda={AYUDA_SOLO_ADMINISTRADOR} />
          <CampoTexto
            etiqueta="Rol"
            value={perfil.rol.nombre}
            readOnly
            ayuda={esAdministrador ? AYUDA_ROL_ADMINISTRADOR : AYUDA_SOLO_ADMINISTRADOR}
          />
          {errorGuardar && (
            <Alerta tipo="error" titulo={errorGuardar.titulo}>
              {errorGuardar.mensaje}
            </Alerta>
          )}
          <div className={estilos.acciones}>
            <Boton type="submit" cargando={guardando} etiquetaCargando="Guardando…">
              Guardar cambios
            </Boton>
            <Boton jerarquia="secundario" onClick={descartar}>
              Descartar cambios
            </Boton>
          </div>
        </form>
      </section>

      {notificacion && (
        <Notificacion
          titulo="Cambios guardados"
          mensaje="Sus datos se actualizaron."
          onCerrar={() => setNotificacion(false)}
        />
      )}

      {bloqueo.state === "blocked" && (
        <DialogoConfirmacion
          titulo="¿Descartar los cambios?"
          mensaje="Cambió sus datos y no los ha guardado. Si continúa, se perderán los cambios."
          etiquetaConfirmar="Descartar cambios"
          etiquetaCancelar="Seguir editando"
          onConfirmar={() => bloqueo.proceed()}
          onCancelar={() => bloqueo.reset()}
        />
      )}
    </>
  );
}
