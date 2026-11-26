// Entrega de un archivo ya descargado al navegador, con un enlace temporal.
//
// Nació en `DescargaReporte.tsx` (el PDF de W-17) y se recogió aquí cuando `ExportarAuditoria`
// (el CSV de W-19c/d) necesitó lo mismo. Lo que comparten no es un `createObjectURL` de tres
// líneas, sino **el ciclo de vida de la URL de objeto**, que es la parte en la que es fácil
// equivocarse; duplicar eso en dos pantallas era la peor de las opciones.
//
// Es un hook y no una función suelta porque guarda las URL vivas en un `useRef` y las revoca al
// desmontar: sin eso, salir de la pantalla mientras el temporizador corre deja el blob en
// memoria hasta recargar la página.
import { useCallback, useEffect, useRef } from "react";

/**
 * Lo que tarda en revocarse la URL de objeto después del clic.
 *
 * **No se revoca en el mismo hilo del clic, y no es un olvido.** En varios navegadores la
 * descarga todavía no ha empezado a leer el blob cuando se revoca, y entonces la cancelan sin
 * avisar; con el diálogo «¿dónde guardar?» abierto, la lectura ocurre aún más tarde. El
 * síntoma es el peor: funciona en el navegador de quien lo escribió y falla en la demostración.
 * Así que se revoca fuera del hilo y con margen. Mientras tanto solo ocupa memoria de la
 * pestaña, y al desmontar el componente se revoca igual.
 *
 * Si alguien viene a «limpiar» esto: no lo pongas a 0 ni lo muevas junto al clic.
 */
const ESPERA_REVOCAR_MS = 60_000;

/**
 * Devuelve la función que entrega un blob al navegador como descarga.
 *
 * @returns `entregar(blob, nombre)`, estable durante toda la vida del componente.
 */
export function useEntregaDeArchivo(): (blob: Blob, nombre: string) => void {
  /** URLs de objeto vivas: se revocan al desmontar si el temporizador no llegó a hacerlo. */
  const urlsVivas = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = urlsVivas.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  // Sin dependencias: el `ref` es estable, así que la función devuelta tampoco cambia nunca.
  return useCallback((blob: Blob, nombre: string) => {
    const url = URL.createObjectURL(blob);
    urlsVivas.current.add(url);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    enlace.rel = "noopener";
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      urlsVivas.current.delete(url);
    }, ESPERA_REVOCAR_MS);
  }, []);
}
