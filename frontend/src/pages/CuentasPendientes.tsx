// Pantalla W-20 · Cuentas pendientes de activación (Figma 69:4286), con W-20b (sin cuentas
// pendientes, 69:4554), D-06 (enviar nueva contraseña temporal, 100:3576) y D-06b (resultado,
// 100:3669). RF-U06 (Should) y RNF-27.
//
// Decisiones del equipo sobre lo que Figma dibuja y la API entrega:
// - Orden: la nota de W-20 en Figma pide las expiradas primero. El servidor ya sabe hacerlo con
//   `orden=activacion` (consulta U-17, resuelta): agrupa por temporal vencida y, dentro de cada
//   grupo, por fecha de vencimiento. Se ordena en la base de datos, así que el orden vale para
//   todas las páginas y la pantalla no reordena nada.
// - «Vigencia» es el único encabezado ordenable, con ícono y `aria-sort`, porque es la columna
//   que `orden=activacion` ordena de verdad: su fecha es el criterio y el grupo de vencidas es
//   exactamente lo que separa. «Creada» sigue en texto plano porque el servidor no ordena por
//   `creado_en`, y «Estado» también, porque en esta lista todas las cuentas son PENDIENTE y
//   `orden=estado` no las separaría. Un encabezado que reordenara solo la página visible diría
//   algo falso.
// - Estado: Figma dibuja «Correo no enviado» en lugar de «Expirada»/«Pendiente», pero una cuenta
//   puede tener las dos cosas. Se pintan hasta dos insignias (ver utils/presentacionUsuario.ts).
// - Paginación: Figma no la dibuja; la API pagina. Se usa el mismo patrón de W-09 y solo aparece
//   cuando hay más de una página.
// - W-20 no enlaza al detalle de la cuenta (W-11): Figma no dibuja ese enlace en esta pantalla.
//
// D-06: el texto es el de esta pantalla, no el de W-11. `reenviar-credencial` emite una temporal
// nueva y cierra las sesiones abiertas de esa cuenta; **no** desvincula la aplicación
// autenticadora (eso es `restablecer-contrasena`, que solo aplica a cuentas activas), y una
// cuenta pendiente ni siquiera la tiene vinculada.
//
// D-06b: un 200 no quiere decir que el correo haya salido. Si `credencial.estado` es FALLIDO, la
// contraseña temporal nueva sí se generó y las sesiones sí se cerraron, pero el correo no se
// envió: no se muestra la notificación de éxito, sino una alerta de error persistente, y la fila
// recargada queda con la insignia «Correo no enviado».
//
// Los correos de las cuentas solo viven en el estado de este componente: nada en la URL, en el
// almacenamiento del navegador ni en la consola. La contraseña temporal nunca llega al frontend.
import { useEffect, useRef, useState } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import DialogoConfirmacion from "../components/DialogoConfirmacion";
import EncabezadoPagina from "../components/EncabezadoPagina";
import EnlaceBoton from "../components/EnlaceBoton";
import Esqueleto from "../components/Esqueleto";
import EncabezadoTabla from "../components/EncabezadoTabla";
import type { OrdenColumna } from "../components/EncabezadoTabla";
import EstadoVacio from "../components/EstadoVacio";
import Insignia from "../components/Insignia";
import Notificacion from "../components/Notificacion";
import IconoReintentar from "../components/iconos/IconoReintentar";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import { USUARIOS_POR_PAGINA, listarCuentasPendientes, reenviarCredencial } from "../services/usuariosAdmin";
import type { OrdenActivacion } from "../services/usuariosAdmin";
import type { PaginaUsuarios, UsuarioResumen } from "../types";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import { textoVigencia, fechaHoraCorta } from "../utils/fechas";
import { insigniasDeCuentaPendiente, nombreCompleto } from "../utils/presentacionUsuario";
import estilos from "./CuentasPendientes.module.css";

/** Igual que en W-09: al recargar, el esqueleto solo aparece si la espera supera ~1 s. */
const ESPERA_ESQUELETO_MS = 1000;

const FILAS_ESQUELETO = 6;
const TARJETAS_ESQUELETO = 4;

const RUTA_USUARIOS = "/usuarios";

