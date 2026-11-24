// Componente «Lista desplegable» del sistema de diseño (Figma 70:2295). Es un `<select>` nativo,
// como pide la descripción del componente: el desplegable, el teclado y el anuncio del lector de
// pantalla son los del navegador, que es lo que mejor funciona en celular y con tecnologías de
// apoyo. Lo único propio es el aspecto: el mismo control del campo de texto, con chevron.
//
// Mismo contrato que `CampoTexto`: etiqueta visible y obligatoria (el marcador no la reemplaza),
// `ayuda`, y `mensajeError` que pinta ícono + texto sin borrar lo elegido.
//
// Además trae los tres estados de `CampoRol`, porque las listas de esta aplicación se llenan con
// una consulta a la API y el campo tiene que poder decir que está cargando o que falló:
// - `cargando`: la etiqueta y un texto anunciado con `role="status"`.
// - `error`: qué pasó y un botón «Reintentar», sin tocar el resto del formulario.
// - normal: el `<select>`.
// Así W-25 no repite ese bloque, y la bitácora y los logs técnicos lo encuentran hecho.
//
// No hay lista de respaldo escrita a mano: sin opciones no se puede elegir y el formulario no
// deja continuar, que es justo lo que tiene que pasar.
import { useId } from "react";
import Boton from "./Boton";
import IconoChevronAbajo from "./iconos/IconoChevronAbajo";
import IconoError from "./iconos/IconoError";
import type { Opcion } from "./CampoOpciones";
import estilos from "./CampoLista.module.css";

/** Fallo al cargar las opciones, con la forma de recuperarse. */
export interface ErrorCatalogo {
  /** Qué pasó y qué implica, en una frase. */
  texto: string;
  /** Lo que completa «Reintentar…» para el lector de pantalla: « cargar los doctores». */
  nombreAccion: string;
  onReintentar: () => void;
}

interface PropiedadesCampoLista {
  /** Etiqueta visible y persistente; el marcador nunca la reemplaza. */
  etiqueta: string;
  opciones: readonly Opcion[];
  valor: string;
  onCambio: (valor: string) => void;
  id?: string;
  /** `name` del control, por si el campo va dentro de un formulario. */
  nombre?: string;
  ayuda?: string;
  /** Si existe, el campo pasa al estado «Error» (ícono + texto) y no cambia lo elegido. */
  mensajeError?: string;
  disabled?: boolean;
  /**
   * Primera opción, vacía, para no elegir nada por defecto («Elija un doctor»). Si se omite, el
   * campo empieza en la primera opción de la lista, que es lo que hace un `<select>` nativo.
   */
  marcador?: string;
  /** Las opciones todavía están en camino. */
  cargando?: boolean;
  /** Texto del estado de carga («Cargando los doctores…»). */
  textoCargando?: string;
  /** Las opciones no se pudieron cargar. */
  error?: ErrorCatalogo;
}

export default function CampoLista({
  etiqueta,
  opciones,
  valor,
  onCambio,
  id,
  nombre,
  ayuda,
  mensajeError,
  disabled = false,
  marcador,
  cargando = false,
  textoCargando = "Cargando las opciones…",
  error,
}: PropiedadesCampoLista) {
  const idGenerado = useId();
  const idCampo = id ?? idGenerado;
  const idAyuda = `${idCampo}-ayuda`;
  const idError = `${idCampo}-error`;
  const hayError = Boolean(mensajeError);
  const describedBy = hayError ? idError : ayuda ? idAyuda : undefined;

  // Quedarse sin opciones y sin carga en curso es, para quien mira la pantalla, lo mismo que un
  // fallo: nunca se deja el campo en blanco sin explicación.
  const sinOpciones = !cargando && opciones.length === 0;

  if (cargando || error || sinOpciones) {
    return (
      <div className={estilos.campo}>
        <p className={estilos.etiqueta}>{etiqueta}</p>
        {cargando ? (
          <p className={estilos.cargando} role="status">
            {textoCargando}
          </p>
        ) : error ? (
          <>
            <div className={estilos.error}>
              <IconoError tamano={16} className={estilos.iconoError} />
              <p className={estilos.textoError}>{error.texto}</p>
            </div>
            <div>
              <Boton jerarquia="secundario" onClick={error.onReintentar}>
                Reintentar
                <span className={estilos.soloLector}> {error.nombreAccion}</span>
              </Boton>
            </div>
          </>
        ) : (
          <div className={estilos.error}>
            <IconoError tamano={16} className={estilos.iconoError} />
            <p className={estilos.textoError}>{mensajeError ?? "No hay ninguna opción disponible."}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={estilos.campo}>
      <label
        htmlFor={idCampo}
        className={[estilos.etiqueta, disabled ? estilos.etiquetaDeshabilitada : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {etiqueta}
      </label>
      <div className={estilos.control} data-error={hayError || undefined} data-deshabilitado={disabled || undefined}>
        <select
          id={idCampo}
          name={nombre}
          className={estilos.entrada}
          value={valor}
          disabled={disabled}
          aria-invalid={hayError || undefined}
          aria-describedby={describedBy}
          onChange={(evento) => onCambio(evento.target.value)}
        >
          {marcador !== undefined && <option value="">{marcador}</option>}
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>
        <IconoChevronAbajo className={estilos.chevron} />
      </div>
      {hayError ? (
        <div id={idError} className={estilos.mensajeError}>
          <IconoError tamano={16} className={estilos.iconoError} />
          <p className={estilos.textoError}>{mensajeError}</p>
        </div>
      ) : (
        ayuda && (
          <p
            id={idAyuda}
            className={[estilos.ayuda, disabled ? estilos.ayudaDeshabilitada : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}
