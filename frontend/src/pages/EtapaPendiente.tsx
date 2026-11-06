// TEMPORAL: reemplazar antes de la entrega.
// Marcador de las pantallas de etapa del inicio de sesión que todavía no se construyen
// (W-02, W-03, W-04). No es un diseño de Figma. El botón «Cancelar» evita que quien llegue
// aquí quede atrapado: cierra la sesión y vuelve a W-01.
import Boton from "../components/Boton";
import EncabezadoPagina from "../components/EncabezadoPagina";
import Logo from "../components/Logo";
import { useSesion } from "../sesion/ProveedorSesion";
import estilos from "./EtapaPendiente.module.css";

export default function EtapaPendiente({ codigo, titulo }: { codigo: string; titulo: string }) {
  const { cerrarSesion } = useSesion();
  return (
    <main className={estilos.pagina}>
      <Logo />
      <div className={estilos.contenido}>
        <EncabezadoPagina
          titulo={`${codigo} · ${titulo}`}
          descripcion="Esta pantalla se construirá en una tarea posterior."
        />
        <div>
          <Boton jerarquia="secundario" onClick={cerrarSesion}>
            Cancelar
          </Boton>
        </div>
      </div>
    </main>
  );
}
