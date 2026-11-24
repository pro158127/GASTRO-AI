// Pantalla W-10 · Crear usuario (Figma 48:1024). RF-U05, flujo F4.
// Estados: W-10b creando (99:2447), W-10c correo ya registrado (99:2593), W-10d la cuenta se creó
// pero el correo falló (99:2739) y el diálogo D-11 al salir con datos escritos (100:4211). Al
// terminar bien se vuelve a la lista con la notificación de W-09e (99:2331).
//
// Decisiones del equipo sobre lo que Figma dibuja y la API entrega:
// - El rol va como grupo de opciones (radios), que es lo que dibuja W-10; no hay lista desplegable.
//   Las etiquetas salen de `GET /catalogos/roles` (consulta U-16, ya resuelta): son las mismas que
//   el servidor manda luego como `rol_nombre`. Mientras el catálogo carga o si falla, el campo lo
//   explica y ofrece reintentar (ver CampoRol).
// - Teléfono (opcional) no está dibujado en W-10, pero el endpoint lo acepta y los requisitos v5 lo
//   contemplan. Pendiente de agregar a Figma.
// - W-10d: Figma no dibuja «Reintentar envío» (manda a Cuentas pendientes, W-20, que todavía no
//   existe) y deja «Crear usuario» activo aunque la cuenta YA esté creada. Aquí se reintenta en la
//   misma pantalla y el formulario pasa a solo lectura, para no crear dos cuentas. Al salir de ese
//   estado se deja una notificación propia, para que el administrador no crea que no pasó nada.
//   Todo esto está pendiente de agregar a Figma.
// - W-10b: la nota de la pantalla dice «Creando usuario…»; el dibujo muestra el texto por defecto
//   del componente («Procesando…»). Se usa el de la nota.
// - No hay estado de carga inicial: la pantalla no consulta nada al montarse.
//
// Seguridad: la contraseña temporal nunca llega al frontend, no se muestra ni se registra. El
// correo solo vive en el estado de este componente y en el traspaso en memoria a W-09e: nada va a
// la URL, al almacenamiento del navegador ni a la consola.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useBlocker, useNavigate } from "react-router";
import type { BlockerFunction } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoRol, { useRoles } from "../components/CampoRol";
import CampoTexto from "../components/CampoTexto";
import DialogoConfirmacion from "../components/DialogoConfirmacion";
import EncabezadoPagina from "../components/EncabezadoPagina";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import { crearUsuario, reenviarCredencial } from "../services/usuariosAdmin";
import { useSesion } from "../sesion/ProveedorSesion";
import type { RolUsuario } from "../types";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import { dejarNotificacion } from "../utils/notificacionPendiente";
import {
  LONGITUD_MAXIMA_CORREO,
  LONGITUD_MAXIMA_NOMBRE,
  LONGITUD_MAXIMA_TELEFONO,
  esCorreoValido,
  esNombreValido,
  esTelefonoValido,
  normalizarTelefono,
} from "../utils/validacionUsuario";
import estilos from "./CrearUsuario.module.css";

const RUTA_LISTA = "/usuarios";

type CampoFormulario = "nombre" | "apellido" | "telefono" | "correo" | "rol";

/** Orden visual: decide a qué campo va el foco cuando hay varios con error. */
const ORDEN_CAMPOS: CampoFormulario[] = ["nombre", "apellido", "telefono", "correo", "rol"];

interface ValoresFormulario {
  nombre: string;
  apellido: string;
  telefono: string;
  correo: string;
  rol: RolUsuario;
}

type ErroresFormulario = Partial<Record<CampoFormulario, string>>;

/** W-10 dibuja «Doctor/Gastroenterólogo» ya seleccionado. */
const ROL_POR_DEFECTO: RolUsuario = "DOCTOR";

const VALORES_INICIALES: ValoresFormulario = {
  nombre: "",
  apellido: "",
  telefono: "",
  correo: "",
  rol: ROL_POR_DEFECTO,
};

/** W-10 no deja crear la cuenta si el catálogo de roles no cargó: no se elige a ciegas. */
const AVISO_SIN_ROLES: AvisoError = {
  titulo: "No se pudieron cargar los roles",
  mensaje:
    "La cuenta no se puede crear sin elegir un rol. Reintente la carga de los roles e intente de nuevo.",
};

/** Textos por campo. Se eligen por campo, nunca con el `mensaje` del servidor. */
const MENSAJES_ERROR: Record<CampoFormulario, string> = {
  nombre: "Escriba el nombre.",
  apellido: "Escriba el apellido.",
  telefono: "Escriba un teléfono de 7 a 15 dígitos; puede empezar con +.",
  correo: "Escriba un correo electrónico válido, por ejemplo nombre@usc.edu.co.",
  rol: "Elija un rol.",
};

