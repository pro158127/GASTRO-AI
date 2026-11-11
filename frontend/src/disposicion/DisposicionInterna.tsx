// Estructura común de las pantallas internas: enlace «Saltar al contenido», barra lateral,
// barra superior, contenido (<main>) y pie con el aviso experimental. En celular el menú es un
// diálogo (PanelMenuMovil). Se usa como ruta de diseño: las pantallas entran por <Outlet />.
import { useEffect, useId, useRef, useState } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router";
import AvisoExperimental from "../components/AvisoExperimental";
import { buscarPantalla, tituloDePantalla } from "../navegacion/pantallas";
import { etiquetaRol, menusPorRol } from "../navegacion/menus";
import { ProveedorUsuario, useUsuarioActual } from "../sesion/UsuarioActual";
import { useSesion } from "../sesion/ProveedorSesion";
import BarraLateral from "./BarraLateral";
import BarraSuperior from "./BarraSuperior";
import EnlaceSaltarContenido from "./EnlaceSaltarContenido";
import PanelMenuMovil from "./PanelMenuMovil";
import estilos from "./DisposicionInterna.module.css";

export default function DisposicionInterna() {
  return (
    <ProveedorUsuario>
      <Armazon />
    </ProveedorUsuario>
  );
}

function Armazon() {
  const { usuario, rol, casosSinRevisar } = useUsuarioActual();
  const { cerrarSesion } = useSesion();
  const ubicacion = useLocation();
  const tipoNavegacion = useNavigationType();
  const idPanel = useId();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const principalRef = useRef<HTMLElement>(null);
  const botonMenuRef = useRef<HTMLButtonElement>(null);
  const ultimaRuta = useRef<string | null>(null);

  const items = menusPorRol[rol];
  const rolEtiqueta = etiquetaRol[rol];
  const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`;

  const pantalla = buscarPantalla(ubicacion.pathname);
  const tituloPantalla = pantalla ? tituloDePantalla(pantalla, rol) : undefined;
  // La barra superior muestra el nombre del ítem del menú («Dashboard», aunque el h1 del
  // administrador sea «Dashboard técnico»); fuera del menú (Mi perfil) usa el título de la pantalla.
  const tituloBarra = items.find((item) => item.ruta === ubicacion.pathname)?.etiqueta ?? tituloPantalla ?? "";

  // Título de la pestaña por ruta (WCAG 2.4.2).
  useEffect(() => {
    document.title = tituloPantalla ? `${tituloPantalla} · Gastro-AI` : "Gastro-AI";
  }, [tituloPantalla]);

  // Al cambiar de pantalla, el foco va al h1 (o al <main>) y la página vuelve arriba. No se hace
  // en la carga o recarga directa (tipo POP), para no robar el foco ni saltarse el enlace
  // «Saltar al contenido»; sí se hace al entrar tras iniciar sesión (REPLACE).
  useEffect(() => {
    if (ultimaRuta.current === ubicacion.pathname) return;
    const esPrimera = ultimaRuta.current === null;
    ultimaRuta.current = ubicacion.pathname;
    if (esPrimera && tipoNavegacion === "POP") return;
    const principal = principalRef.current;
    if (!principal) return;
    window.scrollTo(0, 0);
    const titulo = principal.querySelector<HTMLElement>("h1");
    if (titulo) {
      titulo.tabIndex = -1;
      titulo.focus({ preventScroll: true });
    } else {
      principal.focus({ preventScroll: true });
    }
  }, [ubicacion.pathname, tipoNavegacion]);

  // Si la ventana pasa a tableta o escritorio con el panel abierto, se cierra.
  useEffect(() => {
    const consulta = window.matchMedia("(min-width: 768px)");
    const alCambiar = () => {
      if (consulta.matches) setMenuAbierto(false);
    };
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, []);

  return (
    <div className={estilos.disposicion}>
      <EnlaceSaltarContenido onActivar={() => principalRef.current?.focus()} />
      <BarraLateral items={items} rolEtiqueta={rolEtiqueta} casosSinRevisar={casosSinRevisar} />
      <div className={estilos.area}>
        <BarraSuperior
          titulo={tituloBarra}
          nombre={nombreCompleto}
          rolEtiqueta={rolEtiqueta}
          menuAbierto={menuAbierto}
          idPanel={idPanel}
          botonMenuRef={botonMenuRef}
          onAbrirMenu={() => setMenuAbierto(true)}
          onCerrarSesion={cerrarSesion}
        />
        <main id="contenido" ref={principalRef} tabIndex={-1} className={estilos.principal}>
          <Outlet />
        </main>
        <footer className={estilos.pie}>
          <AvisoExperimental />
        </footer>
      </div>
      {menuAbierto && (
        <PanelMenuMovil
          id={idPanel}
          items={items}
          casosSinRevisar={casosSinRevisar}
          usuario={`${nombreCompleto} · ${rolEtiqueta}`}
          onCerrar={() => setMenuAbierto(false)}
          onCerrarSesion={cerrarSesion}
        />
      )}
    </div>
  );
}
