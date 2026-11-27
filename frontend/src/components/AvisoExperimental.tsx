// Aviso experimental de RF-R04 (criterio 3), componente «Aviso experimental» de Figma (14:561).
// Lleva la etiqueta «Análisis experimental» y la frase de valoración preventiva. No se puede
// ocultar ni desactivar: sin botón, enlace ni manejadores.
//
// **El texto es fijo en el código, a propósito.** Lo pide la nota del componente en Figma («no
// exponer propiedades de texto para que nadie lo altere»), así que tampoco se toma de la
// respuesta de la API, que manda su propio `aviso`: un texto que llega por la red es un texto
// que alguien puede cambiar.
//
// Dos formatos, los dos de Figma:
// - `global`: el aviso «CA-L2» del pie de todas las pantallas internas y de acceso.
// - `banner`: el recuadro ámbar dentro del contenido (14:549), en las pantallas con salida del
//   modelo y en el dashboard clínico. Sin ícono: el matraz de Figma no está exportado al
//   proyecto y sustituirlo por otro cambiaría el dibujo, como ya se decidió en
//   `DistintivoExperimental`. El significado va en el texto, nunca solo en el color (WCAG 1.4.1).
import estilos from "./AvisoExperimental.module.css";

const ETIQUETA = "Análisis experimental";
const VALORACION =
  "Valoración preventiva probabilística experimental. No sustituye el juicio profesional.";

interface PropiedadesAvisoExperimental {
  formato?: "global" | "banner";
}

export default function AvisoExperimental({ formato = "global" }: PropiedadesAvisoExperimental) {
  if (formato === "banner") {
    return (
      <div className={estilos.banner}>
        <p className={estilos.bannerEtiqueta}>{ETIQUETA}</p>
        <p className={estilos.bannerTexto}>
          {VALORACION} Este resultado no constituye un diagnóstico clínico.
        </p>
      </div>
    );
  }

  return (
    <p className={estilos.aviso}>
      <strong className={estilos.etiqueta}>{ETIQUETA}</strong>{" "}
      <span className={estilos.valoracion}>{VALORACION}</span> Gastro-AI es una herramienta
      académica y experimental. No es un dispositivo médico, no emite diagnósticos y requiere la
      interpretación de un profesional de la salud.
    </p>
  );
}