/** Aviso de D-06b cuando el correo no salió (200 con `credencial.estado` FALLIDO). */
function avisoCorreoNoEnviado(usuario: UsuarioResumen): AvisoError {
  return {
    titulo: "No se pudo enviar el correo",
    mensaje:
      `Se generó una contraseña temporal nueva para ${nombreCompleto(usuario)} y se cerraron sus ` +
      `sesiones abiertas, pero el correo a ${usuario.correo ?? "su dirección registrada"} no salió. ` +
      "Reintente el envío cuando el correo vuelva a funcionar.",
  };
}

/** 409 TRANSICION_INVALIDA: la cuenta se activó mientras la lista estaba abierta. */
const AVISO_CUENTA_YA_ACTIVA: AvisoError = {
  titulo: "Esa cuenta ya está activa",
  mensaje: "La cuenta completó su primer ingreso mientras tenía esta lista abierta. Se actualizó la lista.",
};

/** Pie de W-20: «3 cuentas pendientes · 1 expirada», con el rango cuando hay más de una página. */
function textoResumen(pagina: PaginaUsuarios): string {
  const { items, paginacion, conteos } = pagina;
  const total = paginacion.total;
  const cuentas = total === 1 ? "1 cuenta pendiente" : `${total} cuentas pendientes`;

  let expiradas = "";
  if (conteos.expiradas === 1) expiradas = " · 1 expirada";
  else if (conteos.expiradas > 1) expiradas = ` · ${conteos.expiradas} expiradas`;

  if (total <= paginacion.por_pagina || items.length === 0) return `${cuentas}${expiradas}`;

  const desde = (paginacion.pagina - 1) * paginacion.por_pagina + 1;
  const hasta = desde + items.length - 1;
  return `Mostrando ${desde}–${hasta} de ${cuentas}${expiradas}`;
}

