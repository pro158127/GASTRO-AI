import estilos from "./Spinner.module.css";

export default function Spinner() {
  return <span className={estilos.spinner} aria-label="Cargando" />;
}
