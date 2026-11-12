// TEMPORAL: reemplazar antes de la entrega.
// Marcador de las pantallas que todavía no se construyen. No es un diseño de Figma: solo muestra
// el nombre de la pantalla para que el menú y las rutas se puedan probar.
import EncabezadoPagina from "../components/EncabezadoPagina";

export default function PantallaPendiente({ titulo }: { titulo: string }) {
  return (
    <EncabezadoPagina titulo={titulo} descripcion="Esta pantalla se construirá en una tarea posterior." />
  );
}
