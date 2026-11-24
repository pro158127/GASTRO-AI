// Encabezado común de las pantallas internas: título (h1), descripción y, a la derecha, una
// acción opcional (por ejemplo «Exportar auditoría» en W-19). El layout lleva el foco a este h1
// al cambiar de pantalla.
import type { ReactNode } from "react";
import estilos from "./EncabezadoPagina.module.css";

interface PropiedadesEncabezadoPagina {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  /**
   * Contenido al lado del título, en la misma línea: la insignia de estado de la cuenta en W-11
   * («Ana Pérez · Activa»). Queda fuera del `h1` para que el nombre accesible del encabezado siga
   * siendo solo el nombre; el estado ya se lee en la tarjeta de datos.
   */
  insignia?: ReactNode;
}

export default function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  insignia,
}: PropiedadesEncabezadoPagina) {
  return (
    <div className={estilos.encabezado}>
      <div className={estilos.textos}>
        {insignia ? (
          <div className={estilos.lineaTitulo}>
            <h1 className={estilos.titulo}>{titulo}</h1>
            {insignia}
          </div>
        ) : (
          <h1 className={estilos.titulo}>{titulo}</h1>
        )}
        {descripcion && <p className={estilos.descripcion}>{descripcion}</p>}
      </div>
      {acciones}
    </div>
  );
}