export default function CuentasPendientes({ titulo }: { titulo: string }) {
  const [paginaActual, setPaginaActual] = useState(1);
  /** W-20 abre con las vencidas primero, que es lo que pide la nota de la pantalla. */
  const [orden, setOrden] = useState<OrdenActivacion>("activacion");
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<PaginaUsuarios | null>(null);
  const [cargando, setCargando] = useState(true);
  const [esqueletoVisible, setEsqueletoVisible] = useState(true);
  const [error, setError] = useState<AvisoError | null>(null);
  /** D-06: cuenta sobre la que se pidió confirmación, o `null` si el diálogo está cerrado. */
  const [confirmando, setConfirmando] = useState<UsuarioResumen | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** D-06b, solo con `credencial.estado` ENVIADO. */
  const [notificacion, setNotificacion] = useState<{ titulo: string; mensaje: string } | null>(null);
  /** Fallo de la acción (no de la carga): alerta persistente sobre la tabla. */
  const [errorAccion, setErrorAccion] = useState<AvisoError | null>(null);

  const resultadosRef = useRef<HTMLDivElement>(null);
  const hayResultadoRef = useRef(false);
  const enfocarResultadosRef = useRef(false);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    // Carga inicial (o tras un error): esqueleto de inmediato. Después, solo si tarda.
    let temporizador: number | undefined;
    if (!hayResultadoRef.current) {
      setEsqueletoVisible(true);
    } else {
      temporizador = window.setTimeout(() => {
        if (vigente) setEsqueletoVisible(true);
      }, ESPERA_ESQUELETO_MS);
    }

    listarCuentasPendientes({ pagina: paginaActual, orden })
      .then((pagina) => {
        if (!vigente) return;
        hayResultadoRef.current = true;
        setResultado(pagina);
      })
      .catch((causa: unknown) => {
        if (!vigente) return;
        hayResultadoRef.current = false;
        enfocarResultadosRef.current = false;
        if (!esErrorGlobal(causa)) setError(avisoDeError(causa));
      })
      .finally(() => {
        if (!vigente) return;
        window.clearTimeout(temporizador);
        setCargando(false);
        setEsqueletoVisible(false);
      });

    return () => {
      vigente = false;
      window.clearTimeout(temporizador);
    };
  }, [paginaActual, orden, intento]);

  useEffect(() => {
    if (cargando) return;
    // Tras cambiar de página, el foco pasa a la lista nueva: el botón pulsado puede quedar
    // deshabilitado (primera o última página) y el foco no debe perderse.
    if (enfocarResultadosRef.current) {
      enfocarResultadosRef.current = false;
      resultadosRef.current?.focus();
      return;
    }
    // Red de seguridad tras cerrar D-06: useAtraparFoco devuelve el foco al botón que lo abrió,
    // pero si la cuenta se activó y su fila ya no existe, ese botón se fue del documento y el
    // foco cayó en <body>. Entonces se lleva a la lista.
    if (document.activeElement === document.body) resultadosRef.current?.focus();
  }, [cargando]);

  function recargar() {
    setIntento((n) => n + 1);
  }

  function irAPagina(pagina: number) {
    enfocarResultadosRef.current = true;
    setPaginaActual(pagina);
  }

  /**
   * Alterna el orden de «Vigencia». Vuelve a la primera página: con otro orden, la página en la
   * que se estaba ya no contiene las mismas cuentas. El foco se queda en el encabezado, que no
   * desaparece, así que no se lleva a la lista como al cambiar de página.
   */
  function alternarOrden() {
    setOrden((actual) => (actual === "activacion" ? "-activacion" : "activacion"));
    setPaginaActual(1);
  }

  /**
   * D-06 confirmado. Al cerrar el diálogo, useAtraparFoco devuelve el foco al botón que lo abrió;
   * si esa fila ya no existe tras la recarga, el efecto de arriba lo lleva a la lista.
   */
  async function confirmarReenvio(usuario: UsuarioResumen) {
    setEnviando(true);
    setErrorAccion(null);
    setNotificacion(null);
    try {
      const { credencial } = await reenviarCredencial(usuario.id);
      if (credencial.estado === "ENVIADO") {
        setNotificacion({
          titulo: "Contraseña temporal enviada",
          mensaje: `Se envió a ${usuario.correo ?? "su dirección registrada"}. Vence en 72 horas.`,
        });
      } else {
        // El backend sí hizo su trabajo: hay temporal nueva y las sesiones quedaron cerradas.
        setErrorAccion(avisoCorreoNoEnviado(usuario));
      }
    } catch (causa: unknown) {
      if (!esErrorGlobal(causa)) {
        const yaActiva =
          causa instanceof ErrorApi && causa.codigo === CodigoErrorApi.TRANSICION_INVALIDA;
        setErrorAccion(yaActiva ? AVISO_CUENTA_YA_ACTIVA : avisoDeError(causa));
      }
    } finally {
      setEnviando(false);
      setConfirmando(null);
      // En los tres casos la lista puede haber cambiado (temporal nueva, o cuenta ya activada):
      // se recarga para que la fila y los conteos digan la verdad.
      recargar();
    }
  }

  const mostrarEsqueleto = !error && (esqueletoVisible || resultado === null);
  const listo = !error && !mostrarEsqueleto && resultado !== null;
  // El orden viene resuelto del servidor: aquí no se reordena nada.
  const cuentas = listo ? resultado.items : [];
  const ordenVigencia: OrdenColumna = orden === "activacion" ? "ascendente" : "descendente";

  let resumen = "";
  if (mostrarEsqueleto) resumen = "Cargando cuentas pendientes…";
  else if (listo) resumen = textoResumen(resultado);

  const paginacion = resultado?.paginacion;
  const totalPaginas = paginacion ? Math.max(1, Math.ceil(paginacion.total / paginacion.por_pagina)) : 1;
  const conPaginacion = listo && paginacion !== undefined && paginacion.total > USUARIOS_POR_PAGINA;

  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Cuentas creadas que aún no completan su primer ingreso ni el cambio de la contraseña temporal."
      />

      {error ? (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={error.titulo}>
            {error.mensaje}
          </Alerta>
          <div>
            <Boton jerarquia="secundario" onClick={recargar}>
              Reintentar
            </Boton>
          </div>
        </div>
      ) : (
        <div ref={resultadosRef} tabIndex={-1} className={estilos.resultados} aria-busy={cargando || undefined}>
          {errorAccion && (
            <Alerta tipo="error" titulo={errorAccion.titulo}>
              {errorAccion.mensaje}
            </Alerta>
          )}

          {/* Figma no dibuja este aviso en W-20b: solo acompaña a la lista. */}
          {(mostrarEsqueleto || cuentas.length > 0) && (
            <Alerta tipo="info" titulo="La contraseña temporal vence a las 72 horas">
              Si vence, la cuenta pasa a «Expirada» y hay que generar una nueva (RNF-27). Cuando el usuario
              cambia su contraseña temporal, la cuenta sale de esta lista.
            </Alerta>
          )}

          {mostrarEsqueleto && <EsqueletoLista />}

          {listo && cuentas.length > 0 && (
            <>
              <TablaCuentas
                cuentas={cuentas}
                alPedirReenvio={setConfirmando}
                ordenVigencia={ordenVigencia}
                alOrdenarVigencia={alternarOrden}
              />
              <TarjetasCuentas cuentas={cuentas} alPedirReenvio={setConfirmando} />
            </>
          )}

          {/* W-20b */}
          {listo && cuentas.length === 0 && (
            <div className={estilos.tarjetaVacia}>
              <EstadoVacio
                nivelTitulo="h2"
                titulo="No hay cuentas pendientes"
                mensaje="Todas las cuentas creadas ya completaron su primer ingreso."
              >
                <EnlaceBoton jerarquia="primario" to={RUTA_USUARIOS}>
                  Ir a Usuarios
                </EnlaceBoton>
              </EstadoVacio>
            </div>
          )}
        </div>
      )}

      <div className={estilos.pieLista}>
        <p className={estilos.resumen} role="status">
          {resumen}
        </p>
        {conPaginacion && paginacion && (
          <div className={estilos.paginacion}>
            <Boton
              jerarquia="secundario"
              disabled={cargando || paginacion.pagina <= 1}
              onClick={() => irAPagina(paginacion.pagina - 1)}
            >
              Anterior
            </Boton>
            <Boton
              jerarquia="secundario"
              disabled={cargando || paginacion.pagina >= totalPaginas}
              onClick={() => irAPagina(paginacion.pagina + 1)}
            >
              Siguiente
            </Boton>
          </div>
        )}
      </div>

      {/* D-06 */}
      {confirmando && (
        <DialogoConfirmacion
          confirmarEsPrimario
          titulo={`¿Enviar una nueva contraseña temporal a ${nombreCompleto(confirmando)}?`}
          mensaje={
            `Se generará una contraseña temporal válida por 72 horas y se enviará a ` +
            `${confirmando.correo ?? "su dirección registrada"}. La anterior dejará de funcionar, se ` +
            "cerrarán las sesiones abiertas de esa cuenta y deberá cambiarla al ingresar."
          }
          etiquetaConfirmar="Enviar contraseña"
          etiquetaCancelar="Cancelar"
          enviando={enviando}
          etiquetaEnviando="Enviando…"
          onConfirmar={() => void confirmarReenvio(confirmando)}
          onCancelar={() => setConfirmando(null)}
        />
      )}

      {/* D-06b */}
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

