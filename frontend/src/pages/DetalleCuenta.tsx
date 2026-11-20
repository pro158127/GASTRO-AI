// Pantalla W-11 · Detalle de cuenta (Figma 48:1161). RF-U07, RF-U08, RF-U09, RF-U12; flujo F5.
// Estados: W-11b bloqueada (99:2887), W-11c desactivada (99:3055), W-11d pendiente de activación
// (99:3220), W-11i último administrador activo (165:18887), W-11f editar información (99:3552),
// W-11g cuenta activada con un clic (164:47343) y W-11h cuenta desbloqueada con un clic
// (164:47517). Diálogos: D-04 cambiar rol (100:3379), D-05 último administrador (100:3484) y D-06
// con el texto propio de esta pantalla (el de W-20 dice otra cosa).
//
// Alcance: esta tarea no incluye desactivar, eliminar ni reasignar casos (W-25, D-01, D-02, D-08,
// D-09, D-10). Figma los dibuja en W-11, pero aquí **no se pintan botones que no hacen nada**: no
// existen la tarjeta «Acción irreversible» ni el botón «Desactivar cuenta». La tarjeta «Estado de
// la cuenta» solo aparece cuando la acción que ofrece sí existe, es decir «Activar cuenta» en una
// cuenta inactiva (W-11c → W-11g). Por lo mismo, la alerta de W-11i menciona solo el cambio de
// rol. Todo esto entra con la tarea de desactivar y eliminar.
//
// Decisiones del equipo sobre lo que Figma dibuja y la API entrega:
// - La IP del bloqueo (W-11b, «desde la IP 203.0.113.45») **no viene** en el detalle: el contrato
//   dice que se consulta en la bitácora filtrando por el usuario. La frase se arma sin ella, con
//   `bloqueado_en`, `intentos_fallidos` y `bloqueado_hasta` (consulta U-18 en CONTRATOS_API.md).
// - «Último administrador activo» no es un campo del detalle: se deduce preguntando si queda otro
//   administrador activo (ver `hayOtroAdministradorActivo`). Se deshabilita la acción **y** se
//   atiende igual el 409 del servidor, que es la autoridad (RF-U03 CA 4, propuesta U-19).
// - W-11c pide explicar «por qué» se desactivó; la API no guarda un motivo. Se dice desde cuándo
//   y, si el último traslado fue el de la desactivación, cuántos casos se reasignaron (U-20).
// - El botón de contraseña usa dos rutas distintas según el estado: en una cuenta pendiente
//   `reenviar-credencial`, que deja el motivo CREACION en la bitácora y es lo que describe W-11d;
//   en una cuenta activa `restablecer-contrasena` (motivo RESTABLECIMIENTO), que además desvincula
//   la aplicación autenticadora y quita el bloqueo. Las dos rutas aceptan cuentas pendientes y
//   activas; la que no admite ninguna es la cuenta inactiva (409 TRANSICION_INVALIDA), así que ahí
//   el botón queda deshabilitado con la razón al lado.
// - Ninguna acción devuelve el detalle completo (responden `UsuarioResumen`), así que después de
//   cada una se vuelve a pedir `GET /admin/usuarios/{id}`.
// - Teléfono: Figma no lo dibuja en W-11 ni en W-11f, pero W-10 deja ponerlo al crear la cuenta y
//   el PATCH lo acepta; sin él sería un dato que se escribe una vez y no se puede corregir nunca.
//   Se muestra en la tarjeta y se edita, con la misma validación de W-10. Pendiente en Figma.
// - W-11f avisa antes de descartar cambios sin guardar, como W-18e en Mi perfil: el mismo gesto no
//   puede preguntar en una pantalla y perder los datos en otra. Pendiente de agregar a Figma.
// - La migaja «Usuarios › Ana Pérez» de la barra superior necesitaría cambiar la disposición y
//   pasarle un nombre que llega por red: la barra sigue diciendo «Detalle de cuenta» y el nombre
//   va en el h1, como en el cuerpo de Figma. Pendiente de hablar con diseño.
// - El botón «Desbloquear cuenta» va sin el ícono de candado abierto (12:622): ese ícono todavía
//   no existe en `components/iconos`. La etiqueta sola dice qué hace. Pendiente.
// - **Vacío de diseño, no descuido del código:** el detalle no muestra los casos activos ni si la
//   aplicación autenticadora está vinculada, aunque `UsuarioDetalle` trae `casos_activos` y
//   `totp_vinculado`. La tarjeta «Datos de la cuenta» de Figma tiene exactamente siete filas en
//   todas las variantes (nombre, apellido, correo, rol, estado, cuenta creada y primer ingreso) y
//   ninguna otra parte de W-11 los dibuja: lo único que nombra el segundo factor es el título de
//   la tarjeta de contraseña. Aquí `casos_activos` se usa, pero solo para deshabilitar el cambio
//   de rol y explicar por qué. Son dos datos útiles que el backend ya entrega; que se muestren o
//   no es decisión de diseño, no se agregan por cuenta propia.
//
// Seguridad: la contraseña temporal nunca llega al frontend, no se muestra ni se registra. El
// nombre, el correo y el teléfono solo viven en el estado de esta pantalla; el id va en la URL
// (es un UUID, no un dato personal) y nada se guarda en el navegador ni en la consola.
import { useEffect, useId, useRef, useState } from "react";
import { useParams } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import DialogoAviso from "../components/DialogoAviso";
import DialogoCambiarRol from "../components/DialogoCambiarRol";
import DialogoConfirmacion from "../components/DialogoConfirmacion";
import EncabezadoPagina from "../components/EncabezadoPagina";
import EnlaceBoton from "../components/EnlaceBoton";
import Esqueleto from "../components/Esqueleto";
import EstadoVacio from "../components/EstadoVacio";
import Insignia from "../components/Insignia";
import Notificacion from "../components/Notificacion";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import {
  activarUsuario,
  cambiarRol,
  desbloquearUsuario,
  hayOtroAdministradorActivo,
  obtenerUsuario,
  reenviarCredencial,
  restablecerContrasena,
} from "../services/usuariosAdmin";
import { useSesion } from "../sesion/ProveedorSesion";
import type { RolUsuario, UsuarioDetalle } from "../types";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import { fechaHoraCorta } from "../utils/fechas";
import { insigniaDeEstado, nombreCompleto } from "../utils/presentacionUsuario";
import FormularioDatosCuenta from "./DetalleCuentaFormulario";
import estilos from "./DetalleCuenta.module.css";

