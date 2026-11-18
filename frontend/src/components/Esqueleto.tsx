// Componente «Esqueleto» del sistema de diseño (Figma 91:2297): marcador de carga con la forma del
// contenido. Se usa en la carga inicial y al buscar o filtrar si la espera supera ~1 s.
// Es solo visual (aria-hidden): quien lo usa pone aria-busy="true" en el contenedor y un texto
// «Cargando…» para el lector de pantalla. La animación se apaga con prefers-reduced-motion.
import estilos from "./Esqueleto.module.css";

interface PropiedadesEsqueleto {
  /**
   * `fila-tabla`: variante «Fila de tabla» de Figma (5 barras).
   * `tarjeta`: no dibujada en Figma; misma idea para las listas que en tableta y celular pasan a
   * tarjetas (T-09, M-09): nombre, dos líneas e insignia.
   */
  forma: "fila-tabla" | "tarjeta";
}

export default function Esqueleto({ forma }: PropiedadesEsqueleto) {
  if (forma === "tarjeta") {
    return (
      <div className={estilos.tarjeta} aria-hidden="true">
        <span className={`${estilos.barra} ${estilos.tarjetaTitulo}`} />
        <span className={`${estilos.barra} ${estilos.tarjetaLinea}`} />
        <span className={`${estilos.barra} ${estilos.tarjetaLineaCorta}`} />
        <span className={`${estilos.barra} ${estilos.tarjetaInsignia}`} />
      </div>
    );
  }
  return (
    <div className={estilos.fila} aria-hidden="true">
      <span className={`${estilos.barra} ${estilos.ancho140}`} />
      <span className={`${estilos.barra} ${estilos.ancho140}`} />
      <span className={`${estilos.barra} ${estilos.ancho200}`} />
      <span className={`${estilos.barra} ${estilos.ancho80}`} />
      <span className={`${estilos.barra} ${estilos.ancho100}`} />
    </div>
  );
}