/** Carga: esqueleto con forma de filas (escritorio) o de tarjetas (tableta y celular). */
function EsqueletoLista() {
  return (
    <>
      <div className={`${estilos.marcoTabla} ${estilos.soloEscritorio}`}>
        <div className={estilos.encabezadoEsqueleto} aria-hidden="true">
          <span>Usuario</span>
          <span>Rol</span>
          <span>Creada</span>
          <span>Estado</span>
          <span>Vigencia</span>
          <span className={estilos.columnaAccion}>Acción</span>
        </div>
        {Array.from({ length: FILAS_ESQUELETO }, (_, indice) => (
          <Esqueleto key={indice} forma="fila-tabla" />
        ))}
      </div>
      <div className={`${estilos.tarjetas} ${estilos.soloTarjetas}`}>
        {Array.from({ length: TARJETAS_ESQUELETO }, (_, indice) => (
          <Esqueleto key={indice} forma="tarjeta" />
        ))}
      </div>
    </>
  );
}

interface PropiedadesLista {
  cuentas: UsuarioResumen[];
  alPedirReenvio: (usuario: UsuarioResumen) => void;
}

/**
 * «Nueva contraseña», o «Reintentar envío» si el último envío falló (Figma). Primario en las
 * expiradas, que son las que hay que resolver ya (nota de W-20); secundario en el resto.
 *
 * El nombre accesible lleva el nombre **y el correo** de la persona: hay un botón igual por fila
 * y dos cuentas pueden llamarse igual, así que solo el correo las distingue (WCAG 2.4.4). El
 * correo ya está visible en la fila, no se añade nada que no se vea.
 */
