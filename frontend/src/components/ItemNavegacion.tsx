// Componente «Ítem de navegación» del sistema de diseño (Figma 16:693): estados normal,
// pasar el cursor, activo (fondo más claro + indicador naranja + negrita, aria-current="page")
// y foco (anillo blanco de 2 px). Con contador opcional (casos sin revisar).
// En la barra lateral contraída de tableta solo se ven los íconos: el nombre queda como texto
// oculto visualmente (nombre accesible) y aparece un tooltip con el nombre al pasar el cursor o
// al enfocar con teclado; se descarta con Esc (WCAG 1.4.13).
import { useEffect, useState } from "react";
import type { ComponentType, FocusEvent } from "react";
import { NavLink } from "react-router";
import type { PropiedadesIcono } from "./iconos/PropiedadesIcono";
import estilos from "./ItemNavegacion.module.css";

interface PropiedadesItemNavegacion {
  etiqueta: string;
  Icono: ComponentType<PropiedadesIcono>;
  /** Con `ruta` el ítem es un enlace; sin ella (por ejemplo «Cerrar sesión») es un botón. */
  ruta?: string;
  /** Se llama al activar el ítem (clic o teclado). */
  onActivar?: () => void;
  /** Cantidad de elementos sin revisar; no se muestra si es 0 o no se indica. */
  contador?: number;
  /** Variante de la barra lateral (se contrae a íconos en tableta y lleva tooltip). */
  enBarraLateral?: boolean;
}

export default function ItemNavegacion({
  etiqueta,
  Icono,
  ruta,
  onActivar,
  contador,
  enBarraLateral = false,
}: PropiedadesItemNavegacion) {
  const [conCursor, setConCursor] = useState(false);
  const [conFoco, setConFoco] = useState(false);
  const [descartado, setDescartado] = useState(false);

  const sobreElItem = conCursor || conFoco;
  const tooltipVisible = enBarraLateral && sobreElItem && !descartado;

  // Esc descarta el tooltip sin mover el foco ni el cursor; vuelve a estar disponible después.
  useEffect(() => {
    if (!sobreElItem) {
      setDescartado(false);
      return;
    }
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") setDescartado(true);
    }
    document.addEventListener("keydown", alPulsarTecla);
    return () => document.removeEventListener("keydown", alPulsarTecla);
  }, [sobreElItem]);

  const hayContador = typeof contador === "number" && contador > 0;
  // Se anuncia como «Casos recibidos, 4 sin revisar» (nota del componente en Figma).
  const nombreAccesible = hayContador ? `${etiqueta}, ${contador} sin revisar` : undefined;

  const contenido = (
    <>
      <Icono className={estilos.icono} />
      <span className={estilos.etiqueta}>{etiqueta}</span>
      {hayContador && (
        <span className={estilos.contador} aria-hidden="true">
          {contador}
        </span>
      )}
    </>
  );

  // El tooltip solo sigue al foco de teclado, no al del ratón.
  const alEnfocar = (evento: FocusEvent<HTMLElement>) =>
    setConFoco(evento.currentTarget.matches(":focus-visible"));
  const alDesenfocar = () => setConFoco(false);

  return (
    <li
      className={[estilos.elemento, enBarraLateral ? estilos.enBarra : ""].filter(Boolean).join(" ")}
      onMouseEnter={() => setConCursor(true)}
      onMouseLeave={() => setConCursor(false)}
    >
      {ruta ? (
        <NavLink
          to={ruta}
          end
          className={({ isActive }) => [estilos.item, isActive ? estilos.activo : ""].filter(Boolean).join(" ")}
          onClick={onActivar}
          aria-label={nombreAccesible}
          onFocus={alEnfocar}
          onBlur={alDesenfocar}
        >
          {contenido}
        </NavLink>
      ) : (
        <button
          type="button"
          className={estilos.item}
          onClick={onActivar}
          aria-label={nombreAccesible}
          onFocus={alEnfocar}
          onBlur={alDesenfocar}
        >
          {contenido}
        </button>
      )}
      {enBarraLateral && (
        <span
          className={[estilos.tooltip, tooltipVisible ? estilos.tooltipVisible : ""].filter(Boolean).join(" ")}
          aria-hidden="true"
        >
          <span className={estilos.tooltipTexto}>{etiqueta}</span>
        </span>
      )}
    </li>
  );
}
