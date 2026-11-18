// Menú de celular (Figma M-00): panel de 300 px sobre una capa oscura, con logo, usuario,
// módulos, «Mi perfil» y «Cerrar sesión». Es un diálogo modal: el foco queda dentro mientras
// está abierto, se cierra con la X, tocando fuera o con Esc, y el foco vuelve al botón que lo abrió.
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
  onCerrar: () => void;
  onCerrarSesion: () => void;
}

export default function PanelMenuMovil({
  id,
  items,
  casosSinRevisar,
  usuario,
  onCerrar,
  onCerrarSesion,
}: PropiedadesPanelMenuMovil) {
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
      <div ref={panelRef} id={id} role="dialog" aria-modal="true" aria-label="Menú de navegación" className={estilos.panel}>
        <div className={estilos.cabecera}>
          <LogoHorizontal alto={32} />
          <span className={estilos.espacio} />
          <button type="button" className={estilos.botonCerrar} aria-label="Cerrar menú" onClick={onCerrar}>
            <IconoCerrar className={estilos.iconoCerrar} />
          </button>
        </div>
        {usuario && <p className={estilos.usuario}>{usuario}</p>}
        <nav aria-label="Principal">
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
            <ItemNavegacion etiqueta="Mi perfil" Icono={IconoUsuario} ruta="/perfil" onActivar={onCerrar} />
            <ItemNavegacion etiqueta="Cerrar sesión" Icono={IconoSalir} onActivar={onCerrarSesion} />
          </ul>
        </nav>
      </div>
    </>
  );
}
