// Componente «Encabezado de tabla» del sistema de diseño (Figma 16:710): la celda de encabezado
// de una columna que se puede ordenar.
//
// Su descripción en Figma pide exactamente esto: «Encabezado ordenable. Ícono + en código
// aria-sort="ascending|descending|none"». El estado lo dice `aria-sort` en el `th`, no el ícono,
// que es decorativo; y el texto visible es el nombre accesible del botón, sin `aria-label` que lo
// reemplace (WCAG 2.5.3).
//
// Solo se usa en columnas que el **servidor** sabe ordenar: una columna que se reordenara sola en
// el navegador mentiría en cuanto hubiera más de una página.
import IconoOrdenAsc from "./iconos/IconoOrdenAsc";
import IconoOrdenDesc from "./iconos/IconoOrdenDesc";
import IconoOrdenar from "./iconos/IconoOrdenar";
import estilos from "./EncabezadoTabla.module.css";

/** Cómo está ordenada esta columna ahora mismo. */
export type OrdenColumna = "ninguno" | "ascendente" | "descendente";

const ARIA_SORT: Record<OrdenColumna, "none" | "ascending" | "descending"> = {
  ninguno: "none",
  ascendente: "ascending",
  descendente: "descending",
};

interface PropiedadesEncabezadoTabla {
  /** Texto de la columna. */
  columna: string;
  orden: OrdenColumna;
  /** Alterna el orden de esta columna. */
  onOrdenar: () => void;
  /** Clase de la columna (el ancho lo pone la tabla que lo usa). */
  className?: string;
}

export default function EncabezadoTabla({
  columna,
  orden,
  onOrdenar,
  className,
}: PropiedadesEncabezadoTabla) {
  const Icono =
    orden === "ascendente" ? IconoOrdenAsc : orden === "descendente" ? IconoOrdenDesc : IconoOrdenar;

  return (
    <th
      scope="col"
      aria-sort={ARIA_SORT[orden]}
      className={[estilos.encabezado, orden !== "ninguno" ? estilos.ordenando : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <button type="button" className={estilos.boton} onClick={onOrdenar}>
        <span>{columna}</span>
        <Icono className={estilos.icono} />
      </button>
    </th>
  );
}
