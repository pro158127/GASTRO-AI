// Indicador/Cargando (Figma 13:493): aro tenue y arco que gira. Hereda el color del texto del
// botón que lo contiene. Siempre se acompaña de texto («Iniciando sesión…»): no comunica solo.
import type { PropiedadesIcono } from "./PropiedadesIcono";
import estilos from "./IndicadorCarga.module.css";

export default function IndicadorCarga({ className }: PropiedadesIcono) {
  return (
    <svg
      className={[estilos.indicador, className ?? ""].filter(Boolean).join(" ")}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
      focusable="false"
    >
      <path
        opacity="0.3"
        d="M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z"
      />
      <path
        strokeLinecap="round"
        d="M18 10C18 7.87827 17.1571 5.84344 15.6569 4.34315C14.1566 2.84285 12.1217 2 10 2"
      />
    </svg>
  );
}
