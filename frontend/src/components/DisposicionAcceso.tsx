// Estructura común de las pantallas de acceso (W-01 a W-04): logotipo, tarjeta centrada y aviso
// experimental fijo. El ancho de la tarjeta es el de Figma en cada pantalla (440, 480 o 560 px);
// Figma solo dibuja 1440 px, así que el diseño es fluido para tableta y celular.
import type { ReactNode } from "react";
import AvisoExperimental from "./AvisoExperimental";
import Logo from "./Logo";
import estilos from "./DisposicionAcceso.module.css";

interface PropiedadesDisposicionAcceso {
  ancho?: 440 | 480 | 560;
  children: ReactNode;
}

export default function DisposicionAcceso({ ancho = 440, children }: PropiedadesDisposicionAcceso) {
  return (
    <main className={estilos.pagina}>
      <Logo />
      <div className={estilos.tarjeta} data-ancho={ancho}>
        {children}
      </div>
      <AvisoExperimental />
    </main>
  );
}
