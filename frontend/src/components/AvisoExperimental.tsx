// Aviso global «CA-L2» de las pantallas de Figma: fijo, sin botón de cierre.
// RF-R04 (criterio 3): lleva la etiqueta «Análisis experimental» y la frase de valoración
// preventiva. No se puede ocultar ni desactivar: sin botón, enlace ni manejadores.
import estilos from "./AvisoExperimental.module.css";

export default function AvisoExperimental() {
  return (
    <p className={estilos.aviso}>
      <strong className={estilos.etiqueta}>Análisis experimental</strong>{" "}
      <span className={estilos.valoracion}>
        Valoración preventiva probabilística experimental. No sustituye el juicio profesional.
      </span>{" "}
      Gastro-AI es una herramienta académica y experimental. No es un dispositivo médico, no emite
      diagnósticos y requiere la interpretación de un profesional de la salud.
    </p>
  );
}
