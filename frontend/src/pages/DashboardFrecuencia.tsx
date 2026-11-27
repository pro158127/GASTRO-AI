// Pantalla W-15 · tarjeta «Frecuencia de características» (Figma 62:3445, RF-DB01 CA 3 y 4).
//
// **Barras, nunca un gráfico circular**: lo exige CA 3 y lo repite el esquema del backend.
//
// Se dibuja con CSS (una pista y un relleno) y no con SVG, por cuatro razones:
//
// 1. Figma no dibuja ejes, ni rejilla, ni etiquetas giradas: es una lista de filas «nombre,
//    cifra y barra redondeada de 12 px», que son dos `div`.
// 2. Los textos tienen que poder partirse en dos líneas a 320 px. Dentro de un SVG el texto
//    no se ajusta solo.
// 3. Hereda los tokens y el tamaño de letra que la persona configure en el navegador.
// 4. Sin dependencias y sin matemática de coordenadas. El ancho del relleno es el único
//    estilo en línea de la pantalla, porque es un dato y no puede vivir en el módulo CSS.
//
// **La gráfica no comunica solo con la barra.** Cada fila dice en texto cuántos análisis son
// («19 de 47 análisis»), así que quien no vea el dibujo, o no distinga el color, tiene el
// dato completo (WCAG 1.4.1). La pista y el relleno van `aria-hidden`: son el adorno, no el
// dato, y repetirlos con `role="img"` haría que el lector leyera dos veces lo mismo.
//
// **La escala es el total de análisis, no la barra mayor.** Así una característica sola no se
// dibuja al 100 % por el solo hecho de estar sola. Los anchos de Figma lo confirman: 119 px
// de 294 para «19 de 47».
import { useId } from "react";
import type { BarraFrecuencia } from "../types";
import estilos from "./DashboardFrecuencia.module.css";

interface PropiedadesDashboardFrecuencia {
  /** Rótulo exigido por CA 4. Lo manda el servidor en `frecuencia.rotulo`. */
  rotulo: string;
  barras: BarraFrecuencia[];
  /** Base de la escala: los análisis propios completados (`resumen.total_analisis`). */
  total: number;
}

/**
 * Ancho del relleno, de 0 a 100. Con `total` en cero no hay nada contra qué comparar (pasa
 * cuando el doctor solo tiene análisis en proceso o fallidos), así que la barra va vacía en
 * vez de dividir por cero. Se recorta al rango por si un conteo llegara fuera de él.
 */
function anchoBarra(analisis: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (analisis / total) * 100));
}

/**
 * «19 de 47 análisis». Sin total no se escribe «0 de 0 análisis», que se lee como un error de
 * cuenta: se dice solo el número, que es la verdad disponible. («análisis» no cambia en
 * plural, así que no hay singular que atender.)
 */
function textoCifra(analisis: number, total: number): string {
  return total <= 0 ? `${analisis} análisis` : `${analisis} de ${total} análisis`;
}

export default function DashboardFrecuencia({ rotulo, barras, total }: PropiedadesDashboardFrecuencia) {
  const idTitulo = useId();

  return (
    <section className={estilos.tarjeta} aria-labelledby={idTitulo}>
      <h2 id={idTitulo} className={estilos.titulo}>
        {rotulo}
      </h2>
      {/* «completados» no está en el texto de Figma: se añade por lo mismo que en las tarjetas
          de cifras (la base son los análisis completados del doctor, no todo su historial).
          Propuesto a diseño en CONTRATOS_API.md. */}
      <p className={estilos.descripcion}>
        Número de análisis completados en que cada característica superó el umbral de confianza
        vigente. Un mismo análisis puede señalar varias.
      </p>

      {barras.length === 0 ? (
        // PROPUESTA no dibujada: Figma siempre pinta características, y el servidor devuelve
        // todas las activas (las de 0 también), así que esta lista solo llega vacía si no hay
        // ninguna activa. Se dice con palabras en vez de dejar una tarjeta con el título solo.
        <p className={estilos.vacio}>
          Todavía no hay características activas que mostrar en la gráfica.
        </p>
      ) : (
        <ul className={estilos.lista}>
          {barras.map((barra) => (
            <li key={barra.caracteristica_id} className={estilos.fila}>
              <div className={estilos.rotulos}>
                <p className={estilos.nombre}>{barra.nombre}</p>
                <p className={estilos.cifra}>{textoCifra(barra.analisis, total)}</p>
              </div>
              {/* El dibujo: el dato ya está arriba, en texto. */}
              <div className={estilos.pista} aria-hidden="true">
                <div
                  className={estilos.relleno}
                  style={{ inlineSize: `${anchoBarra(barra.analisis, total)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Figma escribe aquí «Umbral vigente: 50 %», pero ese número no viene en la respuesta
          del dashboard y el único endpoint que lo tiene es de administrador. Escribirlo a mano
          sería inventar un dato que mañana puede ser otro; además cada resultado se guardó con
          el umbral de su día, así que un solo número tampoco describiría la gráfica entera.
          Queda propuesto al backend en CONTRATOS_API.md. */}
      <p className={estilos.nota}>
        Cada análisis se cuenta con el umbral que regía el día en que se hizo.
      </p>
    </section>
  );
}
