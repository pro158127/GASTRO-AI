// «Anterior» / «Siguiente» de una lista paginada, como los dibuja W-16 (y W-09).
//
// **Migración pendiente:** este componente sale del bloque que `src/pages/Usuarios.tsx`
// tiene escrito a mano (la paginación de W-09), pero W-09 **no** se migró. Esa pantalla ya
// está en `main` y probada, y a dos días del cierre cambiarle marcado que funciona para
// ahorrar doce líneas no compensaba: la última vez que se tocó algo de lo que dependía se
// rompió sin dar ningún error de compilación. Cuando haya margen, Usuarios.tsx debería
// pasar a usar esto y quedarse sin su `.paginacion` propio.
//
// El foco después de cambiar de página lo maneja quien use el componente, no él: el botón
// pulsado puede quedar deshabilitado al llegar a la primera o la última página, así que el
// foco tiene que irse a la lista nueva. W-09 y W-16 lo hacen con un contenedor
// `tabIndex={-1}`.
import Boton from "./Boton";
import type { Paginacion } from "../types";
import estilos from "./ControlesPaginacion.module.css";

interface PropiedadesControlesPaginacion {
  paginacion: Paginacion;
  /** Mientras carga, los dos botones quedan fuera de juego. */
  cargando: boolean;
  onIrAPagina: (pagina: number) => void;
}

/** Cuántas páginas hay en total. Al menos una, aunque no haya resultados. */
export function totalDePaginas({ total, por_pagina }: Paginacion): number {
  return Math.max(1, Math.ceil(total / por_pagina));
}

export default function ControlesPaginacion({
  paginacion,
  cargando,
  onIrAPagina,
}: PropiedadesControlesPaginacion) {
  const paginas = totalDePaginas(paginacion);
  return (
    <div className={estilos.paginacion}>
      <Boton
        jerarquia="secundario"
        disabled={cargando || paginacion.pagina <= 1}
        onClick={() => onIrAPagina(paginacion.pagina - 1)}
      >
        Anterior
      </Boton>
      <Boton
        jerarquia="secundario"
        disabled={cargando || paginacion.pagina >= paginas}
        onClick={() => onIrAPagina(paginacion.pagina + 1)}
      >
        Siguiente
      </Boton>
    </div>
  );
}
