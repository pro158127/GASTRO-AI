// W-11f · Editar información (Figma 99:3552; RF-U07 CA 4). La edición ocurre dentro de la misma
// tarjeta «Datos de la cuenta» de W-11: no es otra pantalla ni un diálogo.
//
// Decisiones del equipo:
// - Se editan nombre, apellido, teléfono y correo. Figma no dibuja el teléfono, pero W-10 deja
//   ponerlo al crear la cuenta y el PATCH lo acepta: sin él sería un dato que se escribe una vez y
//   no se puede corregir nunca. Misma validación que W-10. Pendiente de agregar a Figma.
// - La ayuda del correo dice lo que el servidor hace de verdad. Figma añade que «la persona deberá
//   activar su cuenta otra vez» y la nota de la pantalla habla de volver a vincular la aplicación
//   autenticadora: ninguna de las dos cosas ocurre. `PATCH` emite una contraseña temporal nueva y
//   cierra las sesiones abiertas; el estado de la cuenta no cambia y el segundo factor sigue
//   vinculado (solo `restablecer-contrasena` lo desvincula). Pendiente de confirmar con diseño.
// - Salir con cambios sin guardar pregunta antes de descartarlos, como W-18e en Mi perfil: el
//   mismo gesto no puede preguntar en una pantalla y perder lo escrito en otra. Vale tanto para
//   «Cancelar» como para irse a otra ruta. Pendiente de agregar a Figma.
//
// Un 200 no quiere decir que el correo haya salido: con `credencial.estado` FALLIDO el correo sí
// quedó cambiado, pero el aviso no se envió, y eso no se muestra como éxito.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useBlocker } from "react-router";
import type { BlockerFunction } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoTexto from "../components/CampoTexto";
import DialogoConfirmacion from "../components/DialogoConfirmacion";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import { editarUsuario } from "../services/usuariosAdmin";
import type { UsuarioDetalle } from "../types";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import {
  LONGITUD_MAXIMA_CORREO,
  LONGITUD_MAXIMA_NOMBRE,
  LONGITUD_MAXIMA_TELEFONO,
  esCorreoValido,
  esNombreValido,
  esTelefonoValido,
  normalizarCorreo,
  normalizarTelefono,
} from "../utils/validacionUsuario";
import type { ResultadoAccion } from "./DetalleCuenta";
import estilos from "./DetalleCuenta.module.css";

type CampoEditable = "nombre" | "apellido" | "telefono" | "correo";

/** Orden visual: decide a qué campo va el foco cuando hay varios con error. */
const ORDEN_CAMPOS: CampoEditable[] = ["nombre", "apellido", "telefono", "correo"];

interface ValoresFormulario {
  nombre: string;
  apellido: string;
  telefono: string;
  correo: string;
}

type ErroresFormulario = Partial<Record<CampoEditable, string>>;

/** Textos por campo. Se eligen por campo, nunca con el `mensaje` del servidor. */
const MENSAJES_ERROR: Record<CampoEditable, string> = {
  nombre: "Escriba el nombre.",
  apellido: "Escriba el apellido.",
  telefono: "Escriba un teléfono de 7 a 15 dígitos; puede empezar con +.",
  correo: "Escriba un correo electrónico válido, por ejemplo nombre@usc.edu.co.",
};

/** Mismo texto que W-10c, que es el mismo caso: el correo ya es de otra cuenta. */
const MENSAJE_CORREO_DUPLICADO =
  "Ya existe una cuenta con este correo. Use otro correo o busque la cuenta en Usuarios.";

const AYUDA_CORREO =
  "Si cambia el correo, se enviará una contraseña temporal nueva (72 h) al correo nuevo, se cerrarán " +
  "las sesiones abiertas de la cuenta y la persona deberá usar esa contraseña en su próximo ingreso " +
  "(RF-U07 CA 7).";

function valoresDesdeUsuario(usuario: UsuarioDetalle): ValoresFormulario {
  return {
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    telefono: usuario.telefono ?? "",
    correo: usuario.correo ?? "",
  };
}

function validar(valores: ValoresFormulario): ErroresFormulario {
  const errores: ErroresFormulario = {};
  if (!esNombreValido(valores.nombre)) errores.nombre = MENSAJES_ERROR.nombre;
  if (!esNombreValido(valores.apellido)) errores.apellido = MENSAJES_ERROR.apellido;
  if (!esCorreoValido(valores.correo)) errores.correo = MENSAJES_ERROR.correo;
  // El teléfono es opcional: solo se valida si se escribió algo.
  const telefono = normalizarTelefono(valores.telefono);
  if (telefono !== "" && !esTelefonoValido(telefono)) errores.telefono = MENSAJES_ERROR.telefono;
  return errores;
}

