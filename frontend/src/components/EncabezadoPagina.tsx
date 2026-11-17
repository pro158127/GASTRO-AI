// Encabezado común de las pantallas internas: título (h1), descripción y, a la derecha, una
// acción opcional (por ejemplo «Exportar auditoría» en W-19). El layout lleva el foco a este h1
// al cambiar de pantalla.
import type { ReactNode } from "react";
import estilos from "./EncabezadoPagina.module.css";

interface PropiedadesEncabezadoPagina {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
}

export default function EncabezadoPagina({ titulo, descripcion, acciones }: PropiedadesEncabezadoPagina) {
  return (
    <div className={estilos.encabezado}>
      <div className={estilos.textos}>
        <h1 className={estilos.titulo}>{titulo}</h1>
        {descripcion && <p className={estilos.descripcion}>{descripcion}</p>}
      </div>
      {acciones}
    </div>
  );
}