/** W-10c (Figma 99:2593), palabra por palabra. */
const MENSAJE_CORREO_DUPLICADO =
  "Ya existe una cuenta con este correo. Use otro correo o busque la cuenta en Usuarios.";

const AYUDA_CORREO =
  "Aquí llegará la contraseña temporal. No se puede repetir un correo ya registrado.";

/** Vigencia fija de la temporal (RNF-27). El servidor no la devuelve como número. */
const AVISO_TEMPORAL = {
  titulo: "Contraseña temporal",
  mensaje:
    "Al crear la cuenta se generará una contraseña temporal válida por 72 horas, que se enviará solo al correo registrado. La persona deberá cambiarla en su primer ingreso.",
};

function esCampoFormulario(campo: string): campo is CampoFormulario {
  return (ORDEN_CAMPOS as string[]).includes(campo);
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

/** La cuenta que quedó creada cuando el correo falló (W-10d). */
interface CuentaCreada {
  id: string;
  correo: string;
}

export default function CrearUsuario({ titulo }: { titulo: string }) {
  const { autenticado } = useSesion();
  const navegar = useNavigate();
  const catalogoRoles = useRoles();
  const idBase = useId();
  const idCampo = (campo: CampoFormulario) => `${idBase}-${campo}`;

  const [valores, setValores] = useState<ValoresFormulario>(VALORES_INICIALES);
  const [errores, setErrores] = useState<ErroresFormulario>({});
  const [avisoFormulario, setAvisoFormulario] = useState<AvisoError | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cuentaCreada, setCuentaCreada] = useState<CuentaCreada | null>(null);
  const [avisoCorreoFallido, setAvisoCorreoFallido] = useState<AvisoError | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const enviandoRef = useRef(false);

  // Con la cuenta ya creada el formulario queda de solo lectura: volver a enviarlo crearía una
  // segunda cuenta o chocaría con CORREO_YA_REGISTRADO.
  const bloqueado = cuentaCreada !== null;

  const hayDatos =
    valores.nombre !== "" ||
    valores.apellido !== "" ||
    valores.telefono !== "" ||
    valores.correo !== "" ||
    valores.rol !== ROL_POR_DEFECTO;

  // D-11 solo tiene sentido mientras haya algo que descartar: con la cuenta ya creada no hay nada
  // que perder y el texto del diálogo sería falso. Con la sesión cerrada tampoco se pregunta.
  const avisarAlSalir = hayDatos && autenticado && !bloqueado;
  const avisarAlSalirRef = useRef(avisarAlSalir);
  avisarAlSalirRef.current = avisarAlSalir;

  const debeBloquear = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      avisarAlSalirRef.current && currentLocation.pathname !== nextLocation.pathname,
    []
  );
  const bloqueo = useBlocker(debeBloquear);

  // Recargar o cerrar la pestaña con datos escritos: aviso nativo del navegador.
  useEffect(() => {
    if (!avisarAlSalir) return;
    function alSalir(evento: BeforeUnloadEvent) {
      evento.preventDefault();
      evento.returnValue = "";
    }
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [avisarAlSalir]);

  function cambiar(campo: CampoFormulario, valor: string) {
    setValores((previos) => ({ ...previos, [campo]: valor }));
    // El error de ese campo se quita al corregirlo; lo escrito nunca se borra.
    setErrores((previos) => (previos[campo] ? { ...previos, [campo]: undefined } : previos));
  }

  function enfocarPrimerError(conError: ErroresFormulario) {
    const campo = ORDEN_CAMPOS.find((c) => conError[c]);
    if (!campo) return;
    // El grupo de radios no es un control único: el foco va a su primera opción, que ahora sale
    // del catálogo y no de una lista fija.
    const primerRol = catalogoRoles.roles[0]?.codigo;
    const id = campo === "rol" && primerRol ? `${idCampo("rol")}-${primerRol}` : idCampo(campo);
    document.getElementById(id)?.focus();
  }

  /**
   * Sale saltándose D-11. Es solo para cuando ya NO hay nada que descartar: la cuenta quedó
   * creada (con el correo enviado o fallido) y preguntar «¿descartar el usuario que estaba
   * creando?» sería falso. «Cancelar» no usa esto: ver `cancelar`.
   */
  function salirSinPreguntar() {
    avisarAlSalirRef.current = false;
    navegar(RUTA_LISTA);
  }

  /**
   * «Cancelar» (W-10). Navega por el camino normal, sin tocar `avisarAlSalirRef`, así que pasa
   * por `useBlocker` igual que al salir desde el menú lateral: con datos escritos abre D-11
   * (RNF-08) y con el formulario vacío no bloquea y sale directo.
   */
  function cancelar() {
    navegar(RUTA_LISTA);
  }

  function irALaListaConExito(correo: string) {
    dejarNotificacion({
      titulo: "Usuario creado",
      mensaje: `Se envió la contraseña temporal a ${correo}. La cuenta aparece en Cuentas pendientes hasta su primer ingreso.`,
    });
    salirSinPreguntar();
  }

  /**
   * W-10d → lista. Avisar es obligatorio: si se saliera en silencio, el administrador creería que
   * no pasó nada, lo intentaría otra vez y chocaría con CORREO_YA_REGISTRADO.
   */
  function irALaListaSinCorreo(correo: string) {
    dejarNotificacion({
      titulo: "Usuario creado, correo no enviado",
      mensaje: `La cuenta de ${correo} quedó creada, pero la contraseña temporal no se pudo enviar. Reintente el envío desde Cuentas pendientes.`,
    });
    salirSinPreguntar();
  }

  /**
   * Traduce el error de la API a errores por campo. Lo que no corresponde a un campo de este
   * formulario NO se descarta en silencio: vuelve como aviso general.
   */
  function repartirError(error: unknown): { porCampo: ErroresFormulario; general: AvisoError | null } {
    const porCampo: ErroresFormulario = {};
    const ajenos: string[] = [];

    if (error instanceof ErrorApi) {
      const duplicado = error.codigo === CodigoErrorApi.CORREO_YA_REGISTRADO;
      const invalidos = error.codigo === CodigoErrorApi.DATOS_INVALIDOS;
      if (duplicado || invalidos) {
        for (const { campo } of error.campos) {
          if (!esCampoFormulario(campo)) {
            ajenos.push(campo);
          } else if (duplicado && campo === "correo") {
            porCampo.correo = MENSAJE_CORREO_DUPLICADO;
          } else {
            porCampo[campo] = MENSAJES_ERROR[campo];
          }
        }
        // 409 CORREO_YA_REGISTRADO siempre trae `campos`, pero si llegara sin ellos el error es
        // del correo igual.
        if (duplicado && porCampo.correo === undefined && ajenos.length === 0) {
          porCampo.correo = MENSAJE_CORREO_DUPLICADO;
        }
        if (ajenos.length > 0) {
          return {
            porCampo,
            general: {
              titulo: "No se pudo crear la cuenta",
              mensaje: `El servidor rechazó un dato que este formulario no muestra (${ajenos.join(", ")}). Informe al administrador.`,
            },
          };
        }
        // Si no se pudo señalar ningún campo, el error no puede quedar sin mostrarse.
        if (Object.keys(porCampo).length === 0) {
          return {
            porCampo,
            general: {
              titulo: "No se pudo crear la cuenta",
              mensaje: "El servidor rechazó los datos. Revíselos e intente de nuevo.",
            },
          };
        }
        return { porCampo, general: null };
      }
    }
    // Red caída (W-30), 5xx (W-31) o cualquier otro sin tratamiento propio.
    return { porCampo: {}, general: avisoDeError(error) };
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Guarda contra el doble envío: el botón ya está en «cargando», pero Enter en un campo envía
    // el formulario sin pasar por el clic del botón.
    if (enviandoRef.current || bloqueado) return;
    setAvisoFormulario(null);

    // Sin catálogo no hay opciones de rol a la vista: crear la cuenta con el valor por omisión
    // sería elegir por el administrador.
    if (catalogoRoles.roles.length === 0) {
      setAvisoFormulario(AVISO_SIN_ROLES);
      return;
    }

    const conError = validar(valores);
    setErrores(conError);
    if (Object.keys(conError).length > 0) {
      enfocarPrimerError(conError);
      return;
    }

    enviandoRef.current = true;
    setEnviando(true);
    try {
      const { usuario, credencial } = await crearUsuario({
        nombre: valores.nombre,
        apellido: valores.apellido,
        correo: valores.correo,
        telefono: valores.telefono,
        rol: valores.rol,
      });
      // El servidor devuelve el correo ya normalizado; si viniera vacío se usa el escrito.
      const correo = usuario.correo ?? valores.correo.trim();
      if (credencial.estado === "ENVIADO") {
        irALaListaConExito(correo);
        return;
      }
      // W-10d: la cuenta quedó creada, el correo no salió (credencial.codigo_error =
      // CORREO_NO_ENVIADO). Se ofrece reintentar aquí mismo.
      setCuentaCreada({ id: usuario.id, correo });
      setAvisoCorreoFallido({
        titulo: "La cuenta se creó, pero no se pudo enviar el correo",
        mensaje: `La contraseña temporal no llegó a ${correo}. Reintente el envío aquí o más tarde desde Cuentas pendientes, cuando el envío de correo funcione.`,
      });
    } catch (error) {
      if (esErrorGlobal(error)) return;
      const { porCampo, general } = repartirError(error);
      setErrores(porCampo);
      setAvisoFormulario(general);
      if (Object.keys(porCampo).length > 0) enfocarPrimerError(porCampo);
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  async function reintentarEnvio() {
    if (cuentaCreada === null || reenviando) return;
    setReenviando(true);
    try {
      const { credencial } = await reenviarCredencial(cuentaCreada.id);
      if (credencial.estado === "ENVIADO") {
        irALaListaConExito(cuentaCreada.correo);
        return;
      }
      setAvisoCorreoFallido({
        titulo: "El correo sigue sin salir",
        mensaje: `La contraseña temporal tampoco llegó a ${cuentaCreada.correo}. La cuenta está creada: reintente más tarde desde Cuentas pendientes.`,
      });
    } catch (error) {
      if (esErrorGlobal(error)) return;
      if (error instanceof ErrorApi && error.codigo === CodigoErrorApi.TRANSICION_INVALIDA) {
        setAvisoCorreoFallido({
          titulo: "La cuenta ya se activó",
          mensaje: `${cuentaCreada.correo} ya cambió su contraseña temporal, así que no hace falta reenviarla.`,
        });
        return;
      }
      setAvisoCorreoFallido(avisoDeError(error));
    } finally {
      setReenviando(false);
    }
  }

  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Registre los datos de la persona. El sistema le enviará sus credenciales de acceso."
      />

      <section className={estilos.tarjeta} aria-labelledby={`${idBase}-titulo`}>
        <h2 id={`${idBase}-titulo`} className={estilos.soloLector}>
          Datos del nuevo usuario
        </h2>
        <form className={estilos.formulario} noValidate onSubmit={enviar}>
          <div className={estilos.fila}>
            <CampoTexto
              id={idCampo("nombre")}
              etiqueta="Nombre"
              value={valores.nombre}
              onChange={(e) => cambiar("nombre", e.target.value)}
              mensajeError={errores.nombre}
              maxLength={LONGITUD_MAXIMA_NOMBRE}
              autoComplete="given-name"
              readOnly={bloqueado}
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
              readOnly={bloqueado}
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
            maxLength={LONGITUD_MAXIMA_TELEFONO}
            autoComplete="tel"
            readOnly={bloqueado}
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
            readOnly={bloqueado}
            required
          />

          <CampoRol
            estado={catalogoRoles}
            id={idCampo("rol")}
            nombre={`${idBase}-rol`}
            etiqueta="Rol"
            valor={valores.rol}
            onCambio={(rol) => cambiar("rol", rol)}
            mensajeError={errores.rol}
            disabled={bloqueado}
          />

          {avisoCorreoFallido ? (
            <Alerta tipo="error" titulo={avisoCorreoFallido.titulo}>
              {avisoCorreoFallido.mensaje}
            </Alerta>
          ) : (
            <Alerta tipo="info" titulo={AVISO_TEMPORAL.titulo}>
              {AVISO_TEMPORAL.mensaje}
            </Alerta>
          )}

          {avisoFormulario && (
            <Alerta tipo="error" titulo={avisoFormulario.titulo}>
              {avisoFormulario.mensaje}
            </Alerta>
          )}

          <div className={estilos.acciones}>
            {bloqueado ? (
              <>
                <Boton
                  jerarquia="secundario"
                  onClick={() => irALaListaSinCorreo(cuentaCreada.correo)}
                >
                  Volver a Usuarios
                </Boton>
                <Boton cargando={reenviando} etiquetaCargando="Reenviando…" onClick={reintentarEnvio}>
                  Reintentar envío
                </Boton>
              </>
            ) : (
              <>
                <Boton jerarquia="secundario" onClick={cancelar}>
                  Cancelar
                </Boton>
                <Boton type="submit" cargando={enviando} etiquetaCargando="Creando usuario…">
                  Crear usuario
                </Boton>
              </>
            )}
          </div>
        </form>
      </section>

      {/* D-11 (Figma 100:4211). Sale tanto al pulsar «Cancelar» como al navegar desde el menú. */}
      {bloqueo.state === "blocked" && (
        <DialogoConfirmacion
          titulo="¿Descartar el usuario que estaba creando?"
          mensaje="Escribió datos que todavía no se han guardado. Si sale ahora, se perderán y no se creará la cuenta."
          etiquetaConfirmar="Descartar"
          etiquetaCancelar="Seguir editando"
          onConfirmar={() => bloqueo.proceed()}
          onCancelar={() => bloqueo.reset()}
        />
      )}
    </>
  );
}
