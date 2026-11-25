// Componente «Tarjeta KPI» del sistema de diseño (Figma 16:694): una cifra de los dashboards
// (RF-DB01, RF-DB02). El indicador describe exactamente qué se cuenta, sin lenguaje clínico
// («prevalencia», «mejoró»), y el detalle da la base con la que se calculó.
//
// Es un `<li>` porque las tarjetas siempre van en grupo: quien la usa pone el `<ul>` y le da
// la cuadrícula. Así el lector de pantalla anuncia «lista de 5 elementos» en vez de leer
// quince párrafos sueltos.
//
// `valor` llega ya formateado («12», «78 %», «—»): aquí no se decide cómo se escribe un
// número, porque cada tarjeta tiene su escala.
import estilos from "./TarjetaIndicador.module.css";

interface PropiedadesTarjetaIndicador {
  /** Qué se cuenta: «Análisis este mes». */
  indicador: string;
  /** La cifra, ya formateada. «—» cuando todavía no hay dato. */
  valor: string;
  /** La base o el periodo: «Octubre de 2026», «32 de 41 análisis valorados». */
  detalle: string;
}

export default function TarjetaIndicador({ indicador, valor, detalle }: PropiedadesTarjetaIndicador) {
  return (
    <li className={estilos.tarjeta}>
      <p className={estilos.indicador}>{indicador}</p>
      <p className={estilos.valor}>{valor}</p>
      <p className={estilos.detalle}>{detalle}</p>
    </li>
  );
}
