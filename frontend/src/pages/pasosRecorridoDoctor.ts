// Los nueve pasos del recorrido de TOPOLOGO del doctor, como datos.
//
// Frames: W-13 (54:2624), W-14e (122:4255), W-14f (122:4799), W-14 (54:3090), W-14b (105:2737),
// W-14c (105:2996), W-14d (105:3323), W-14g (122:5347) y W-14h (122:5891). Los nueve ocurren
// sobre el dashboard clínico (W-12, 54:2087): el recorrido no navega entre rutas.
//
// Los textos son los de Figma, palabra por palabra. Los pasos 2 y 3 hablan del primer uso
// («Hoy están en cero…», «Cuando haga análisis…») y se dejan así aunque el doctor ya tenga
// análisis: variantes según los datos serían cadenas que el diseño no dibuja.
//
// `ancla` es un selector CSS. `null` significa que el paso **no ilumina nada** (tarjeta centrada
// sobre el velo entero): así están dibujados el 1, que es la bienvenida, y el 5, que explica lo
// que la persona verá más adelante. Un paso cuyo elemento no exista en ese momento cae al mismo
// comportamiento (ver `useAnclaRecorrido`).
//
// Los pasos de la barra lateral anclan **por ruta** y no por clase ni por posición, para no
// tocar `BarraLateral` ni `ItemNavegacion`.
//
// En celular esas mismas anclas sirven sin duplicarse: el panel del menú usa el mismo
// `nav[aria-label="Principal"]` y `useAnclaRecorrido` elige la copia que esté a la vista. El
// recorrido abre el menú en los pasos de tipo `item-menu` y `cuenta` y lo suelta al salir de
// ellos (tabla 132:8706 y nota de reglas 132:8705 de Figma; frames M-14e 127:4852, M-14g
// 127:5127 y M-14h 127:5448). La única ancla que sí cambia en celular es la del paso 9.

import type { PasoRecorrido } from "./RecorridoGuiado";

export const PASOS_RECORRIDO_DOCTOR: PasoRecorrido[] = [
  {
    clave: "bienvenida",
    tipo: "sin-zona",
    titulo: "¡Hola! Soy TOPOLOGO",
    texto:
      "Le muestro cada sección de Gastro-AI en 9 pasos cortos. Puede omitir el recorrido cuando quiera y verlo de nuevo desde «Mi perfil».",
    ancla: null,
  },
  {
    clave: "dashboard",
    tipo: "zona",
    titulo: "Este es su dashboard",
    texto:
      "Aquí verá sus análisis del mes y acumulados, su concordancia con el modelo, los casos con seguimiento y los casos recibidos. Hoy están en cero porque aún no tiene análisis.",
    ancla: '[data-recorrido="indicadores"]',
  },
  {
    clave: "casos-recientes",
    tipo: "zona",
    titulo: "Sus casos recientes",
    texto:
      "Cuando haga análisis, aquí verá los últimos casos y la frecuencia de las características que señaló el modelo. Para empezar, use «Realizar el primer análisis».",
    // Ancla a la sección, no a lo que hay dentro: sirve igual con el dashboard vacío que con
    // una lista de casos, y los avisos de traslado (W-15b/c/d) solo la desplazan.
    ancla: '[data-recorrido="casos-recientes"]',
  },
  {
    clave: "nuevo-analisis",
    tipo: "item-menu",
    titulo: "Aquí empieza cada análisis",
    texto:
      "Cargue una imagen endoscópica, escriba el tipo y número de documento del paciente y solicite el análisis. El número de documento no se guarda.",
    ancla: 'nav[aria-label="Principal"] a[href="/nuevo-analisis"]',
  },
  {
    clave: "experimental",
    tipo: "sin-zona",
    titulo: "El resultado es experimental",
    texto:
      "Verá las características detectadas, su probabilidad y el mapa de calor. Es un apoyo: no es un diagnóstico y no reemplaza su criterio.",
    ancla: null,
  },
  {
    clave: "concordancia",
    tipo: "zona",
    titulo: "Su opinión cuenta",
    texto:
      "Después de cada resultado puede indicar si coincide con el modelo. Así se calcula esta concordancia en su dashboard.",
    ancla: '[data-recorrido="concordancia"]',
  },
  {
    clave: "historial",
    tipo: "item-menu",
    titulo: "Sus análisis anteriores",
    texto:
      "Encuéntrelos en Historial: todos sus análisis, o los de un paciente buscando por su documento.",
    ancla: 'nav[aria-label="Principal"] a[href="/historial"]',
  },
  {
    clave: "casos-recibidos",
    tipo: "item-menu",
    titulo: "Casos que le trasladan",
    texto:
      "Si un administrador le reasigna casos de otro doctor, llegan aquí, agrupados por el doctor de origen. El número junto al menú indica los traslados nuevos.",
    ancla: 'nav[aria-label="Principal"] a[href="/casos-recibidos"]',
  },
  {
    clave: "cuenta",
    tipo: "cuenta",
    titulo: "Su cuenta",
    texto:
      "En «Mi perfil» actualiza sus datos y puede repetir este recorrido. Al terminar, use «Cerrar sesión»; la sesión también se cierra sola tras un tiempo sin actividad.",
    // El anillo del frame abarca los dos botones de la barra superior, no solo uno.
    ancla: '[data-recorrido="cuenta"]',
    // En celular esa caja no existe a la vista: vive dentro de `.escritorio`, que
    // `BarraSuperior.module.css` oculta por debajo de 768 px. M-14h (127:5448) resalta en su
    // lugar «Mi perfil» y «Cerrar sesión» del panel del menú, con un anillo que abarca los dos
    // (`127:5493`: x 8, y 300, 284 × 104, justo los dos ítems con 4 px de margen).
    anclaCelular: '[data-recorrido="cuenta-movil"]',
  },
];