function BotonNuevaContrasena({ cuenta, alPedirReenvio }: { cuenta: UsuarioResumen; alPedirReenvio: (u: UsuarioResumen) => void }) {
  const fallo = cuenta.ultimo_envio?.estado === "FALLIDO";
  const etiqueta = fallo ? "Reintentar envío" : "Nueva contraseña";
  return (
    <Boton
      jerarquia={cuenta.estado_activacion === "EXPIRADA" ? "primario" : "secundario"}
      icono={<IconoReintentar className={estilos.iconoBoton} />}
      onClick={() => alPedirReenvio(cuenta)}
    >
      {etiqueta}
      <span className={estilos.soloLector}>
        {" "}
        para {nombreCompleto(cuenta)}
        {cuenta.correo ? `, ${cuenta.correo}` : ""}
      </span>
    </Boton>
  );
}

function InsigniasEstado({ cuenta }: { cuenta: UsuarioResumen }) {
  return (
    <div className={estilos.insignias}>
      {insigniasDeCuentaPendiente(cuenta).map((insignia) => (
        <Insignia key={insignia.texto} tipo={insignia.tipo}>
          {insignia.texto}
        </Insignia>
      ))}
    </div>
  );
}

/** Escritorio (desde 1280 px): tabla de W-20. */
function TablaCuentas({
  cuentas,
  alPedirReenvio,
  ordenVigencia,
  alOrdenarVigencia,
}: PropiedadesLista & { ordenVigencia: OrdenColumna; alOrdenarVigencia: () => void }) {
  return (
    <div className={`${estilos.marcoTabla} ${estilos.soloEscritorio}`}>
      <table className={estilos.tabla}>
        <caption className={estilos.soloLector}>Cuentas pendientes de activación</caption>
        <thead>
          <tr>
            <th scope="col" className={estilos.columnaUsuario}>
              Usuario
            </th>
            <th scope="col" className={estilos.columnaRol}>
              Rol
            </th>
            <th scope="col" className={estilos.columnaCreada}>
              Creada
            </th>
            <th scope="col" className={estilos.columnaEstado}>
              Estado
            </th>
            {/* La única columna que el servidor sabe ordenar en esta lista (U-17). */}
            <EncabezadoTabla
              columna="Vigencia"
              orden={ordenVigencia}
              onOrdenar={alOrdenarVigencia}
              className={estilos.columnaVigencia}
            />
            <th scope="col" className={estilos.columnaAccion}>
              Acción
            </th>
          </tr>
        </thead>
        <tbody>
          {cuentas.map((cuenta) => {
            const expirada = cuenta.estado_activacion === "EXPIRADA";
            return (
              <tr key={cuenta.id}>
                <th scope="row" className={estilos.celdaUsuario}>
                  <span className={estilos.nombre}>{nombreCompleto(cuenta)}</span>
                  <span className={estilos.correo}>{cuenta.correo ?? ""}</span>
                </th>
                <td>{cuenta.rol_nombre}</td>
                <td>{fechaHoraCorta(cuenta.creado_en)}</td>
                <td>
                  <InsigniasEstado cuenta={cuenta} />
                </td>
                <td className={expirada ? estilos.vigenciaVencida : undefined}>
                  {textoVigencia(cuenta.temporal_expira_en)}
                </td>
                <td className={estilos.columnaAccion}>
                  <BotonNuevaContrasena cuenta={cuenta} alPedirReenvio={alPedirReenvio} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Tableta (dos columnas) y celular (una columna): una tarjeta por cuenta. */
function TarjetasCuentas({ cuentas, alPedirReenvio }: PropiedadesLista) {
  return (
    <ul className={`${estilos.tarjetas} ${estilos.soloTarjetas}`} aria-label="Cuentas pendientes de activación">
      {cuentas.map((cuenta) => {
        const expirada = cuenta.estado_activacion === "EXPIRADA";
        return (
          <li key={cuenta.id} className={estilos.tarjeta}>
            <p className={estilos.tarjetaNombre}>{nombreCompleto(cuenta)}</p>
            <p className={estilos.tarjetaDato}>{cuenta.correo ?? ""}</p>
            <p className={estilos.tarjetaDato}>{cuenta.rol_nombre}</p>
            <p className={estilos.tarjetaDato}>Creada el {fechaHoraCorta(cuenta.creado_en)}</p>
            <InsigniasEstado cuenta={cuenta} />
            <p className={`${estilos.tarjetaDato} ${expirada ? estilos.vigenciaVencida : ""}`}>
              {textoVigencia(cuenta.temporal_expira_en)}
            </p>
            <div className={estilos.tarjetaAccion}>
              <BotonNuevaContrasena cuenta={cuenta} alPedirReenvio={alPedirReenvio} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
