// Barra superior. Escritorio y tableta (≥ 768 px): título de sección, usuario, «Mi perfil» y
// «Cerrar sesión» (W-15, T-15). Celular (< 768 px): barra azul de 56 px con el botón de menú, el
// logo y el acceso al perfil (M-15). Es un solo <header>; cada variante se oculta con CSS.
import { Link } from "react-router";
import type { RefObject } from "react";
import Boton from "../components/Boton";
import EnlaceBoton from "../components/EnlaceBoton";
import IconoMenu from "../components/iconos/IconoMenu";
import IconoSalir from "../components/iconos/IconoSalir";
import IconoUsuario from "../components/iconos/IconoUsuario";
import LogoHorizontal from "../components/LogoHorizontal";
import estilos from "./BarraSuperior.module.css";

interface PropiedadesBarraSuperior {
  titulo: string;
  /** Nombre del usuario; vacío mientras carga. */
  nombre?: string;
  rolEtiqueta?: string;
  menuAbierto: boolean;
  idPanel: string;
  botonMenuRef: RefObject<HTMLButtonElement>;
  onAbrirMenu: () => void;
  onCerrarSesion: () => void;
}

export default function BarraSuperior({
  titulo,
  nombre,
  rolEtiqueta,
  menuAbierto,
  idPanel,
  botonMenuRef,
  onAbrirMenu,
  onCerrarSesion,
}: PropiedadesBarraSuperior) {
  return (
    <header>
      <div className={estilos.escritorio}>
        <p className={estilos.titulo}>{titulo}</p>
        {nombre && (
          <>
            <IconoUsuario className={estilos.iconoUsuario} />
            <p className={estilos.usuario}>
              {nombre}
              {/* En tableta Figma solo dibuja el nombre: el rol queda como texto oculto. */}
              {rolEtiqueta && <span className={estilos.rolEnLinea}> · {rolEtiqueta}</span>}
            </p>
          </>
        )}
        <EnlaceBoton to="/perfil">Mi perfil</EnlaceBoton>
        <Boton jerarquia="secundario" icono={<IconoSalir className={estilos.iconoBoton} />} onClick={onCerrarSesion}>
          Cerrar sesión
        </Boton>
      </div>

      <div className={estilos.movil}>
        <button
          ref={botonMenuRef}
          type="button"
          className={estilos.botonIcono}
          aria-label="Abrir menú"
          aria-expanded={menuAbierto}
          aria-controls={idPanel}
          aria-haspopup="dialog"
          onClick={onAbrirMenu}
        >
          <IconoMenu className={estilos.iconoGrande} />
        </button>
        <LogoHorizontal alto={28} />
        <span className={estilos.espacio} />
        <Link to="/perfil" className={estilos.botonIcono} aria-label="Mi perfil">
          <IconoUsuario className={estilos.iconoGrande} />
        </Link>
      </div>
    </header>
  );
}
