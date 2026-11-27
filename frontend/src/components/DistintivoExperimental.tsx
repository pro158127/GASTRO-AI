// Distintivo «Análisis experimental» que Figma pone junto al título de las tarjetas que
// muestran salida del modelo (W-08, y en la tarea 6b la explicación y la valoración).
// RF-R04: recuerda en el sitio donde se leen los números que son experimentales.
//
// No lleva icono. Figma dibuja un matraz, pero ese recurso no está exportado al proyecto y
// sustituirlo por otro de la carpeta `iconos` (la advertencia, por ejemplo) cambiaría el
// dibujo por uno distinto. El aviso global `AvisoExperimental`, que es el mismo RF-R04, ya
// se escribe sin icono. El significado va en el texto, nunca en el color (WCAG 1.4.1).
import estilos from "./DistintivoExperimental.module.css";

export default function DistintivoExperimental() {
  return <span className={estilos.distintivo}>Análisis experimental</span>;
}
