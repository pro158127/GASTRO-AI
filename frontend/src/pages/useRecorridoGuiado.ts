// Las dos puertas de entrada del recorrido guiado de TOPOLOGO, compartidas por los dos roles:
// el dashboard clínico del doctor (`Dashboard.tsx`, W-13 y W-14x) y el dashboard técnico del
// administrador (`DashboardTecnico.tsx`, W-19e a W-19p).
//
// Es un **traslado literal** de lo que estaba en `Dashboard.tsx`, con un solo cambio: la
// condición del arranque automático llega como `listo` en vez de leer `cargando`, `aviso` y
// `datos`, que son de cada pantalla. Nada más se tocó.
//
// `recorridoVisto.ts` no se parametriza por rol: el endpoint del backend escribe la misma
// columna sin importar el rol de la cuenta.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { yaVioElRecorrido } from "./recorridoVisto";

interface Recorrido {
  recorridoActivo: boolean;
  /** Para el `alCerrar` del recorrido: al terminar, al omitir y con Esc. */
  cerrarRecorrido: () => void;
}

/**
 * @param listo La **misma condición que pinta el contenido** de la pantalla. Ver el comentario
 *   del efecto de arranque: no es «la respuesta llegó».
 */
export function useRecorridoGuiado(listo: boolean): Recorrido {
  const ubicacion = useLocation();
  const navegar = useNavigate();

  // Recorrido guiado de TOPOLOGO (W-13, W-14x / W-19e a W-19p). Se lanza desde «Ver recorrido»
  // en Mi perfil, que navega aquí con el estado de navegación `{ recorrido: true }`, y no con un
  // parámetro en la URL: ese sobreviviría a la recarga, volvería a abrir el recorrido en cada F5
  // y se lo abriría también a quien recibiera el enlace copiado.
  //
  // El arranque automático del primer ingreso no cabe aquí, en el estado inicial: saber si ya
  // lo vio es una consulta (`recorridoVisto.ts`) y, sobre todo, el recorrido no puede abrirse
  // sobre el esqueleto. Va en el efecto de más abajo.
  const [recorridoActivo, setRecorridoActivo] = useState(
    () => (ubicacion.state as { recorrido?: boolean } | null)?.recorrido === true
  );
  const seAbrioElRecorrido = useRef(recorridoActivo);

  // El estado de navegación se consume una sola vez: así una recarga no lo vuelve a abrir.
  useEffect(() => {
    if ((ubicacion.state as { recorrido?: boolean } | null)?.recorrido) {
      navegar(ubicacion.pathname, { replace: true, state: null });
    }
    // Sin dependencias a propósito: solo al llegar a la pantalla.
  }, []);

  // Arranque automático en el primer ingreso (W-13). Se engancha a la **misma condición que
  // pinta el contenido** (`listo`, que en las dos pantallas es `!cargando && !aviso && datos`),
  // no a que la respuesta haya llegado: si el recorrido se abriera sobre el esqueleto, los
  // elementos `data-recorrido` todavía no existirían, `useAnclaRecorrido` devolvería `null` y
  // todos los pasos con ancla se degradarían a tarjeta centrada, sin que nada falle. Al ser un
  // efecto corre después del commit, así que las anclas ya están en el DOM.
  const seIntentoElArranque = useRef(false);
  useEffect(() => {
    if (seIntentoElArranque.current) return;
    // Si lo pidió Mi perfil, ya está abierto: ese camino no consulta nada.
    if (seAbrioElRecorrido.current) {
      seIntentoElArranque.current = true;
      return;
    }
    if (!listo) return;
    seIntentoElArranque.current = true;

    let vigente = true;
    void (async () => {
      // `null` = no se pudo saber: entonces no se abre (ver `recorridoVisto.ts`).
      if ((await yaVioElRecorrido()) !== false) return;
      if (vigente) setRecorridoActivo(true);
    })();
    return () => {
      vigente = false;
    };
  }, [listo]);

  // Al cerrar el recorrido el foco tiene que volver a la pantalla: quien lo abrió está en Mi
  // perfil y ya no existe, así que `useAtraparFoco` lo dejaría en el <body>. Este efecto corre
  // después de que el recorrido se desmonte, de modo que gana al foco que devuelve el hook.
  useEffect(() => {
    if (recorridoActivo) {
      seAbrioElRecorrido.current = true;
      return;
    }
    if (!seAbrioElRecorrido.current) return;
    seAbrioElRecorrido.current = false;
    // Sin envolver la pantalla en un contenedor propio, que cambiaría su disposición.
    const encabezado = document.querySelector<HTMLElement>("main h1");
    if (encabezado) {
      encabezado.tabIndex = -1;
      encabezado.focus();
    }
  }, [recorridoActivo]);

  return { recorridoActivo, cerrarRecorrido: () => setRecorridoActivo(false) };
}
