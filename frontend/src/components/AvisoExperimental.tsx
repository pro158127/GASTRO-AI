// Aviso global «CA-L2» de las pantallas de Figma: fijo, sin botón de cierre.
import estilos from "./AvisoExperimental.module.css";

export default function AvisoExperimental() {
  return (
    <p className={estilos.aviso}>
      Gastro-AI es una herramienta académica y experimental. No es un dispositivo médico, no emite
      diagnósticos y requiere la interpretación de un profesional de la salud.
    </p>
  );
}
