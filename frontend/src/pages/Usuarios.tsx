// Pantalla W-09 · Usuarios (Figma 48:836; tableta T-09 110:1246; celular M-09 110:1362).
// RF-U07, RF-U03 y RF-U05 (acción «Crear usuario»). Estados: W-09b instalación nueva sin
// doctores (89:3638), W-09c búsqueda sin coincidencias (89:4010), W-09d cargando (99:2102) y,
// al fallar la carga, la alerta W-30 (sin conexión) o W-31 (error inesperado) con «Reintentar».
//
// Decisiones del equipo sobre lo que Figma dibuja y la API no entrega:
// - Sin el resumen de conteos por estado de W-09 («18 activos, 3 inactivos…»): la API no lo da.
// - Encabezados sin ordenar: la API no tiene `orden` (propuesta en CONTRATOS_API.md). El orden
//   es el del servidor (apellido y luego nombre).
// - Solo la búsqueda dibujada, sin filtros de rol ni de estado; páginas de 8.
// - Una sola insignia por cuenta y etiqueta del rol por código: ver utils/presentacionUsuario.ts.
//
// La búsqueda (que puede ser un correo) solo vive en el estado de este componente: nada en la
// URL del navegador, en el almacenamiento ni en la consola.
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoTexto from "../components/CampoTexto";
import EncabezadoPagina from "../components/EncabezadoPagina";
import EnlaceBoton from "../components/EnlaceBoton";
import Esqueleto from "../components/Esqueleto";
import EstadoVacio from "../components/EstadoVacio";
import Insignia from "../components/Insignia";
import IconoMas from "../components/iconos/IconoMas";
import { LONGITUD_MAXIMA_BUSQUEDA, USUARIOS_POR_PAGINA, listarUsuarios } from "../services/usuariosAdmin";
import type { ConsultaUsuarios } from "../services/usuariosAdmin";
import type { PaginaUsuarios, UsuarioResumen } from "../types";
import { avisoDeError, esErrorGlobal } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";
import { ETIQUETA_ROL_USUARIO, insigniaDeEstado, nombreCompleto } from "../utils/presentacionUsuario";
import estilos from "./Usuarios.module.css";

/**
 * Espera tras la última tecla antes de buscar. Figma dibuja el campo sin botón «Buscar» y el
 * esqueleto se usa «también al buscar»: es búsqueda en vivo. Esperar evita una petición por
 * tecla; Enter busca de inmediato.
 */
const ESPERA_BUSQUEDA_MS = 400;

/**
 * Al buscar o cambiar de página, las filas anteriores se mantienen y el esqueleto solo aparece si
 * la espera supera ~1 s (descripción del componente Esqueleto en Figma).
 */
const ESPERA_ESQUELETO_MS = 1000;

/** W-09d dibuja 6 filas de esqueleto; en tarjetas, 4 (lo que entra en tableta). */
const FILAS_ESQUELETO = 6;
const TARJETAS_ESQUELETO = 4;

const RUTA_CREAR_USUARIO = "/usuarios/nuevo";

function rutaDetalle(usuario: UsuarioResumen): string {
  return `/usuarios/${encodeURIComponent(usuario.id)}`;
}

/** Resultado mostrado: la página y la consulta que la produjo. */
interface Resultado {
  pagina: PaginaUsuarios;
  consulta: ConsultaUsuarios;
}

/**
 * Texto bajo la lista (W-09, W-09b, W-09c). Va en una región role="status": el lector de
 * pantalla anuncia el resultado de cada búsqueda o cambio de página.
 *
 * @param totalSinFiltro total de la última carga sin búsqueda: W-09c dice «0 de 5 usuarios para
 *   «valentina»», y con `q` la API solo devuelve el total filtrado.
 */
function textoResumen({ pagina, consulta }: Resultado, totalSinFiltro: number | null): string {
  const { items, paginacion } = pagina;
  const para = consulta.q !== "" ? ` para «${consulta.q}»` : "";
  if (items.length === 0) {
    const de = totalSinFiltro !== null ? ` de ${totalSinFiltro}` : "";
    return `Mostrando 0${de} usuarios${para}`;
  }
  const desde = (paginacion.pagina - 1) * paginacion.por_pagina + 1;
  const hasta = desde + items.length - 1;
  const rango = desde === hasta ? `${desde}` : `${desde}–${hasta}`;
  return `Mostrando ${rango} de ${paginacion.total} usuarios${para}`;
}

/**
 * W-09b: instalación nueva, todavía sin doctores. La lista nunca queda vacía porque siempre hay
 * al menos un administrador activo. Se decide con lo ya cargado (sin otra petición): sin
 * búsqueda, todo cabe en una página y ninguna cuenta es de doctor.
 */
