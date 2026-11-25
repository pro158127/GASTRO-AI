// Componente «Esqueleto» del sistema de diseño (Figma 91:2297): marcador de carga con la forma del
// contenido. Se usa en la carga inicial y al buscar o filtrar si la espera supera ~1 s.
// Es solo visual (aria-hidden): quien lo usa pone aria-busy="true" en el contenedor y un texto
// «Cargando…» para el lector de pantalla. La animación se apaga con prefers-reduced-motion.
import estilos from "./Esqueleto.module.css";

interface PropiedadesEsqueleto {
  /**
   * `fila-tabla`: variante «Fila de tabla» de Figma (5 barras).
   * `tarjeta-indicador`: variante «Tarjeta de indicador» de Figma (91:2292), la que usa W-15e
   * mientras cargan las cifras del dashboard: etiqueta, cifra y detalle.
   * `tarjeta`: no dibujada en Figma; misma idea para las listas que en tableta y celular pasan a
   * tarjetas (T-09, M-09): nombre, dos líneas e insignia.
   * `parrafo`: cuatro líneas de ancho decreciente, para un bloque de texto que todavía no
   * llega. Lo pide la nota de W-08c («esqueleto con forma de párrafo»).
   */
  forma: "fila-tabla" | "tarjeta-indicador" | "tarjeta" | "parrafo";
}

export default function Esqueleto({ forma }: PropiedadesEsqueleto) {
  if (forma === "parrafo") {
    return (
      <div className={estilos.parrafo} aria-hidden="true">
        <span className={`${estilos.barra} ${estilos.parrafoLinea}`} />
        <span className={`${estilos.barra} ${estilos.parrafoLinea}`} />
        <span className={`${estilos.barra} ${estilos.parrafoLinea}`} />
        <span className={`${estilos.barra} ${estilos.parrafoUltima}`} />
      </div>
    );
  }

  if (forma === "tarjeta-indicador") {
    return (
      <div className={estilos.tarjeta} aria-hidden="true">
        <span className={`${estilos.barra} ${estilos.indicadorEtiqueta}`} />
        <span className={`${estilos.barra} ${estilos.indicadorValor}`} />
        <span className={`${estilos.barra} ${estilos.indicadorDetalle}`} />
      </div>
    );
  }

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
