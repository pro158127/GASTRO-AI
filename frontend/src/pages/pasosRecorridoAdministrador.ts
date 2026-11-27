// Los doce pasos del recorrido de TOPOLOGO del administrador, como datos.
//
// Frames: W-19e (105:4412), W-19i (122:8403), W-19j (122:8855), W-19f (105:4725), W-19k
// (122:9308), W-19g (105:5175), W-19h (105:5625), W-19l (122:9762), W-19m (122:10214), W-19n
// (122:10666), W-19o (122:11118) y W-19p (122:11570). Los doce miden 1440×1400, igual que W-19:
// **todos ocurren sobre el dashboard técnico** y el recorrido no navega entre rutas, como el del
// doctor.
//
// Los textos son los de Figma, palabra por palabra, con **una** corrección y **una** errata que
// se deja viva a propósito; las dos están explicadas en su paso (7 y 11).
//
// `ancla` es un selector CSS. `null` significa que el paso **no ilumina nada** (tarjeta centrada
// sobre el velo entero): así está dibujado el paso 1, que es la bienvenida, y es el único de los
// doce que no ancla en escritorio. Un paso cuyo elemento no exista en ese momento cae al mismo
// comportamiento (ver `useAnclaRecorrido`).
//
// Los ocho pasos de la barra lateral anclan **por ruta** y no por clase ni por posición, para no
// tocar `BarraLateral` ni `ItemNavegacion`. Las siete rutas existen en
// `menusPorRol.administrador` (`navegacion/menus.ts`) y todas tienen pantalla construida en
// `navegacion/pantallas.tsx`, incluida `/parametros` (W-26).
//
// **En celular los doce pasos están especificados** (tabla 132:8706 y nota de reglas 132:8705;
// frames M-19e 130:8034, M-19i 130:8560, M-19f 130:9116 y M-19p 130:9907): los ocho pasos de
// módulo y el de la cuenta resaltan el ítem **dentro del panel del menú**, que el recorrido abre
// en esos pasos y suelta al salir de ellos. El mismo selector sirve en los tres tamaños porque el
// panel usa el mismo `nav[aria-label="Principal"]` que la barra lateral y `useAnclaRecorrido`
// elige la copia que esté a la vista; solo los pasos 3 y 12 cambian de ancla en celular.
import type { PasoRecorrido } from "./RecorridoGuiado";