const RUTA_USUARIOS = "/usuarios";

/** Acción en curso: solo puede haber una a la vez. */
type AccionCuenta = "rol" | "contrasena" | "activar" | "desbloquear";

/** Lo que una acción deja en la pantalla: una notificación de éxito o una alerta persistente. */
export interface ResultadoAccion {
  notificacion?: { titulo: string; mensaje: string };
  aviso?: AvisoError;
}

type Carga =
  | { fase: "cargando" }
  | { fase: "error"; aviso: AvisoError }
  | { fase: "noEncontrado" }
  | { fase: "listo"; usuario: UsuarioDetalle; esUltimoAdministrador: boolean };

export default function DetalleCuenta({ titulo }: { titulo: string }) {
  const { id = "" } = useParams();
  const [intento, setIntento] = useState(0);
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  /** Cuenta cuyos datos ya se están mostrando, para distinguir la primera carga de una recarga. */
  const idMostradoRef = useRef<string | null>(null);

  useEffect(() => {
    let vigente = true;
    // Tras una acción se vuelve a pedir el detalle, pero la pantalla **no** se vacía: si volviera
    // al esqueleto perdería el foco y el aviso de lo que acaba de pasar. El esqueleto es solo
    // para la primera carga de esta cuenta.
    if (idMostradoRef.current !== id) setCarga({ fase: "cargando" });

    async function cargar() {
      try {
        const usuario = await obtenerUsuario(id);
        // Solo hace falta saberlo si la cuenta es un administrador activo: en cualquier otro caso
        // el servidor no protege nada y la consulta sobraría.
        const administradorActivo = usuario.rol === "ADMINISTRADOR" && usuario.estado === "ACTIVO";
        const esUltimoAdministrador = administradorActivo
          ? !(await hayOtroAdministradorActivo(usuario.id))
          : false;
        if (!vigente) return;
        idMostradoRef.current = id;
        // Objeto nuevo en cada carga: así la pantalla sabe que los datos se renovaron.
        setCarga({ fase: "listo", usuario, esUltimoAdministrador });
      } catch (causa: unknown) {
        if (!vigente || esErrorGlobal(causa)) return;
        idMostradoRef.current = null;
        if (causa instanceof ErrorApi && causa.codigo === CodigoErrorApi.NO_ENCONTRADO) {
          setCarga({ fase: "noEncontrado" });
          return;
        }
        setCarga({ fase: "error", aviso: avisoDeError(causa) });
      }
    }

    void cargar();
    return () => {
      vigente = false;
    };
  }, [id, intento]);

  function recargar() {
    setIntento((n) => n + 1);
  }

  if (carga.fase === "listo") {
    return (
      <CuentaCargada
        usuario={carga.usuario}
        esUltimoAdministrador={carga.esUltimoAdministrador}
        recargar={recargar}
      />
    );
  }

  return (
    <>
      <EncabezadoPagina titulo={titulo} />

      {carga.fase === "cargando" && <EsqueletoDetalle />}

      {carga.fase === "error" && (
        <div className={estilos.bloqueMensaje}>
          <Alerta tipo="error" titulo={carga.aviso.titulo}>
            {carga.aviso.mensaje}
          </Alerta>
          <div>
            <Boton jerarquia="secundario" onClick={recargar}>
              Reintentar
            </Boton>
          </div>
        </div>
      )}

      {carga.fase === "noEncontrado" && (
        <div className={estilos.bloqueMensaje}>
          <EstadoVacio
            nivelTitulo="h2"
            titulo="No encontramos esta cuenta"
            mensaje="Es posible que se haya eliminado o que el enlace esté equivocado."
          >
            <EnlaceBoton jerarquia="primario" to={RUTA_USUARIOS}>
              Ir a Usuarios
            </EnlaceBoton>
          </EstadoVacio>
        </div>
      )}
    </>
  );
}

