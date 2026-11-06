// Pantalla mínima mientras se consulta la sesión al cargar la página, y cuando esa consulta
// falla por red o por el servidor. Usa los textos de W-30 y W-31 (con el código de referencia);
// no es una pantalla propia de Figma. No se confunde un fallo con «sin sesión»: eso escondería
// las caídas del servidor.
import Alerta from "../components/Alerta";
import AvisoExperimental from "../components/AvisoExperimental";
import Boton from "../components/Boton";
import IndicadorCarga from "../components/iconos/IndicadorCarga";
import { avisoDeError } from "../utils/avisosError";
import estilos from "./PantallaEstadoSesion.module.css";
import type { ErrorApi } from "../services/api";

interface PropiedadesPantallaEstadoSesion {
  /** `null` mientras carga; con valor, la consulta falló (`causa` puede ser `null`). */
  error: { causa: ErrorApi | null } | null;
  onReintentar: () => void;
}

export default function PantallaEstadoSesion({ error, onReintentar }: PropiedadesPantallaEstadoSesion) {
  const aviso = error ? avisoDeError(error.causa) : null;
  return (
    <main className={estilos.pagina}>
      {aviso ? (
        <div className={estilos.error}>
          <Alerta tipo="error" titulo={aviso.titulo}>
            {aviso.mensaje}
          </Alerta>
          <div>
            <Boton jerarquia="secundario" onClick={onReintentar}>
              Reintentar
            </Boton>
          </div>
        </div>
      ) : (
        <p className={estilos.cargando} role="status">
          <IndicadorCarga className={estilos.indicador} />
          Cargando…
        </p>
      )}
      <AvisoExperimental />
    </main>
  );
}
