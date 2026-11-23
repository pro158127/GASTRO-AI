// Imagen que llega de la API con una URL firmada (W-08; después W-17b y el reporte).
//
// Es la primera vez que el proyecto muestra una imagen remota: hasta ahora los únicos
// `<img>` eran recursos empaquetados (el logo, TOPOLOGO) y el QR de W-03, que pasa por
// `src/utils/qr.ts`. Esta variante tiene dos problemas propios:
//
// 1. **La URL vence a los 5 minutos** (`S3_URL_FIRMADA_SEGUNDOS = 300`). Lo que ya se pintó
//    se queda en pantalla porque el navegador tiene los bytes, pero cualquier petición
//    nueva de esa imagen —una recarga, otra pestaña, una caché descartada— recibe un 403
//    del almacén. No se sondea ni se renueva sola: se atiende el `onError` y se le ofrece a
//    la persona «Volver a cargar», que vuelve a pedir el análisis entero y trae URL nuevas.
// 2. **La URL viene de la red.** Antes de llegar a un `src` se comprueba que sea `http:` o
//    `https:`, igual que `urlDeQrPng` valida el PNG del QR: así una respuesta manipulada no
//    puede meter un `javascript:` en el documento. Tampoco se escribe en consola: es una
//    credencial de lectura con fecha de caducidad.
//
// El marco reserva su sitio con la proporción de la imagen (`ancho`/`alto` del análisis),
// de modo que la página no salta cuando la imagen termina de cargar.
import { useEffect, useState } from "react";
import Boton from "./Boton";
import IconoImagen from "./iconos/IconoImagen";
import IconoReintentar from "./iconos/IconoReintentar";
import estilos from "./ImagenFirmada.module.css";

interface PropiedadesImagenFirmada {
  /** URL firmada que manda la API. */
  url: string;
  /** Texto alternativo: describe qué es la imagen, sin interpretarla. */
  alt: string;
  /** Pie visible del marco. */
  pie: string;
  /**
   * Texto extra bajo el pie, dentro de la misma figura. Lo usa W-08 para el aviso de
   * Grad-CAM, que tiene que quedar junto al mapa y no en el pie de la página.
   */
  nota?: string;
  /** Tamaño real en píxeles, para reservar la proporción. */
  ancho: number;
  alto: number;
  /** Vuelve a pedir el análisis para conseguir URL nuevas. */
  onRecargar: () => void;
  /** Hay una recarga en curso: el botón queda en estado «cargando». */
  recargando: boolean;
}

/** Solo `http:` y `https:` llegan a un `src`. Una URL que no se entiende tampoco pasa. */
function esUrlSegura(url: string): boolean {
  try {
    const esquema = new URL(url, window.location.origin).protocol;
    return esquema === "http:" || esquema === "https:";
  } catch {
    return false;
  }
}

export default function ImagenFirmada({
  url,
  alt,
  pie,
  nota,
  ancho,
  alto,
  onRecargar,
  recargando,
}: PropiedadesImagenFirmada) {
  const [fallo, setFallo] = useState(false);

  // Una URL nueva (tras «Volver a cargar») merece otro intento.
  useEffect(() => setFallo(false), [url]);

  /**
   * El efecto de arriba no basta: dentro de los 5 minutos de vida de la firma, volver a
   * pedir el análisis puede devolver **la misma URL**, y entonces `url` no cambia y el
   * estado de fallo se quedaría puesto para siempre. Por eso el botón limpia el fallo él
   * mismo: si la imagen sigue sin cargar, `onError` lo vuelve a poner.
   */
  function volverACargar() {
    setFallo(false);
    onRecargar();
  }

  const servible = esUrlSegura(url);
  // `aspect-ratio` con la proporción real; si el servidor mandara un tamaño imposible se
  // cae a un cuadrado, que es como lo dibuja Figma.
  const proporcion = ancho > 0 && alto > 0 ? `${ancho} / ${alto}` : "1 / 1";

  return (
    <figure className={estilos.figura}>
      <div className={estilos.marco} style={{ aspectRatio: proporcion }}>
        {servible && !fallo ? (
          <img
            src={url}
            alt={alt}
            width={ancho || undefined}
            height={alto || undefined}
            className={estilos.imagen}
            onError={() => setFallo(true)}
          />
        ) : (
          <div className={estilos.vencida}>
            <IconoImagen className={estilos.iconoVencida} />
            <p className={estilos.textoVencida}>
              No se pudo mostrar la imagen. El enlace para verla vence a los pocos minutos.
            </p>
            <Boton
              jerarquia="secundario"
              icono={<IconoReintentar />}
              cargando={recargando}
              etiquetaCargando="Cargando…"
              onClick={volverACargar}
            >
              Volver a cargar
            </Boton>
          </div>
        )}
      </div>
      <figcaption className={estilos.pie}>
        {pie}
        {nota && <span className={estilos.nota}>{nota}</span>}
      </figcaption>
    </figure>
  );
}
