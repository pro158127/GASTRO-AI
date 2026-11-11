// Pantalla W-28 · Sin permisos (RF-U03 CA 5). Un usuario intenta abrir una sección de otro rol.
// La validación real ocurre en el servidor (403 PERMISO_DENEGADO); esta pantalla solo informa y no
// revela qué contiene la sección.
import EstadoVacio from "../components/EstadoVacio";
import EnlaceBoton from "../components/EnlaceBoton";
import { useUsuarioActual } from "../sesion/UsuarioActual";
import estilos from "./SinPermisos.module.css";

export default function SinPermisos() {
  const { rol } = useUsuarioActual();
  // Figma dibuja el caso del doctor; para el administrador es la misma frase con el rol contrario.
  const paraQuien = rol === "doctor" ? "administradores" : "doctores";
  return (
    <div className={estilos.centro}>
      <EstadoVacio
        titulo="No tiene permiso para ver esta página"
        mensaje={`Esta sección es solo para ${paraQuien}. Si cree que es un error, comuníquese con el administrador de la plataforma.`}
      >
        <EnlaceBoton to="/dashboard" jerarquia="primario">
          Ir a mi dashboard
        </EnlaceBoton>
      </EstadoVacio>
    </div>
  );
}
