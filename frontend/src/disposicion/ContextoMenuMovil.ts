// Única vía por la que el recorrido guiado de TOPOLOGO abre y cierra el menú de celular.
//
// El menú vive en `DisposicionInterna` (su estado, su panel) y el recorrido se monta dentro del
// `<Outlet />`, así que no son padre e hijo: hace falta un contexto. Se eligió esto en vez de
// subir el recorrido a la disposición porque el recorrido sí depende del dashboard —ancla a sus
// elementos y arranca cuando sus datos están en pantalla—, y la disposición no tiene por qué
// saber del estado de carga de los dos dashboards ni de las dos listas de pasos.
//
// Lo que se comparte es **una petición**, no el estado del menú: el recorrido pide «ábrelo» o
// «suéltalo» y la disposición decide. Así el menú que abre la persona con el botón ☰ y el que
// abre el recorrido siguen siendo dos cosas distintas, y el panel puede comportarse distinto en
// cada caso (ver `PanelMenuMovil`).
import { createContext, useContext } from "react";

export interface MenuMovil {
  /** `true` mientras el paso actual necesite el menú abierto; `false` al salir de esos pasos. */
  pedirMenuDelRecorrido: (abierto: boolean) => void;
}

/** Sin proveedor no hay menú que pedir: el recorrido funciona igual, sin pasos de menú. */
const SIN_MENU: MenuMovil = { pedirMenuDelRecorrido: () => {} };

const Contexto = createContext<MenuMovil>(SIN_MENU);

export const ProveedorMenuMovil = Contexto.Provider;

export function useMenuMovil(): MenuMovil {
  return useContext(Contexto);
}