/** Carga: la misma retícula de la pantalla, con tarjetas en gris. */
function EsqueletoDetalle() {
  return (
    <div className={estilos.cuerpo} aria-busy="true">
      <p className={estilos.soloLector} role="status">
        Cargando la cuenta…
      </p>
      <div className={estilos.columnaDatos}>
        <Esqueleto forma="tarjeta" />
      </div>
      <div className={estilos.columnaAcciones}>
        {[0, 1, 2].map((indice) => (
          <Esqueleto key={indice} forma="tarjeta" />
        ))}
      </div>
    </div>
  );
}

interface PropiedadesCuentaCargada {
  usuario: UsuarioDetalle;
  esUltimoAdministrador: boolean;
  recargar: () => void;
}

function CuentaCargada({ usuario, esUltimoAdministrador, recargar }: PropiedadesCuentaCargada) {
  const { autenticado } = useSesion();
  const [editando, setEditando] = useState(false);
  const [enviando, setEnviando] = useState<AccionCuenta | null>(null);
  const [dialogo, setDialogo] = useState<"rol" | "contrasena" | null>(null);
  /** Rol elegido en D-04. Vacío = todavía no eligió nada; el diálogo abre así a propósito. */
  const [rolElegido, setRolElegido] = useState<RolUsuario | "">("");
  const [avisoUltimoAdministrador, setAvisoUltimoAdministrador] = useState(false);
  const [notificacion, setNotificacion] = useState<{ titulo: string; mensaje: string } | null>(null);
  const [errorAccion, setErrorAccion] = useState<AvisoError | null>(null);

  const contenedorRef = useRef<HTMLDivElement>(null);

  // Tras una acción la tarjeta que tenía el foco puede desaparecer (por ejemplo «Activar cuenta»,
  // cuya tarjeta solo existe mientras la cuenta está inactiva). Si el foco cayó en <body>, se
  // lleva al contenido para no perderlo.
  useEffect(() => {
    if (document.activeElement === document.body) contenedorRef.current?.focus();
  }, [usuario]);

  const nombre = nombreCompleto(usuario);
  const correo = usuario.correo;
  const eliminada = usuario.estado === "ELIMINADO";
  const insignia = insigniaDeEstado(usuario);
  const hayAccionEnCurso = enviando !== null;

  /** Muestra lo que pasó y vuelve a pedir el detalle (las acciones no lo devuelven completo). */
  function terminarAccion(resultado: ResultadoAccion) {
    setErrorAccion(resultado.aviso ?? null);
    setNotificacion(resultado.notificacion ?? null);
    recargar();
  }

  /** Traduce el fallo de una acción: D-05 para el último administrador, alerta para el resto. */
  function avisoDeAccion(causa: unknown): AvisoError | null {
    if (causa instanceof ErrorApi) {
      if (causa.codigo === CodigoErrorApi.ULTIMO_ADMINISTRADOR) {
        setAvisoUltimoAdministrador(true);
        return null;
      }
      if (causa.codigo === CodigoErrorApi.CASOS_SIN_REASIGNAR) {
        return {
          titulo: "Primero hay que reasignar sus casos",
          mensaje: `${nombre} todavía tiene casos activos asignados. Reasígnelos a otro doctor antes de pasarla a administrador (RF-A06).`,
        };
      }
      if (causa.codigo === CodigoErrorApi.TRANSICION_INVALIDA) {
        return {
          titulo: "Esa acción ya no aplica a esta cuenta",
          mensaje: "El estado de la cuenta cambió mientras tenía esta pantalla abierta. Se actualizó la información.",
        };
      }
      if (causa.codigo === CodigoErrorApi.NO_ENCONTRADO) {
        return { titulo: "Esta cuenta ya no existe", mensaje: "Se eliminó mientras tenía esta pantalla abierta." };
      }
    }
    return avisoDeError(causa);
  }

  async function ejecutar(accion: AccionCuenta, tarea: () => Promise<ResultadoAccion>) {
    if (hayAccionEnCurso) return;
    setEnviando(accion);
    setErrorAccion(null);
    setNotificacion(null);
    try {
      terminarAccion(await tarea());
    } catch (causa: unknown) {
      if (esErrorGlobal(causa)) return;
      terminarAccion({ aviso: avisoDeAccion(causa) ?? undefined });
    } finally {
      setEnviando(null);
      setDialogo(null);
    }
  }

  // --- Acciones -------------------------------------------------------------------------------

  function confirmarCambioRol() {
    // Red de seguridad: el botón ya está inerte mientras no haya un rol distinto del actual.
    if (rolElegido === "" || rolElegido === usuario.rol) return;
    const rolNuevo = rolElegido;
    void ejecutar("rol", async () => {
      const { usuario: actualizado } = await cambiarRol(usuario.id, rolNuevo);
      return {
        notificacion: {
          titulo: "Rol actualizado",
          mensaje: `${nombre} ahora tiene el rol ${actualizado.rol_nombre}. El cambio ya está aplicado.`,
        },
      };
    });
  }

  function confirmarContrasena() {
    const pendiente = usuario.estado === "PENDIENTE";
    void ejecutar("contrasena", async () => {
      const { credencial } = pendiente
        ? await reenviarCredencial(usuario.id)
        : await restablecerContrasena(usuario.id);
      if (credencial.estado === "ENVIADO") {
        return {
          notificacion: {
            titulo: "Contraseña temporal enviada",
            mensaje: `Se envió a ${correo ?? "su dirección registrada"}. Vence en 72 horas.`,
          },
        };
      }
      // El servidor sí hizo su trabajo; lo único que falló fue el correo: no es un éxito.
      return { aviso: avisoCorreoNoEnviado(nombre, correo, pendiente) };
    });
  }

  function activar() {
    void ejecutar("activar", async () => {
      const { usuario: actualizado } = await activarUsuario(usuario.id);
      // Si la cuenta se desactivó antes de su primer ingreso, vuelve a PENDIENTE: decir que ya
      // puede entrar sería falso.
      return {
        notificacion: {
          titulo: "Cuenta activada",
          mensaje:
            actualizado.estado === "ACTIVO"
              ? `${nombre} ya puede iniciar sesión.`
              : `${nombre} vuelve a estar pendiente de activación: necesita una contraseña temporal para su primer ingreso.`,
        },
      };
    });
  }

  function desbloquear() {
    void ejecutar("desbloquear", async () => {
      await desbloquearUsuario(usuario.id);
      return {
        notificacion: { titulo: "Cuenta desbloqueada", mensaje: `${nombre} ya puede iniciar sesión.` },
      };
    });
  }

  // --- Razones por las que una acción no está disponible ---------------------------------------

  let razonRol: string | undefined;
  if (eliminada) razonRol = "La cuenta está eliminada: ya no admite cambios.";
  else if (esUltimoAdministrador) razonRol = "Es la única cuenta de administrador activa.";
  else if (usuario.rol === "DOCTOR" && usuario.casos_activos > 0) {
    razonRol = `Tiene ${textoCasos(usuario.casos_activos)} sin reasignar; un administrador no puede tener casos.`;
  }

  let razonContrasena: string | undefined;
  if (eliminada) razonContrasena = "La cuenta está eliminada: ya no admite cambios.";
  else if (usuario.estado === "INACTIVO") razonContrasena = "Active la cuenta para poder restablecer su contraseña.";
  else if (correo === null) razonContrasena = "La cuenta no tiene un correo registrado al que enviarla.";

  const razonDesbloqueo = eliminada
    ? "La cuenta está eliminada: ya no admite cambios."
    : usuario.bloqueado
      ? undefined
      : "Solo se habilita cuando hay un bloqueo activo.";

  const pendiente = usuario.estado === "PENDIENTE";

  return (
    <>
      <EncabezadoPagina
        titulo={nombre}
        descripcion={`${usuario.rol_nombre}${correo ? ` · ${correo}` : ""}`}
        insignia={<Insignia tipo={insignia.tipo}>{insignia.texto}</Insignia>}
        acciones={
          !editando && !eliminada ? (
            <Boton jerarquia="secundario" onClick={() => setEditando(true)}>
              Editar información
              <span className={estilos.soloLector}> de {nombre}</span>
            </Boton>
          ) : undefined
        }
      />

      <div ref={contenedorRef} tabIndex={-1} className={estilos.contenido}>
        {/* W-11i. Se nombra solo el cambio de rol: desactivar y eliminar todavía no existen. */}
        {esUltimoAdministrador && (
          <Alerta tipo="info" titulo="Única cuenta de administrador activa">
            Para cambiar el rol de esta cuenta, primero cree o active otro administrador. Siempre debe
            existir al menos un administrador activo.
          </Alerta>
        )}

        {/* No está dibujado en Figma: una cuenta eliminada se puede consultar, pero el servidor
            rechaza cualquier cambio sobre ella. */}
        {eliminada && (
          <Alerta tipo="advertencia" titulo="Esta cuenta está eliminada">
            Se conservan su nombre y sus registros históricos, pero ya no admite ningún cambio ni puede
            iniciar sesión (RF-U11).
          </Alerta>
        )}

        {errorAccion && (
          <Alerta tipo="error" titulo={errorAccion.titulo}>
            {errorAccion.mensaje}
          </Alerta>
        )}

        <div className={estilos.cuerpo}>
          <div className={estilos.columnaDatos}>
            {editando ? (
              <FormularioDatosCuenta
                usuario={usuario}
                autenticado={autenticado}
                filasFijas={<FilasFijas usuario={usuario} />}
                alGuardar={(resultado) => {
                  setEditando(false);
                  terminarAccion(resultado);
                }}
                alCancelar={() => setEditando(false)}
              />
            ) : (
              <TarjetaDatos usuario={usuario} />
            )}
          </div>

          {!eliminada && (
            <div className={estilos.columnaAcciones}>
              <TarjetaAccion
                titulo="Rol"
                descripcion={`Rol actual: ${usuario.rol_nombre}. El cambio se aplica de inmediato a los módulos que puede ver.`}
                leyenda="RF-U08 · No se permite quitar el rol al último administrador activo."
                etiqueta="Cambiar rol"
                nombreCuenta={nombre}
                razonNoDisponible={razonRol}
                ocupado={hayAccionEnCurso}
                onAccion={() => {
                  // Sin preseleccionar: abrir el diálogo y confirmar no puede cambiar el rol por
                  // sí solo. El rol lo elige quien lo va a cambiar.
                  setRolElegido("");
                  setDialogo("rol");
                }}
              />

              <TarjetaAccion
                titulo="Contraseña y segundo factor"
                descripcion={
                  pendiente
                    ? "Aún no completa su primer ingreso. Si la contraseña temporal se perdió o va a vencer, envíe una nueva (RF-U06, RF-U09)."
                    : "Envía una nueva contraseña temporal (72 h) al correo registrado y desvincula la app autenticadora."
                }
                leyenda="RF-U09"
                etiqueta={pendiente ? "Nueva contraseña temporal" : "Restablecer contraseña"}
                nombreCuenta={nombre}
                razonNoDisponible={razonContrasena}
                ocupado={hayAccionEnCurso}
                onAccion={() => setDialogo("contrasena")}
              />

              <TarjetaAccion
                titulo="Bloqueo por intentos fallidos"
                descripcion={textoBloqueo(usuario)}
                leyenda="RF-U12"
                etiqueta="Desbloquear cuenta"
                nombreCuenta={nombre}
                razonNoDisponible={razonDesbloqueo}
                ocupado={hayAccionEnCurso}
                cargando={enviando === "desbloquear"}
                etiquetaCargando="Desbloqueando…"
                onAccion={desbloquear}
              />

              {/* W-11c → W-11g. Solo cuando la acción existe: desactivar es de la tarea siguiente. */}
              {usuario.estado === "INACTIVO" && (
                <TarjetaAccion
                  titulo="Estado de la cuenta"
                  descripcion={textoDesactivacion(usuario)}
                  leyenda="RF-U07"
                  etiqueta="Activar cuenta"
                  nombreCuenta={nombre}
                  ocupado={hayAccionEnCurso}
                  cargando={enviando === "activar"}
                  etiquetaCargando="Activando…"
                  onAccion={activar}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* D-04 */}
      {dialogo === "rol" && (
        <DialogoCambiarRol
          titulo={`Cambiar el rol de ${nombre}`}
          mensaje="El nuevo rol reemplaza al actual y se aplica de inmediato: cambian los módulos a los que tiene acceso (RF-U08 CA 2 y 3)."
          etiquetaCampo="Nuevo rol"
          // El diálogo pide el catálogo de roles y marca el actual en su propia etiqueta: dentro
          // del diálogo no se ve la tarjeta que lo dice.
          rolActual={usuario.rol}
          valor={rolElegido}
          onCambio={(valor) => setRolElegido(valor as RolUsuario)}
          ayuda={
            rolElegido === ""
              ? "Elija el rol nuevo para poder continuar."
              : rolElegido === usuario.rol
                ? "Es el rol que ya tiene: elija el otro para cambiarlo."
                : undefined
          }
          puedeConfirmar={rolElegido !== "" && rolElegido !== usuario.rol}
          enviando={enviando === "rol"}
          onConfirmar={confirmarCambioRol}
          onCancelar={() => setDialogo(null)}
        />
      )}

      {/* D-06, con el texto de esta pantalla: aquí sí se dice qué más se lleva por delante. */}
      {dialogo === "contrasena" && (
        <DialogoConfirmacion
          confirmarEsPrimario
          titulo={
            pendiente
              ? `¿Enviar una nueva contraseña temporal a ${nombre}?`
              : `¿Restablecer la contraseña de ${nombre}?`
          }
          mensaje={textoDialogoContrasena(correo, pendiente)}
          etiquetaConfirmar={pendiente ? "Enviar contraseña" : "Restablecer contraseña"}
          etiquetaCancelar="Cancelar"
          enviando={enviando === "contrasena"}
          etiquetaEnviando={pendiente ? "Enviando…" : "Restableciendo…"}
          onConfirmar={confirmarContrasena}
          onCancelar={() => setDialogo(null)}
        />
      )}

      {/* D-05: el servidor rechazó la acción aunque la pantalla ya la deshabilitaba. */}
      {avisoUltimoAdministrador && (
        <DialogoAviso
          titulo="No se puede completar esta acción"
          mensaje={`${nombre} es el último administrador activo. Para cambiar su rol, primero asigne el rol de administrador a otra cuenta activa.`}
          onCerrar={() => setAvisoUltimoAdministrador(false)}
        />
      )}

      {/* W-11g y W-11h */}
      {notificacion && (
        <Notificacion
          titulo={notificacion.titulo}
          mensaje={notificacion.mensaje}
          onCerrar={() => setNotificacion(null)}
        />
      )}
    </>
  );
}

// --- Tarjetas ---------------------------------------------------------------------------------

/** Tarjeta «Datos de la cuenta» en modo lectura (W-11). */
function TarjetaDatos({ usuario }: { usuario: UsuarioDetalle }) {
  return (
    <section className={estilos.tarjeta} aria-labelledby="datos-de-la-cuenta">
      <h2 id="datos-de-la-cuenta" className={estilos.tituloTarjeta}>
        Datos de la cuenta
      </h2>
      <dl className={estilos.datos}>
        <Dato etiqueta="Nombre" valor={usuario.nombre} />
        <Dato etiqueta="Apellido" valor={usuario.apellido} />
        <Dato etiqueta="Correo" valor={usuario.correo ?? "Sin correo registrado"} />
        <Dato etiqueta="Teléfono" valor={usuario.telefono ?? "Sin teléfono registrado"} />
        <FilasFijas usuario={usuario} />
      </dl>
    </section>
  );
}

/**
 * Filas que no se editan desde aquí: el rol se cambia en su propia tarjeta (D-04) y el estado y
 * las fechas las pone el servidor. Se ven igual leyendo la tarjeta y editándola (W-11f).
 */
function FilasFijas({ usuario }: { usuario: UsuarioDetalle }) {
  return (
    <>
      <Dato etiqueta="Rol" valor={usuario.rol_nombre} />
      <Dato etiqueta="Estado" valor={insigniaDeEstado(usuario).texto} />
      <Dato etiqueta="Cuenta creada" valor={fechaHoraCorta(usuario.creado_en)} />
      <Dato etiqueta="Primer ingreso (activación)" valor={textoPrimerIngreso(usuario)} />
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className={estilos.dato}>
      <dt className={estilos.etiquetaDato}>{etiqueta}</dt>
      <dd className={estilos.valorDato}>{valor}</dd>
    </div>
  );
}

interface PropiedadesTarjetaAccion {
  titulo: string;
  descripcion: string;
  /** Requisito al pie, tal como lo escribe Figma («RF-U09»). */
  leyenda: string;
  etiqueta: string;
  /** Nombre de la cuenta: va en el nombre accesible del botón, que si no se repite (WCAG 2.4.4). */
  nombreCuenta: string;
  /** Si existe, la acción no está disponible y se explica por qué al lado del botón. */
  razonNoDisponible?: string;
  /** Hay otra acción en curso: este botón no responde mientras tanto. */
  ocupado?: boolean;
  cargando?: boolean;
  etiquetaCargando?: string;
  onAccion: () => void;
}

/**
 * Tarjeta de una acción de administración (W-11). El botón deshabilitado explica al lado por qué
 * no está disponible, como pide el componente «Botón» del sistema de diseño; el significado nunca
 * lo da solo el color.
 */
function TarjetaAccion({
  titulo,
  descripcion,
  leyenda,
  etiqueta,
  nombreCuenta,
  razonNoDisponible,
  ocupado = false,
  cargando = false,
  etiquetaCargando,
  onAccion,
}: PropiedadesTarjetaAccion) {
  const idRazon = useId();
  const noDisponible = razonNoDisponible !== undefined;

  return (
    <section className={estilos.tarjeta}>
      <h2 className={estilos.tituloAccion}>{titulo}</h2>
      <p className={estilos.descripcionAccion}>{descripcion}</p>
      <div>
        <Boton
          jerarquia="secundario"
          cargando={cargando}
          etiquetaCargando={etiquetaCargando}
          aria-disabled={noDisponible || ocupado || undefined}
          aria-describedby={noDisponible ? idRazon : undefined}
          onClick={onAccion}
        >
          {etiqueta}
          <span className={estilos.soloLector}> de {nombreCuenta}</span>
        </Boton>
      </div>
      {noDisponible && (
        <p id={idRazon} className={estilos.razon}>
          {razonNoDisponible}
        </p>
      )}
      <p className={estilos.leyenda}>{leyenda}</p>
    </section>
  );
}

// --- Textos -----------------------------------------------------------------------------------

/** «12 casos activos» / «1 caso activo». */
function textoCasos(cantidad: number): string {
  return cantidad === 1 ? "1 caso activo" : `${cantidad} casos activos`;
}

/** Fila «Primer ingreso (activación)»: la fecha, o en qué va la contraseña temporal (W-11d). */
function textoPrimerIngreso(usuario: UsuarioDetalle): string {
  if (usuario.activado_en) return fechaHoraCorta(usuario.activado_en);
  if (usuario.estado !== "PENDIENTE") return "Sin registrar";
  if (!usuario.temporal_expira_en) return "Pendiente";
  const vencida = usuario.estado_activacion === "EXPIRADA";
  const cuando = fechaHoraCorta(usuario.temporal_expira_en);
  return vencida
    ? `Pendiente · la contraseña temporal venció el ${cuando}`
    : `Pendiente · la contraseña temporal vence el ${cuando}`;
}

/**
 * Intentos fallidos seguidos que disparan el bloqueo (RF-U12, RNF-03). Es el número de la
 * política, el mismo que el backend tiene en `bloqueo_intentos`; no es un dato de la cuenta.
 */
const INTENTOS_PARA_BLOQUEAR = 5;

/**
 * Tarjeta «Bloqueo por intentos fallidos» (W-11b, RF-U12).
 *
 * Dos datos que Figma pide y aquí no se usan, cada uno por su motivo:
 *
 * - La **IP** no viene en el detalle; está en la bitácora, filtrando por este usuario (U-18).
 * - **`intentos_fallidos` no sirve en esta frase y no hay que volver a meterlo.** El repositorio
 *   del backend (`usuarios_repository.bloquear`) ejecuta
 *   `.values(intentos_fallidos=0, bloqueado_hasta=hasta)`: pone el contador en cero en el mismo
 *   momento en que bloquea la cuenta, porque ya cumplió su función. Así que una cuenta bloqueada
 *   tiene **siempre** `intentos_fallidos: 0`, y leerlo aquí escribía «tras 0 intentos fallidos».
 *   El contador sirve para ver cuántos lleva una cuenta que todavía **no** está bloqueada. El
 *   número que corresponde a esta frase es el de la política, que es fijo.
 */
function textoBloqueo(usuario: UsuarioDetalle): string {
  if (!usuario.bloqueado) {
    return "La cuenta no está bloqueada. Esta acción solo se habilita cuando hay un bloqueo activo.";
  }
  const desde = usuario.bloqueado_en ? `Bloqueada el ${fechaHoraCorta(usuario.bloqueado_en)}` : "Cuenta bloqueada";
  const hasta = usuario.bloqueado_hasta
    ? ` Se desbloquea sola el ${fechaHoraCorta(usuario.bloqueado_hasta)}.`
    : "";
  return (
    `${desde} tras ${INTENTOS_PARA_BLOQUEAR} intentos fallidos seguidos.${hasta} ` +
    "La IP desde la que se intentó queda registrada en la bitácora."
  );
}

/** Tarjeta «Estado de la cuenta» de una cuenta inactiva (W-11c, RF-U07 CA 2 y 3). */
function textoDesactivacion(usuario: UsuarioDetalle): string {
  const desde = usuario.desactivado_en
    ? `Desactivada el ${fechaHoraCorta(usuario.desactivado_en)}`
    : "Cuenta desactivada";
  const traslado = usuario.ultimo_traslado;
  const casos =
    traslado && traslado.tipo === "DESACTIVACION" && traslado.cantidad_casos > 0
      ? ` después de reasignar sus ${textoCasos(traslado.cantidad_casos)}`
      : "";
  return `${desde}${casos}. No puede iniciar sesión hasta que se active de nuevo.`;
}

/** D-06: lo que de verdad hace cada ruta, que no es lo mismo en una cuenta pendiente que activa. */
function textoDialogoContrasena(correo: string | null, pendiente: boolean): string {
  const destino = correo ?? "su dirección registrada";
  if (pendiente) {
    return (
      `Se generará una contraseña temporal válida por 72 horas y se enviará a ${destino}. La anterior ` +
      "dejará de funcionar, se cerrarán las sesiones abiertas de esa cuenta y deberá cambiarla al ingresar."
    );
  }
  return (
    `Se generará una contraseña temporal válida por 72 horas y se enviará a ${destino}. La contraseña ` +
    "actual dejará de funcionar, se cerrarán las sesiones abiertas, se desvinculará su aplicación " +
    "autenticadora (tendrá que vincularla otra vez al ingresar) y se quitará el bloqueo por intentos " +
    "fallidos si lo había."
  );
}

/** 200 con `credencial.estado` FALLIDO: la acción se hizo, el correo no salió. */
function avisoCorreoNoEnviado(nombre: string, correo: string | null, pendiente: boolean): AvisoError {
  const destino = correo ?? "su dirección registrada";
  const hecho = pendiente
    ? `Se generó una contraseña temporal nueva para ${nombre} y se cerraron sus sesiones abiertas`
    : `Se generó una contraseña temporal nueva para ${nombre}, se cerraron sus sesiones abiertas y se desvinculó su aplicación autenticadora`;
  return {
    titulo: "No se pudo enviar el correo",
    mensaje: `${hecho}, pero el correo a ${destino} no salió. Reintente el envío cuando el correo vuelva a funcionar.`,
  };
}