function esInstalacionNueva({ pagina, consulta }: Resultado): boolean {
  return (
    consulta.q === "" &&
    pagina.paginacion.total === pagina.items.length &&
    !pagina.items.some((usuario) => usuario.rol === "DOCTOR")
  );
}

export default function Usuarios({ titulo }: { titulo: string }) {
  const idBusqueda = useId();
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState<ConsultaUsuarios>({ q: "", pagina: 1 });
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [esqueletoVisible, setEsqueletoVisible] = useState(true);
  const [error, setError] = useState<AvisoError | null>(null);
  const [totalSinFiltro, setTotalSinFiltro] = useState<number | null>(null);
  const resultadosRef = useRef<HTMLDivElement>(null);
  const hayResultadoRef = useRef(false);
  const enfocarResultadosRef = useRef(false);

  // Búsqueda en vivo con espera: no se hace una petición por tecla.
  useEffect(() => {
    const q = texto.trim();
    if (q === consulta.q) return;
    const temporizador = window.setTimeout(() => setConsulta({ q, pagina: 1 }), ESPERA_BUSQUEDA_MS);
    return () => window.clearTimeout(temporizador);
  }, [texto, consulta.q]);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    // Carga inicial (o tras un error): esqueleto de inmediato (W-09d). Después, solo si tarda.
    let temporizador: number | undefined;
    if (!hayResultadoRef.current) {
      setEsqueletoVisible(true);
    } else {
      temporizador = window.setTimeout(() => {
        if (vigente) setEsqueletoVisible(true);
      }, ESPERA_ESQUELETO_MS);
    }

    listarUsuarios(consulta)
      .then((pagina) => {
        if (!vigente) return;
        hayResultadoRef.current = true;
        setResultado({ pagina, consulta });
        if (consulta.q === "") setTotalSinFiltro(pagina.paginacion.total);
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
  }, [consulta, intento]);

  // Tras cambiar de página, el foco pasa a la lista nueva: el botón pulsado puede quedar
  // deshabilitado (primera o última página) y el foco no debe perderse.
  useEffect(() => {
    if (!cargando && enfocarResultadosRef.current) {
      enfocarResultadosRef.current = false;
      resultadosRef.current?.focus();
    }
  }, [cargando]);

  function buscarAhora(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const q = texto.trim();
    if (q !== consulta.q) setConsulta({ q, pagina: 1 });
  }

  function limpiarBusqueda() {
    setTexto("");
    setConsulta({ q: "", pagina: 1 });
    document.getElementById(idBusqueda)?.focus();
  }

  function irAPagina(pagina: number) {
    enfocarResultadosRef.current = true;
    setConsulta((actual) => ({ ...actual, pagina }));
  }

  const mostrarEsqueleto = !error && (esqueletoVisible || resultado === null);
  const listo = !error && !mostrarEsqueleto && resultado !== null;

  let resumen = "";
  if (mostrarEsqueleto) resumen = "Cargando usuarios…";
  else if (listo) resumen = textoResumen(resultado, totalSinFiltro);

  const paginacion = resultado?.pagina.paginacion;
  const totalPaginas = paginacion ? Math.max(1, Math.ceil(paginacion.total / paginacion.por_pagina)) : 1;
  const conPaginacion = listo && paginacion !== undefined && paginacion.total > USUARIOS_POR_PAGINA;

  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Cuentas de doctores y administradores de la plataforma."
        acciones={
          <div className={estilos.accionEncabezado}>
            <EnlaceBoton jerarquia="primario" to={RUTA_CREAR_USUARIO}>
              <IconoMas className={estilos.iconoBoton} />
              <span>Crear usuario</span>
            </EnlaceBoton>
          </div>
        }
      />

      <form role="search" className={estilos.buscador} onSubmit={buscarAhora} noValidate>
        <CampoTexto
          id={idBusqueda}
          etiqueta="Buscar por nombre o correo"
          type="search"
          placeholder="Ej. Ana Pérez"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          maxLength={LONGITUD_MAXIMA_BUSQUEDA}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </form>

      {error ? (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={error.titulo}>
            {error.mensaje}
          </Alerta>
          <div>
            <Boton jerarquia="secundario" onClick={() => setIntento((n) => n + 1)}>
              Reintentar
            </Boton>
          </div>
        </div>
      ) : (
        <div ref={resultadosRef} tabIndex={-1} className={estilos.resultados} aria-busy={cargando || undefined}>
          {mostrarEsqueleto && <EsqueletoLista />}
          {listo && <ListaUsuarios resultado={resultado} alLimpiarBusqueda={limpiarBusqueda} />}
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
    </>
  );
}

/** W-09d: esqueleto con forma de filas (escritorio) o de tarjetas (tableta y celular). */
function EsqueletoLista() {
  return (
    <>
      <div className={`${estilos.marcoTabla} ${estilos.soloEscritorio}`}>
        <div className={estilos.encabezadoEsqueleto} aria-hidden="true">
          <span>Nombre</span>
          <span>Correo</span>
          <span>Rol</span>
          <span>Estado</span>
          <span className={estilos.columnaAcciones}>Acciones</span>
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

interface PropiedadesListaUsuarios {
  resultado: Resultado;
  alLimpiarBusqueda: () => void;
}

function ListaUsuarios({ resultado, alLimpiarBusqueda }: PropiedadesListaUsuarios) {
  const { items } = resultado.pagina;

  // W-09c: la búsqueda no encontró nada.
  if (items.length === 0 && resultado.consulta.q !== "") {
    return (
      <div className={estilos.tarjetaVacia}>
        <EstadoVacio
          nivelTitulo="h2"
          titulo="No hay usuarios que coincidan"
          mensaje="Revise lo escrito o busque por correo electrónico."
        >
          <Boton onClick={alLimpiarBusqueda}>Limpiar búsqueda</Boton>
        </EstadoVacio>
      </div>
    );
  }

  return (
    <>
      {items.length > 0 && (
        <>
          <TablaUsuarios usuarios={items} />
          <TarjetasUsuarios usuarios={items} />
        </>
      )}
      {esInstalacionNueva(resultado) && (
        <div className={estilos.tarjetaVacia}>
          <EstadoVacio
            nivelTitulo="h2"
            titulo="Aún no hay doctores registrados"
            mensaje="Cree la primera cuenta de doctor. Recibirá una contraseña temporal en su correo para su primer ingreso."
          >
            <EnlaceBoton jerarquia="primario" to={RUTA_CREAR_USUARIO}>
              Crear usuario
            </EnlaceBoton>
          </EstadoVacio>
        </div>
      )}
    </>
  );
}

/** «Ver detalle de Ana Pérez»: el nombre completo evita 8 enlaces iguales (WCAG 2.4.4). */
function EnlaceDetalle({ usuario }: { usuario: UsuarioResumen }) {
  return (
    <EnlaceBoton jerarquia="terciario" to={rutaDetalle(usuario)}>
      Ver detalle<span className={estilos.soloLector}> de {nombreCompleto(usuario)}</span>
    </EnlaceBoton>
  );
}

/** Escritorio (desde 1280 px): tabla de W-09. */
function TablaUsuarios({ usuarios }: { usuarios: UsuarioResumen[] }) {
  return (
    <div className={`${estilos.marcoTabla} ${estilos.soloEscritorio}`}>
      <table className={estilos.tabla}>
        <caption className={estilos.soloLector}>Usuarios de la plataforma</caption>
        <thead>
          <tr>
            <th scope="col" className={estilos.columnaNombre}>
              Nombre
            </th>
            <th scope="col" className={estilos.columnaCorreo}>
              Correo
            </th>
            <th scope="col" className={estilos.columnaRol}>
              Rol
            </th>
            <th scope="col" className={estilos.columnaEstado}>
              Estado
            </th>
            <th scope="col" className={estilos.columnaAcciones}>
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((usuario) => {
            const insignia = insigniaDeEstado(usuario);
            return (
              <tr key={usuario.id}>
                <th scope="row" className={estilos.celdaNombre}>
                  {nombreCompleto(usuario)}
                </th>
                <td className={estilos.celdaCorreo}>{usuario.correo ?? ""}</td>
                <td>{ETIQUETA_ROL_USUARIO[usuario.rol]}</td>
                <td>
                  <Insignia tipo={insignia.tipo}>{insignia.texto}</Insignia>
                </td>
                <td className={estilos.columnaAcciones}>
                  <EnlaceDetalle usuario={usuario} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Tableta (dos columnas, T-09) y celular (una columna, M-09): una tarjeta por cuenta. */
function TarjetasUsuarios({ usuarios }: { usuarios: UsuarioResumen[] }) {
  return (
    <ul className={`${estilos.tarjetas} ${estilos.soloTarjetas}`} aria-label="Usuarios de la plataforma">
      {usuarios.map((usuario) => {
        const insignia = insigniaDeEstado(usuario);
        return (
          <li key={usuario.id} className={estilos.tarjeta}>
            <p className={estilos.tarjetaNombre}>{nombreCompleto(usuario)}</p>
            <p className={estilos.tarjetaDato}>{usuario.correo ?? ""}</p>
            <p className={estilos.tarjetaDato}>{ETIQUETA_ROL_USUARIO[usuario.rol]}</p>
            <Insignia tipo={insignia.tipo}>{insignia.texto}</Insignia>
            <div className={estilos.tarjetaAccion}>
              <EnlaceDetalle usuario={usuario} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