function esCampoEditable(campo: string): campo is CampoEditable {
  return (ORDEN_CAMPOS as string[]).includes(campo);
}

interface PropiedadesFormularioDatosCuenta {
  usuario: UsuarioDetalle;
  /** Con la sesión cerrada (manual o por inactividad) no se avisa de los cambios sin guardar. */
  autenticado: boolean;
  /** Filas de solo lectura de la tarjeta (rol, estado, fechas), que aquí no se editan. */
  filasFijas: ReactNode;
  /** El PATCH terminó: la pantalla sale de la edición, cuenta lo que pasó y recarga el detalle. */
  alGuardar: (resultado: ResultadoAccion) => void;
  alCancelar: () => void;
}

export default function FormularioDatosCuenta({
  usuario,
  autenticado,
  filasFijas,
  alGuardar,
  alCancelar,
}: PropiedadesFormularioDatosCuenta) {
  const idBase = useId();
  const idCampo = (campo: CampoEditable) => `${idBase}-${campo}`;

  const [guardado] = useState<ValoresFormulario>(() => valoresDesdeUsuario(usuario));
  const [valores, setValores] = useState<ValoresFormulario>(guardado);
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [errorGuardar, setErrorGuardar] = useState<AvisoError | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** «Cancelar» con cambios sin guardar: el mismo diálogo que al navegar. */
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const guardandoRef = useRef(false);

  const hayCambios =
    valores.nombre !== guardado.nombre ||
    valores.apellido !== guardado.apellido ||
    valores.telefono !== guardado.telefono ||
    valores.correo !== guardado.correo;
  const avisarAlSalir = hayCambios && autenticado && !guardando;

  // El bloqueo lee siempre el valor actual, no el del render en que se creó.
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

  /** Cancelar: con cambios pregunta primero; sin cambios sale directo. */
  function cancelar() {
    if (hayCambios) {
      setConfirmandoCancelar(true);
      return;
    }
    alCancelar();
  }

  /**
   * Reparte el error de la API entre los campos. Lo que no corresponde a un campo de este
   * formulario no se descarta en silencio: vuelve como aviso general.
   */
  function repartirError(causa: unknown): { porCampo: ErroresFormulario; general: AvisoError | null } {
    const porCampo: ErroresFormulario = {};
    const ajenos: string[] = [];

    if (causa instanceof ErrorApi) {
      const duplicado = causa.codigo === CodigoErrorApi.CORREO_YA_REGISTRADO;
      const invalidos = causa.codigo === CodigoErrorApi.DATOS_INVALIDOS;
      if (duplicado || invalidos) {
        for (const { campo } of causa.campos) {
          if (!esCampoEditable(campo)) ajenos.push(campo);
          else if (duplicado && campo === "correo") porCampo.correo = MENSAJE_CORREO_DUPLICADO;
          else porCampo[campo] = MENSAJES_ERROR[campo];
        }
        // El 409 siempre trae `campos`, pero si llegara sin ellos el error es del correo igual.
        if (duplicado && porCampo.correo === undefined && ajenos.length === 0) {
          porCampo.correo = MENSAJE_CORREO_DUPLICADO;
        }
        if (ajenos.length > 0) {
          return {
            porCampo,
            general: {
              titulo: "No se pudieron guardar los cambios",
              mensaje: `El servidor rechazó un dato que este formulario no muestra (${ajenos.join(", ")}). Informe al administrador.`,
            },
          };
        }
        if (Object.keys(porCampo).length === 0) {
          return {
            porCampo,
            general: {
              titulo: "No se pudieron guardar los cambios",
              mensaje: "El servidor rechazó los datos. Revíselos e intente de nuevo.",
            },
          };
        }
        return { porCampo, general: null };
      }
      if (causa.codigo === CodigoErrorApi.NO_ENCONTRADO) {
        return {
          porCampo,
          general: {
            titulo: "Esta cuenta ya no existe",
            mensaje: "Se eliminó mientras tenía esta pantalla abierta, así que no se guardó nada.",
          },
        };
      }
    }
    // Red caída (W-30), 5xx (W-31) o cualquier otro sin tratamiento propio.
    return { porCampo: {}, general: avisoDeError(causa) };
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Guarda contra el doble envío: Enter en un campo no pasa por el clic del botón.
    if (guardandoRef.current) return;
    setErrorGuardar(null);

    const conError = validar(valores);
    setErrores(conError);
    if (Object.keys(conError).length > 0) {
      enfocarPrimerError(conError);
      return;
    }

    guardandoRef.current = true;
    setGuardando(true);
    try {
      const { credencial } = await editarUsuario(usuario.id, {
        nombre: valores.nombre,
        apellido: valores.apellido,
        telefono: valores.telefono,
        correo: valores.correo,
      });
      const correoNuevo = normalizarCorreo(valores.correo);
      // `credencial` solo viene si el correo cambió de verdad (lo decide el servidor).
      if (credencial && credencial.estado === "FALLIDO") {
        alGuardar({
          aviso: {
            titulo: "No se pudo enviar el correo",
            mensaje:
              `El correo de la cuenta quedó cambiado a ${correoNuevo} y se cerraron sus sesiones abiertas, ` +
              "pero el aviso con la contraseña temporal no salió. Envíe una contraseña nueva desde esta " +
              "pantalla cuando el correo vuelva a funcionar.",
          },
        });
        return;
      }
      alGuardar({
        notificacion: {
          titulo: "Cambios guardados",
          mensaje: credencial
            ? `Los datos de la cuenta se actualizaron y se envió una contraseña temporal a ${correoNuevo}.`
            : "Los datos de la cuenta se actualizaron.",
        },
      });
    } catch (causa: unknown) {
      if (esErrorGlobal(causa)) return;
      const { porCampo, general } = repartirError(causa);
      setErrores(porCampo);
      setErrorGuardar(general);
      if (Object.keys(porCampo).length > 0) enfocarPrimerError(porCampo);
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  }

  const bloqueada = bloqueo.state === "blocked";

  return (
    <>
      <section className={estilos.tarjeta} aria-labelledby={`${idBase}-titulo`}>
        <h2 id={`${idBase}-titulo`} className={estilos.tituloTarjeta}>
          Datos de la cuenta
        </h2>
        <form className={estilos.formulario} noValidate onSubmit={enviar}>
          <CampoTexto
            id={idCampo("nombre")}
            etiqueta="Nombre"
            value={valores.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)}
            mensajeError={errores.nombre}
            maxLength={LONGITUD_MAXIMA_NOMBRE}
            autoComplete="given-name"
            required
          />
          <CampoTexto
            id={idCampo("apellido")}
            etiqueta="Apellido"
            value={valores.apellido}
            onChange={(e) => cambiar("apellido", e.target.value)}
            mensajeError={errores.apellido}
            maxLength={LONGITUD_MAXIMA_NOMBRE}
            autoComplete="family-name"
            required
          />
          <CampoTexto
            id={idCampo("telefono")}
            etiqueta="Teléfono (opcional)"
            type="tel"
            inputMode="tel"
            value={valores.telefono}
            onChange={(e) => cambiar("telefono", e.target.value)}
            mensajeError={errores.telefono}
            maxLength={LONGITUD_MAXIMA_TELEFONO}
            autoComplete="tel"
          />
          <CampoTexto
            id={idCampo("correo")}
            etiqueta="Correo electrónico"
            type="email"
            inputMode="email"
            value={valores.correo}
            onChange={(e) => cambiar("correo", e.target.value)}
            mensajeError={errores.correo}
            ayuda={AYUDA_CORREO}
            maxLength={LONGITUD_MAXIMA_CORREO}
            autoComplete="email"
            spellCheck={false}
            required
          />

          <dl className={estilos.datos}>{filasFijas}</dl>

          {errorGuardar && (
            <Alerta tipo="error" titulo={errorGuardar.titulo}>
              {errorGuardar.mensaje}
            </Alerta>
          )}

          <div className={estilos.accionesFormulario}>
            <Boton type="submit" cargando={guardando} etiquetaCargando="Guardando…">
              Guardar cambios
            </Boton>
            <Boton jerarquia="secundario" aria-disabled={guardando || undefined} onClick={cancelar}>
              Cancelar
            </Boton>
          </div>
        </form>
      </section>

      {/* Mismo diálogo para «Cancelar» y para irse a otra ruta (patrón de W-18e). */}
      {(bloqueada || confirmandoCancelar) && (
        <DialogoConfirmacion
          titulo="¿Descartar los cambios?"
          mensaje="Cambió los datos de la cuenta y no los ha guardado. Si continúa, se perderán los cambios."
          etiquetaConfirmar="Descartar cambios"
          etiquetaCancelar="Seguir editando"
          onConfirmar={() => {
            if (bloqueada) {
              bloqueo.proceed?.();
              return;
            }
            setConfirmandoCancelar(false);
            alCancelar();
          }}
          onCancelar={() => {
            if (bloqueada) {
              bloqueo.reset?.();
              return;
            }
            setConfirmandoCancelar(false);
          }}
        />
      )}
    </>
  );
}
