// Barra lateral (Figma: «Barra lateral», 248 px). En tableta (768 a 1279 px) se contrae a 72 px
// con solo íconos (T-15); en celular se oculta y su lugar lo toma el panel de PanelMenuMovil.
import ItemNavegacion from "../components/ItemNavegacion";
import LogoHorizontal from "../components/LogoHorizontal";
import type { ItemMenu } from "../navegacion/menus";
import estilos from "./BarraLateral.module.css";

interface PropiedadesBarraLateral {
  items: ItemMenu[];
  /** «Doctor» o «Administrador»; vacío mientras carga el usuario. */
  rolEtiqueta?: string;
  casosSinRevisar: number;
}

export default function BarraLateral({ items, rolEtiqueta, casosSinRevisar }: PropiedadesBarraLateral) {
  return (
    <div className={estilos.barra}>
      <div className={estilos.marca}>
        <LogoHorizontal alto={36} />
        {rolEtiqueta && <p className={estilos.rol}>Rol: {rolEtiqueta}</p>}
      </div>
      <nav aria-label="Principal">
        <ul className={estilos.lista}>
          {items.map((item) => (
            <ItemNavegacion
              key={item.id}
              etiqueta={item.etiqueta}
              Icono={item.Icono}
              ruta={item.ruta}
              contador={item.conContadorCasosRecibidos ? casosSinRevisar : undefined}
              enBarraLateral
            />
          ))}
        </ul>
      </nav>
    </div>
  );
}