export const PASOS_RECORRIDO_ADMINISTRADOR: PasoRecorrido[] = [
  {
    clave: "bienvenida",
    tipo: "sin-zona",
    titulo: "¡Hola! Soy TOPOLOGO",
    texto:
      "Le muestro cada herramienta de administración en 12 pasos cortos. Puede omitir el recorrido y verlo de nuevo desde «Mi perfil».",
    ancla: null,
  },
  {
    clave: "cuentas",
    tipo: "zona",
    titulo: "Su dashboard técnico",
    texto:
      "Muestra el estado de la plataforma, sin datos clínicos. Arriba verá el resumen de las cuentas de usuario; con «Exportar auditoría» descarga el registro de acciones.",
    // El anillo del frame abarca las cuatro tarjetas de «Cuentas de usuario», no la pantalla
    // entera. «Exportar auditoría» queda **fuera** del anillo, en la cabecera, también en Figma.
    //
    // **Desviación declarada en celular:** M-19i (anillo 130:8662) mete el rótulo «Cuentas de
    // usuario» **dentro** del anillo, porque ahí el anillo rodea la sección entera; esta ancla es
    // el `<ul>` de las tarjetas, así que el rótulo queda fuera y se lee justo encima del anillo.
    // Se mantiene una sola ancla para los tres tamaños: una segunda ancla solo para meter el
    // rótulo no se paga, y es una cadena más que mantener sincronizada.
    ancla: '[data-recorrido="cuentas"]',
  },
  {
    clave: "servicios-y-modelo",
    tipo: "zona",
    titulo: "Servicios y modelo",
    texto:
      "Debajo verá si cada servicio funciona, qué modelo está desplegado, el tiempo de respuesta de la inferencia y la evaluación documentada del modelo.",
    // **Desviación consciente del frame.** El anillo de W-19j (122:8946) baja hasta el final del
    // contenido y abarca también el bloque de evaluación del modelo. Aquí cubre el estado
    // operativo, el modelo desplegado y la latencia, pero **no** la evaluación: ese bloque vive
    // fuera de la rama de datos de `DashboardTecnico` a propósito, porque es otra petición
    // (`/admin/modelo/metricas`) con su propia carga, y meterlo dentro para que el anillo cuadre
    // con la maqueta sería dejar que el recorrido mande sobre la arquitectura de la pantalla.
    // Hoy ese endpoint devuelve `disponible: false`, así que el anillo literal rodearía un aviso
    // de «todavía no hay reporte», que es peor que no rodearlo.
    //
    // Lo que hace defendible la desviación es el propio texto: empieza con «Debajo verá…» y la
    // evaluación queda justo debajo del anillo, a la vista y en el mismo orden que la frase.
    ancla: '[data-recorrido="servicios-y-modelo"]',
    // En celular la zona entera no cabe, y la tabla lo resuelve con una excepción explícita
    // (`132:8788`: «Desplaza a "Estado operativo" y resalta esa tarjeta (la zona completa no cabe
    // en la pantalla)»). Se resalta solo esa tarjeta.
    anclaCelular: '[data-recorrido="estado-operativo"]',
  },
  {
    clave: "usuarios",
    tipo: "item-menu",
    titulo: "Gestión de usuarios",
    texto:
      "Cree cuentas para doctores y administradores, cambie su rol y actívelas o desactívelas desde Usuarios.",
    // **Este selector y el del paso 5 tienen que ser idénticos carácter por carácter.** Los dos
    // pasos iluminan «Usuarios», y lo que evita que el anillo parpadee y la página se vuelva a
    // desplazar al pasar del 4 al 5 es que `useAnclaRecorrido` tiene `[ancla]` como dependencia
    // del efecto: React las compara por valor, así que con la misma cadena el efecto no se
    // reejecuta y no hay `scrollIntoView` nuevo ni remedición. Si alguien «limpia» uno de los dos
    // —un espacio, comillas simples por dobles— aparece el salto, y nada falla a la vista.
    ancla: 'nav[aria-label="Principal"] a[href="/usuarios"]',
  },
  {
    clave: "traslado-de-casos",
    tipo: "item-menu",
    titulo: "Casos de un doctor que sale",
    texto:
      "Antes de desactivar o eliminar a un doctor, Gastro-AI le pedirá pasar sus casos activos a otro doctor activo. El traslado queda registrado en la Bitácora.",
    // Mismo elemento que el paso 4, y **misma cadena exacta**: ver el aviso del paso anterior.
    ancla: 'nav[aria-label="Principal"] a[href="/usuarios"]',
  },
  {
    clave: "cuentas-pendientes",
    tipo: "item-menu",
    titulo: "Cuentas pendientes",
    texto:
      "Las cuentas nuevas reciben una contraseña temporal que vence en 72 horas. Aquí verá las que aún no se han activado.",
    ancla: 'nav[aria-label="Principal"] a[href="/cuentas-pendientes"]',
  },
  {
    clave: "bitacora",
    tipo: "item-menu",
    titulo: "Bitácora",
    // **Una palabra corregida frente al frame:** Figma escribe «Registra solos los inicios de
    // sesión». Es una errata gramatical, no una decisión de redacción, y «solos» se leería como
    // un fallo del frontend. Queda anotado para corregirlo también en el frame.
    texto:
      "Registra solo los inicios de sesión y las acciones críticas, con fecha, usuario e IP. Es de solo lectura: nadie puede modificarla.",
    ancla: 'nav[aria-label="Principal"] a[href="/bitacora"]',
  },
  {
    clave: "estado-operativo",
    tipo: "item-menu",
    titulo: "Estado operativo",
    texto:
      "Muestra si cada servicio de la plataforma está disponible y qué modelo está desplegado, para confirmar que coincide con la configuración.",
    ancla: 'nav[aria-label="Principal"] a[href="/estado-operativo"]',
  },
  {
    clave: "metricas-del-modelo",
    tipo: "item-menu",
    titulo: "Métricas del modelo",
    texto:
      "Es el reporte técnico de evaluación del modelo desplegado, publicado con su ficha del modelo. No usa datos clínicos de los casos.",
    ancla: 'nav[aria-label="Principal"] a[href="/metricas-del-modelo"]',
  },
  {
    clave: "logs-tecnicos",
    tipo: "item-menu",
    titulo: "Registros técnicos",
    texto:
      "Registra cada inferencia con sus tiempos y su estado. No contiene cédulas ni resultados clínicos, así que sirve para revisar fallas sin exponer pacientes.",
    ancla: 'nav[aria-label="Principal"] a[href="/logs-tecnicos"]',
  },
  {
    clave: "parametros",
    tipo: "item-menu",
    titulo: "Parámetros de inferencia",
    // «ni requiere al equipo de desarrollo» está incompleta en el frame y **se deja tal cual**,
    // al contrario que la del paso 7: esta misma frase ya está viva en la aplicación, en la
    // descripción de la pantalla a la que el paso apunta (`ParametrosInferencia.tsx:151`,
    // copiada del mismo frame). Corregirla solo aquí haría que el recorrido y su destino dijeran
    // cosas distintas. Las dos se corrigen juntas, en el frame y en las dos pantallas, o ninguna.
    texto:
      "Ajuste aquí el umbral de confianza a partir del cual se señala una característica. No modifica los pesos del modelo ni requiere al equipo de desarrollo.",
    ancla: 'nav[aria-label="Principal"] a[href="/parametros"]',
  },
  {
    clave: "cuenta",
    tipo: "cuenta",
    titulo: "Su cuenta",
    // Texto idéntico al paso 9 del doctor, y las mismas dos anclas: en escritorio el anillo del
    // frame abarca los dos botones de la barra superior, y en celular (M-19p, 130:9907) los dos
    // ítems «Mi perfil» y «Cerrar sesión» del panel del menú.
    texto:
      "En «Mi perfil» actualiza sus datos y puede repetir este recorrido. Al terminar, use «Cerrar sesión»; la sesión también se cierra sola tras un tiempo sin actividad.",
    ancla: '[data-recorrido="cuenta"]',
    anclaCelular: '[data-recorrido="cuenta-movil"]',
  },
];
