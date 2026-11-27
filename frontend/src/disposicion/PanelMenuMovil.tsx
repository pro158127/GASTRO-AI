// Menú de celular (Figma M-00): panel de 300 px sobre una capa oscura, con logo, usuario,
// módulos, «Mi perfil» y «Cerrar sesión». Es un diálogo modal: el foco queda dentro mientras
// está abierto, se cierra con la X, tocando fuera o con Esc, y el foco vuelve al botón que lo abrió.
//
// **Tiene dos modos**, y la diferencia no es estética:
//
// 1. Lo abre la persona con el botón ☰: diálogo modal, como siempre.
// 2. Lo abre el recorrido guiado de TOPOLOGO en sus pasos de «ítem del menú» y de «su cuenta»
//    (M-14g, M-14h, M-19f, M-19p): **no es un diálogo**. No atrapa el foco, no responde a Esc, no
//    se cierra tocando fuera, no bloquea el desplazamiento del fondo y no pinta su capa oscura.
//    No es un diálogo porque la persona no lo abrió ni puede usarlo: es decoración que el
//    recorrido está explicando, y la capa del recorrido va por encima y captura todos los clics.
//
// Si en ese modo siguiera siendo un diálogo, pasarían cuatro cosas, todas malas: se llevaría el
// foco a su botón «Cerrar menú» (es el último en la pila de `useAtraparFoco`), atraparía el
// tabulador fuera de la tarjeta del recorrido, Esc cerraría el menú en vez de omitir el recorrido,
// y su capa oscura oscurecería el ítem resaltado, que es exactamente lo que el hueco intenta
// evitar.
//
// Los dos modos son dos componentes y no un `if` dentro de uno, porque los hooks no se pueden
// llamar condicionalmente.
import { useEffect, useRef } from "react";
import IconoCerrar from "../components/iconos/IconoCerrar";
import IconoSalir from "../components/iconos/IconoSalir";
import IconoUsuario from "../components/iconos/IconoUsuario";
import ItemNavegacion from "../components/ItemNavegacion";
import LogoHorizontal from "../components/LogoHorizontal";
import type { ItemMenu } from "../navegacion/menus";
import { useAtraparFoco } from "./useAtraparFoco";
import estilos from "./PanelMenuMovil.module.css";

interface PropiedadesPanelMenuMovil {
  id: string;
  items: ItemMenu[];
  casosSinRevisar: number;
  /** «Nombre · Rol»; vacío mientras carga el usuario. */
  usuario?: string;
  /** Lo pidió el recorrido guiado: entonces no se comporta como diálogo (ver la cabecera). */
  controladoPorRecorrido?: boolean;
  onCerrar: () => void;
  onCerrarSesion: () => void;
}

export default function PanelMenuMovil(propiedades: PropiedadesPanelMenuMovil) {
  return propiedades.controladoPorRecorrido ? (
    <PanelDelRecorrido {...propiedades} />
  ) : (
    <PanelDialogo {...propiedades} />
  );
}

/** Modo 1: lo abrió la persona. Diálogo modal, con capa oscura y foco atrapado. */
function PanelDialogo(propiedades: PropiedadesPanelMenuMovil) {
  const { id, onCerrar } = propiedades;
  const panelRef = useRef<HTMLDivElement>(null);
  useAtraparFoco(panelRef, onCerrar);

  // Mientras el panel está abierto, el contenido de atrás no se desplaza.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  return (
    <>
      {/* Tocar fuera cierra el menú; Esc y la X son las vías de teclado. */}
      <div className={estilos.capa} onClick={onCerrar} aria-hidden="true" />
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className={estilos.panel}
      >
        <Contenido {...propiedades} />
      </div>
    </>
  );
}

/**
 * Modo 2: lo pidió el recorrido. Solo el panel, sin capa oscura (la pone el recorrido, con su
 * hueco) y sin nada de diálogo. **No lleva `role="dialog"` ni `aria-modal`**: el diálogo es la
 * tarjeta del recorrido, y dos `aria-modal` a la vez dejarían al lector de pantalla sin saber
 * cuál manda. Tampoco lleva `aria-label`: sin `role` no nombraría nada: el nombre accesible lo
 * tiene el `<nav>` de dentro, que es el que lo necesita.
 *
 * El `id` sí se queda: es el `aria-controls` del botón ☰ de la barra superior.
 *
 * El desplazamiento del fondo **no** se bloquea aquí a propósito: los pasos de zona necesitan que
 * la página se pueda desplazar para traer el elemento a la vista, y si este modo lo bloqueara
 * habría que acordarse de restablecerlo antes de medir. No bloquearlo quita el problema de raíz.
 */
function PanelDelRecorrido(propiedades: PropiedadesPanelMenuMovil) {
  return (
    <div id={propiedades.id} className={estilos.panel}>
      <Contenido {...propiedades} />
    </div>
  );
}

function Contenido({ items, casosSinRevisar, usuario, onCerrar, onCerrarSesion }: PropiedadesPanelMenuMovil) {
  return (
    <>
      <div className={estilos.cabecera}>
        <LogoHorizontal alto={32} />
        <span className={estilos.espacio} />
        <button type="button" className={estilos.botonCerrar} aria-label="Cerrar menú" onClick={onCerrar}>
          <IconoCerrar className={estilos.iconoCerrar} />
        </button>
      </div>
      {usuario && <p className={estilos.usuario}>{usuario}</p>}
      {/* Dos listas y no una: el último paso del recorrido de los dos roles (M-14h, M-19p)
          ilumina «Mi perfil» y «Cerrar sesión» **juntos**, y el anillo necesita una caja real que
          los contenga. Un `<div>` dentro de un `<ul>` no es HTML válido y `display: contents` no
          generaría caja, así que son dos `<ul>` hermanos dentro del mismo `<nav>`, con el mismo
          `gap` que tendrían como una sola lista: se ven idénticos. Es la misma solución que en
          `BarraSuperior.tsx` para este paso en escritorio.

          Consecuencia aceptada: el lector de pantalla anuncia «lista de N» y «lista de 2» en vez
          de una sola lista. */}
      <nav aria-label="Principal" className={estilos.navegacion}>
        <ul className={estilos.lista}>
          {items.map((item) => (
            <ItemNavegacion
              key={item.id}
              etiqueta={item.etiqueta}
              Icono={item.Icono}
              ruta={item.ruta}
              incluyeSubrutas={item.incluyeSubrutas}
              contador={item.conContadorCasosRecibidos ? casosSinRevisar : undefined}
              onActivar={onCerrar}
            />
          ))}
        </ul>
        <ul className={estilos.lista} data-recorrido="cuenta-movil">
          <ItemNavegacion etiqueta="Mi perfil" Icono={IconoUsuario} ruta="/perfil" onActivar={onCerrar} />
          <ItemNavegacion etiqueta="Cerrar sesión" Icono={IconoSalir} onActivar={onCerrarSesion} />
        </ul>
      </nav>
    </>
  );
}
