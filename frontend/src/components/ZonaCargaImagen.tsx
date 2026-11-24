// Componente «Zona de carga de imagen» del sistema de diseño (Figma 16:671), con las cuatro
// variantes que dibuja: Vacía, Arrastrando, Cargada y Error. La variante «en proceso» de W-06f
// y W-06g es la misma «Cargada» con el avance en la segunda línea y «Cambiar imagen» inerte.
//
// Reglas del componente, tal como las fija su descripción en Figma:
// - **Arrastrar es opcional** (WCAG 2.5.7): el botón «Seleccionar archivo» hace lo mismo y es
//   la vía principal. El arrastre solo añade una comodidad para quien usa ratón.
// - El error dice **qué requisito falla** y no deja continuar (RF-D02 CA 4).
//
// En código: el `<input type="file">` queda fuera del orden de tabulación (`tabIndex={-1}`) y
// quien recibe el foco es el botón, que es el que tiene nombre accesible. El mensaje de error
// se enlaza al botón con `aria-describedby`, y la pantalla le lleva el foco cuando aparece: así
// el lector lee «Seleccionar archivo» y, a continuación, qué pasó con el archivo anterior.
//
// La miniatura es el ícono genérico que dibuja Figma, no la imagen real: la imagen endoscópica
// no se muestra aquí.
import { useRef, useState } from "react";
import type { DragEvent } from "react";
import Boton from "./Boton";
import IconoError from "./iconos/IconoError";
import IconoImagen from "./iconos/IconoImagen";
import IconoSubir from "./iconos/IconoSubir";
import IndicadorCarga from "./iconos/IndicadorCarga";
import estilos from "./ZonaCargaImagen.module.css";

/** Formatos que acepta el servidor; en celular, `image/*` abre también la cámara (nota M-06). */
const FORMATOS_ACEPTADOS = "image/jpeg,image/png,image/*";

/** La leyenda de los requisitos, igual en todas las variantes. */
const REQUISITOS = "JPEG o PNG · máximo 10 MB · mínimo 224 × 224 píxeles";

export type EstadoZonaCarga =
  /** W-06a: todavía no hay archivo. */
  | { fase: "vacia" }
  /**
   * W-06f y W-06g: hay una petición en curso. `detalle` es la segunda línea de la fila
   * («Subiendo… 64 %» o «Verificando la imagen…»).
   */
  | { fase: "ocupada"; nombre: string; detalle: string }
  /** W-06b: la imagen pasó la verificación del servidor. */
  | { fase: "cargada"; nombre: string }
  /** W-06c, W-06d y el 410: `titulo` dice qué requisito falla y `detalle`, cómo corregirlo. */
  | { fase: "error"; titulo: string; detalle: string };

interface PropiedadesZonaCargaImagen {
  estado: EstadoZonaCarga;
  /** Archivo elegido con el botón o soltado sobre la zona. */
  onArchivo: (archivo: File) => void;
  /**
   * Base de los identificadores. El botón queda en `idBotonSeleccionar(id)`, para poder
   * llevarle el foco desde la pantalla cuando un error deja la zona sin imagen.
   */
  id: string;
  /**
   * Texto del estado de la carga, bajo la zona, anunciado con `role="status"`. Es la frase
   * completa de W-06f («Subiendo «gastro_0412.jpg»… 64 %»).
   */
  textoEstado?: string;
}

/** Identificador del botón «Seleccionar archivo», para llevarle el foco desde fuera. */
export function idBotonSeleccionar(id: string): string {
  return `${id}-seleccionar`;
}

export default function ZonaCargaImagen({
  estado,
  onArchivo,
  id,
  textoEstado,
}: PropiedadesZonaCargaImagen) {
  const entradaRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const ocupada = estado.fase === "ocupada";
  const idError = `${id}-error`;

  function elegir(archivo: File | undefined) {
    if (archivo && !ocupada) onArchivo(archivo);
  }

  function abrirSelector() {
    // Se limpia antes de abrir para que elegir dos veces el mismo archivo vuelva a disparar
    // `change`: si no, reintentar con la misma imagen no haría nada.
    if (entradaRef.current) entradaRef.current.value = "";
    entradaRef.current?.click();
  }

  function alArrastrarEncima(evento: DragEvent<HTMLDivElement>) {
    if (ocupada) return;
    evento.preventDefault();
    setArrastrando(true);
  }

  function alSalirArrastre(evento: DragEvent<HTMLDivElement>) {
    // `relatedTarget` fuera de la zona: el puntero salió de verdad, no pasó a un hijo.
    if (evento.currentTarget.contains(evento.relatedTarget as Node | null)) return;
    setArrastrando(false);
  }

  function alSoltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastrando(false);
    if (ocupada) return;
    elegir(evento.dataTransfer.files[0]);
  }

  const botonSeleccionar = (
    <Boton
      id={idBotonSeleccionar(id)}
      jerarquia="secundario"
      icono={<IconoSubir className={estilos.iconoBoton} />}
      aria-describedby={estado.fase === "error" ? idError : undefined}
      onClick={abrirSelector}
    >
      Seleccionar archivo
    </Boton>
  );

  return (
    <div className={estilos.envoltura}>
      <div
        className={estilos.zona}
        data-fase={estado.fase}
        data-arrastrando={arrastrando || undefined}
        onDragOver={alArrastrarEncima}
        onDragLeave={alSalirArrastre}
        onDrop={alSoltar}
      >
        {/* Fuera del orden de tabulación: el control con nombre accesible es el botón. */}
        <input
          ref={entradaRef}
          type="file"
          accept={FORMATOS_ACEPTADOS}
          className={estilos.entradaArchivo}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(evento) => elegir(evento.target.files?.[0])}
        />

        {(estado.fase === "cargada" || estado.fase === "ocupada") && (
          <div className={estilos.archivo}>
            <div className={estilos.miniatura}>
              <IconoImagen className={estilos.iconoMiniatura} />
            </div>
            <div className={estilos.datosArchivo}>
              <p className={estilos.nombreArchivo}>{estado.nombre}</p>
              <p className={estado.fase === "cargada" ? estilos.detalleValido : estilos.detalleOcupada}>
                {estado.fase === "cargada" ? "Imagen válida · lista para continuar" : estado.detalle}
              </p>
            </div>
            <Boton
              jerarquia="terciario"
              aria-disabled={ocupada || undefined}
              onClick={abrirSelector}
            >
              Cambiar imagen
            </Boton>
          </div>
        )}

        {(estado.fase === "vacia" || estado.fase === "error") && (
          <>
            {estado.fase === "error" ? (
              <IconoError className={estilos.iconoGrande} />
            ) : (
              <IconoSubir className={estilos.iconoGrande} />
            )}
            <p className={estilos.titulo}>
              {estado.fase === "error"
                ? estado.titulo
                : arrastrando
                  ? "Suelte la imagen para cargarla"
                  : "Arrastre aquí la imagen endoscópica"}
            </p>
            {estado.fase === "error" && (
              <p id={idError} className={estilos.detalleError}>
                {estado.detalle}
              </p>
            )}
            <p className={estilos.separador}>o</p>
            {botonSeleccionar}
            <p className={estilos.requisitos}>{REQUISITOS}</p>
          </>
        )}
      </div>

      {/* W-06f: el avance se anuncia con texto, nunca solo con la animación. */}
      {textoEstado && (
        <div className={estilos.estadoCarga}>
          <IndicadorCarga className={estilos.indicador} />
          <p className={estilos.textoEstado} role="status">
            {textoEstado}
          </p>
        </div>
      )}
    </div>
  );
}
