// Pantalla W-19 · Dashboard técnico del administrador (Figma 68:4170, RF-DB02).
//
// Es la pantalla inicial del administrador y resume el estado de la plataforma. **Solo
// conteos**: ningún campo de este endpoint identifica un caso, un paciente ni un análisis
// (CA 8), y la pantalla no pide nada clínico.
//
// Estados dibujados que se implementan aquí:
//
// - W-19  (68:4170): con datos.
// - W-19b (101:636, bloque «Cargando (aria-busy)» 101:800): esqueletos y «Cargando…» visible.
// - W-19c (101:852) y W-19d (101:1097): el botón «Exportar auditoría» de la cabecera y sus dos
//   estados, que viven en `ExportarAuditoria.tsx` junto con el diálogo del período.
//
// Para el fallo de carga no hay frame propio: se usan los estados globales W-30 (sin conexión)
// y W-31 (error inesperado) en una alerta con «Reintentar», como en W-15.
//
// - El bloque «Evaluación del modelo desplegado sobre el conjunto de prueba» y su estado vacío
//   W-19q viven en `EvaluacionModelo.tsx`, porque son **otra petición**
//   (`/admin/modelo/metricas`) con su propia carga y su propio error.
//
// - El recorrido guiado de TOPOLOGO del administrador (W-19e a W-19p) ocurre **sobre esta
//   pantalla**, sus doce pasos. Aquí solo está el montaje y dos `data-recorrido`; los pasos son
//   datos (`pasosRecorridoAdministrador.ts`) y la capa es `RecorridoGuiado.tsx`.
//
// **Tres duplicaciones conscientes con W-22 (`EstadoOperativo.tsx`), que no se puede tocar**
// porque es de otra persona y tiene correcciones en curso. Unificarlas es un refactor
// transversal y va en su propio commit:
//
//  1. Las etiquetas «Disponible / Con demora / Sin respuesta» están allí en un `const estados`
//     local y sin exportar (`EstadoOperativo.tsx:20-24`); aquí se vuelven a declarar.
//  2. El paso de milisegundos a «3,2 s»: allí es `tiempoLegible` (`EstadoOperativo.tsx:31-33`),
//     también local; `utils/numeros.ts` solo tiene porcentajes.
//  3. W-22 **no usa el componente `Insignia` compartido**, sino clases propias de su CSS, así
//     que los mismos tres estados no se ven idénticos en W-19 y en W-22.
import { useId } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import EncabezadoPagina from "../components/EncabezadoPagina";
import EnlaceBoton from "../components/EnlaceBoton";
import Esqueleto from "../components/Esqueleto";
import EstadoVacio from "../components/EstadoVacio";
import Insignia from "../components/Insignia";
import TarjetaIndicador from "../components/TarjetaIndicador";
import type { EstadoServicio } from "../services/estadoOperativo";
import type {
  AnalisisDashboardTecnico,
  LatenciaDashboardTecnico,
  ModeloVigenteResumen,
  SeguridadDashboardTecnico,
  ServicioResumen,
  UsuariosDashboardTecnico,
} from "../types";
import { fechaHoraCorta } from "../utils/fechas";
import type { TipoInsignia } from "../utils/presentacionUsuario";
import EvaluacionModelo from "./EvaluacionModelo";
import ExportarAuditoria from "./ExportarAuditoria";
import RecorridoGuiado from "./RecorridoGuiado";
import { PASOS_RECORRIDO_ADMINISTRADOR } from "./pasosRecorridoAdministrador";
import { useDashboardTecnico } from "./useDashboardTecnico";
import { useRecorridoGuiado } from "./useRecorridoGuiado";
import estilos from "./DashboardTecnico.module.css";

/**
 * W-19b dibuja cuatro tarjetas, luego dos, y luego cuatro filas.
 *
 * La fila de cuatro se repite: la pantalla tiene **dos** bloques de cuatro tarjetas («Cuentas de
 * usuario» y «Actividad de análisis»), así que el esqueleto dibuja dos, con la misma clase.
 */
const TARJETAS_ESQUELETO_CUATRO = 4;
const FILAS_TARJETAS_ESQUELETO_CUATRO = 2;
const TARJETAS_ESQUELETO_ANCHAS = 2;
const FILAS_ESQUELETO = 4;

/**
 * Desde cuántos accesos fallidos en 24 h se considera que hay algo que revisar.
 *
 * No es un número elegido a ojo: es `bloqueo_intentos` del backend
 * (`backend/app/core/config.py:120`), los intentos fallidos tras los que el sistema bloquea una
 * cuenta (RF-U12). Con 5 o más, **al menos una cuenta pudo haberse bloqueado**, y eso es lo que
 * hace que la cifra merezca una banda. No lo cambie creyendo que era un 5 al azar.
 *
 * Dos cosas que conviene tener presentes:
 *
 * - El valor del servidor es configurable y el contrato no lo entrega, así que este 5 es una
 *   copia del frontend que podría desincronizarse si allá se cambia.
 * - **Hueco conocido:** por debajo de 5, `accesos_fallidos_24h` no se ve en ninguna parte del
 *   núcleo de W-19. Se acepta porque el sitio propio de ese dato es la bitácora, que es
 *   justamente adonde manda la alerta; no se arregla inventando un bloque que Figma no dibuja.
 */
const UMBRAL_ACCESOS_FALLIDOS = 5;

interface PresentacionServicio {
  texto: string;
  tipo: TipoInsignia;
}

/**
 * Las tres etiquetas del frame, idénticas a las de W-22. El significado lo da el texto; el
 * color solo lo refuerza (WCAG 1.4.1).
 */
const SERVICIOS: Record<EstadoServicio, PresentacionServicio> = {
  OPERATIVO: { texto: "Disponible", tipo: "exito" },
  LENTO: { texto: "Con demora", tipo: "advertencia" },
  SIN_RESPUESTA: { texto: "Sin respuesta", tipo: "error" },
};

/**
 * El esquema del backend declara `estado` como `str`, no como el enum
 * (`backend/app/schemas/dashboard_tecnico.py:38`), al contrario que el de W-22. Hoy los valores
 * salen del enum y coinciden, pero un valor nuevo no puede dejar la fila en blanco: se muestra
 * tal cual, con insignia neutral, que es lo honesto cuando no se sabe qué significa.
 */
function presentacionDeServicio(estado: EstadoServicio): PresentacionServicio {
  return SERVICIOS[estado] ?? { texto: estado, tipo: "neutral" };
}

const SEGUNDOS = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

/** 3200 → «3,2 s», como escribe Figma. */
function segundosLegibles(ms: number): string {
  return `${SEGUNDOS.format(ms / 1000)} s`;
}

function fraseAccesos(cantidad: number): string {
  return cantidad === 1
    ? "1 intento de acceso fallido en las últimas 24 horas"
    : `${cantidad} intentos de acceso fallidos en las últimas 24 horas`;
}

function fraseBloqueos(cantidad: number): string {
  return cantidad === 1
    ? "1 cuenta con bloqueo temporal activo"
    : `${cantidad} cuentas con bloqueo temporal activo`;
}

/** Hay actividad de acceso que revisar: ver `UMBRAL_ACCESOS_FALLIDOS`. */
function hayActividadParaRevisar(seguridad: SeguridadDashboardTecnico): boolean {
  // Un bloqueo ya es una decisión del servidor de que algo pasó (RF-U12): con uno basta.
  return (
    seguridad.cuentas_bloqueadas > 0 ||
    seguridad.accesos_fallidos_24h >= UMBRAL_ACCESOS_FALLIDOS
  );
}

/**
 * Texto de la alerta de seguridad, **que redacta el frontend** con los dos enteros del contrato.
 *
 * Figma escribe aquí el correo de la cuenta bloqueada y la hora en que vence el bloqueo
 * («luis.gomez@usc.edu.co, vence a las 15:42»). El contrato **no entrega ninguno de los dos**:
 * `seguridad` son dos conteos y nada más. No se inventan, no se deducen y no se piden a otro
 * endpoint; quien necesite el detalle lo tiene en la bitácora y en Usuarios.
 *
 * «Bitácora» y «Usuarios» van como texto y no como enlaces, igual que en el frame.
 */
function textoActividadDeAcceso(seguridad: SeguridadDashboardTecnico): string {
  const { accesos_fallidos_24h: fallidos, cuentas_bloqueadas: bloqueadas } = seguridad;
  const revisar = fallidos === 1 ? "Revíselo" : "Revíselos";
  const desbloquear = bloqueadas === 1 ? "desbloquee la cuenta" : "desbloquee las cuentas";

  if (fallidos > 0 && bloqueadas > 0) {
    return `${fraseAccesos(fallidos)} y ${fraseBloqueos(bloqueadas)}. ${revisar} en Bitácora o ${desbloquear} desde Usuarios.`;
  }
  if (fallidos > 0) return `${fraseAccesos(fallidos)}. ${revisar} en Bitácora.`;
  const accion = bloqueadas === 1 ? "Desbloquéela" : "Desbloquéelas";
  return `${fraseBloqueos(bloqueadas)}. ${accion} desde Usuarios.`;
}

/**
 * Las cuatro cifras de cuentas (Figma 68:4369).
 *
 * **«Contraseña temporal expirada» es un subconjunto de «Pendientes de activación»**: el
 * servidor cuenta las PENDIENTE por un lado y, por otro, cuántas de esas tienen la temporal
 * vencida (`dashboard_tecnico_repository.py:61-87`). Las dos tarjetas, una al lado de la otra,
 * se leen como si sumaran y no suman, así que el detalle de la cuarta lo dice con palabras.
 * Es una desviación del texto de Figma («Más de 72 horas sin uso (RNF-27)»), hecha a propósito.
 */
function Cuentas({ usuarios }: { usuarios: UsuariosDashboardTecnico }) {
  const idTitulo = useId();

  return (
    <section aria-labelledby={idTitulo}>
      <h2 className={estilos.tituloSeccion} id={idTitulo}>
        Cuentas de usuario
      </h2>
      {/* El paso 2 del recorrido del administrador (W-19i) ilumina las cuatro tarjetas a la vez:
          el anillo del frame abarca la fila entera, no una tarjeta. */}
      <ul className={estilos.indicadores} data-recorrido="cuentas">
        <TarjetaIndicador
          indicador="Activas"
          valor={String(usuarios.por_estado.ACTIVO)}
          detalle="Doctores y administradores"
        />
        <TarjetaIndicador
          indicador="Inactivas"
          valor={String(usuarios.por_estado.INACTIVO)}
          detalle="Desactivadas por un administrador"
        />
        <TarjetaIndicador
          indicador="Pendientes de activación"
          valor={String(usuarios.por_estado.PENDIENTE)}
          detalle="Sin primer ingreso"
        />
        <TarjetaIndicador
          indicador="Contraseña temporal expirada"
          valor={String(usuarios.pendientes_expiradas)}
          detalle="De las pendientes, más de 72 horas sin uso (RNF-27)"
        />
      </ul>
    </section>
  );
}

/**
 * Las cuatro cifras de `analisis`.
 *
 * **Esta sección no está dibujada en Figma**: el frame de W-19 no la incluye. Los cuatro
 * rótulos y sus detalles los redacta el frontend, como `textoActividadDeAcceso`. Se construye
 * porque el dato ya viene en la misma respuesta de `/admin/dashboard` y porque se aprobó
 * explícitamente; los códigos de pantalla y el resto del frame no cambian.
 *
 * **Las cuatro cifras no se suman, y eso lo tiene que decir el texto.** El servidor las calcula
 * todas por `solicitado_en` (`dashboard_tecnico_repository.py:149-161`), de modo que:
 *
 *  - `ultimos_7_dias` **contiene a las otras tres**. No son «análisis completados»: incluye los
 *    que siguen PROCESANDO y los FALLIDO.
 *  - `hoy` es un subconjunto suyo. La ventana de 7 días es rodante desde `ahora`, así que
 *    `inicio_hoy >= hace_7_dias` siempre y la contención se cumple sin excepción.
 *  - Las dos cifras de fallo son subconjuntos suyos y **disjuntas entre sí**: juntas son todos
 *    los FALLIDO de los 7 días, partidos por `calidad_suficiente`.
 *
 * Por eso cada `detalle` declara su base de cálculo. Es la misma solución que en `Cuentas`, con
 * tres subconjuntos en vez de uno. No hay tarjeta de «total», ni porcentajes, ni restas.
 *
 * **«Hoy» es el día de Colombia, no el del navegador**: lo fija `inicio_del_dia()`
 * (`backend/app/services/dashboard_tecnico.py:42-44`). Un administrador que mire desde otra zona
 * horaria vería un «hoy» que no es el que se está contando, así que el detalle lo dice.
 *
 * **El detalle de «error técnico» no afirma que la imagen estuviera bien.** El filtro del
 * servidor es `calidad_suficiente IS NOT false`, y un nulo ahí no significa «la imagen servía»
 * sino **que la calidad nunca se evaluó**: un fallo de encolado deja el análisis FALLIDO con
 * `COLA_NO_DISPONIBLE` antes de que nada mire la imagen (`app/services/analisis.py`). Decir «la
 * imagen sí servía» sería convertir ese nulo en una afirmación positiva que el dato no sostiene,
 * el mismo error que convertirlo en una advertencia. El texto habla de a qué se atribuye el
 * fallo, no de la imagen.
 *
 * **Cero color de alarma.** Los dos conteos de fallo son operación normal: `TarjetaIndicador` no
 * tiene variante de estado y aquí no se le añade ninguna insignia ni alerta alrededor.
 */
function ActividadAnalisis({ analisis }: { analisis: AnalisisDashboardTecnico }) {
  const idTitulo = useId();

  return (
    <section aria-labelledby={idTitulo}>
      <h2 className={estilos.tituloSeccion} id={idTitulo}>
        Actividad de análisis
      </h2>
      <ul className={estilos.indicadores}>
        {/* Son conteos: `0` es un valor legítimo y se pinta como `0`. El «—» de
            `TarjetaIndicador` es para cuando no hay dato, y aquí siempre lo hay. */}
        <TarjetaIndicador
          indicador="Solicitados hoy"
          valor={String(analisis.hoy)}
          detalle="Desde las 00:00 en Colombia; también están en los 7 días"
        />
        <TarjetaIndicador
          indicador="Solicitados en 7 días"
          valor={String(analisis.ultimos_7_dias)}
          detalle="Por fecha de solicitud; incluye los que siguen en proceso y los fallidos"
        />
        <TarjetaIndicador
          indicador="Fallidos por error técnico"
          valor={String(analisis.con_error_7_dias)}
          detalle="De esos 7 días; fallos no atribuidos a la calidad de la imagen"
        />
        <TarjetaIndicador
          indicador="Fallidos por calidad insuficiente"
          valor={String(analisis.calidad_insuficiente_7_dias)}
          detalle="De esos 7 días; la imagen no superó los mínimos de calidad"
        />
      </ul>
    </section>
  );
}

/**
 * Estado de cada servicio (Figma 68:4387), con una sola hora de medición para todos.
 *
 * El detalle por servicio —tiempo de respuesta y su propia hora— es de W-22, que es adonde
 * lleva «Ver detalle». Aquí no hay ninguno de los dos: este endpoint no los entrega.
 */
function EstadoOperativo({
  servicios,
  verificadoEn,
}: {
  servicios: ServicioResumen[];
  verificadoEn: string;
}) {
  const idTitulo = useId();
  // `fechaHoraCorta` devuelve cadena vacía si la fecha no sirve: entonces no se pinta la línea,
  // en vez de dejar «Última verificación: » colgando.
  const verificado = fechaHoraCorta(verificadoEn);

  return (
    // En celular el paso 3 del recorrido resalta **solo esta tarjeta** y no la zona entera, que
    // no cabe en la pantalla (tabla 132:8706, fila 132:8788).
    <section className={estilos.tarjeta} aria-labelledby={idTitulo} data-recorrido="estado-operativo">
      <div className={estilos.tituloTarjeta}>
        <h2 className={estilos.tituloBloque} id={idTitulo}>
          Estado operativo
        </h2>
        <EnlaceBoton to="/estado-operativo">Ver detalle</EnlaceBoton>
      </div>

      {servicios.length === 0 ? (
        <EstadoVacio
          nivelTitulo="h3"
          titulo="Sin servicios medidos"
          mensaje="La última medición no devolvió ningún servicio. El detalle está en Estado operativo."
        />
      ) : (
        <ul className={estilos.filas}>
          {servicios.map((servicio) => {
            const presentacion = presentacionDeServicio(servicio.estado);
            return (
              <li className={estilos.fila} key={servicio.codigo}>
                <span className={estilos.etiquetaFila}>{servicio.nombre}</span>
                <Insignia tipo={presentacion.tipo}>{presentacion.texto}</Insignia>
              </li>
            );
          })}
        </ul>
      )}

      {verificado && <p className={estilos.pieTarjeta}>Última verificación: {verificado}</p>}
    </section>
  );
}

/**
 * Modelo de inferencia desplegado (Figma 68:4412).
 *
 * `revision_corta` **ya viene recortada a 7 caracteres por el servidor**
 * (`admin_dashboard.py:63`): no se vuelve a recortar y no es el `revision_sha` entero que usa
 * W-22.
 *
 * La línea «Nombre del repositorio y revisión son de ejemplo.» del frame es una nota de diseño
 * sobre los datos de muestra, no un texto de la pantalla, así que no se implementa.
 */
function ModeloDesplegado({ modelo }: { modelo: ModeloVigenteResumen | null }) {
  const idTitulo = useId();
  const desplegado = modelo ? fechaHoraCorta(modelo.desplegado_en) : "";

  return (
    <section className={estilos.tarjeta} aria-labelledby={idTitulo}>
      <div className={estilos.tituloTarjeta}>
        <h2 className={estilos.tituloBloque} id={idTitulo}>
          Modelo de inferencia desplegado
        </h2>
      </div>

      {modelo === null ? (
        // Que no haya revisión registrada todavía no es un fallo: se dice en neutro.
        <EstadoVacio
          nivelTitulo="h3"
          titulo="Sin modelo registrado"
          mensaje="Todavía no hay una revisión registrada. Aparecerá aquí cuando el servicio de inferencia informe una."
        />
      ) : (
        <dl className={estilos.filas}>
          <div className={estilos.fila}>
            <dt className={estilos.etiquetaFila}>Repositorio (Hugging Face)</dt>
            <dd className={estilos.valorFila}>{modelo.repositorio_hf}</dd>
          </div>
          <div className={estilos.fila}>
            <dt className={estilos.etiquetaFila}>Revisión fija</dt>
            <dd className={estilos.valorFila}>{modelo.revision_corta}</dd>
          </div>
          {/* Mismo guardia que el pie del estado operativo: sin fecha válida, no hay fila. */}
          {desplegado && (
            <div className={estilos.fila}>
              <dt className={estilos.etiquetaFila}>Desplegado el</dt>
              <dd className={estilos.valorFila}>{desplegado}</dd>
            </div>
          )}
          <div className={estilos.fila}>
            <dt className={estilos.etiquetaFila}>Coincide con la configuración</dt>
            <dd className={estilos.valorFila}>
              {/* El «No» no está dibujado en Figma. Es `advertencia` y no `error`: una revisión
                  distinta de la configurada es algo que el administrador debe revisar, no una
                  caída del sistema. El texto lo dice completo (WCAG 1.4.1). */}
              {modelo.coincide_con_configuracion ? (
                <Insignia tipo="exito">Sí · RNF-29</Insignia>
              ) : (
                <Insignia tipo="advertencia">No · RNF-29</Insignia>
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

/**
 * Latencia de inferencia (Figma 68:4426).
 *
 * **La ventana son 7 días, no 24 horas.** El frame titula el bloque «últimas 24 horas», pero el
 * contrato entrega `latencia_7d`, calculado con `VENTANA_SEMANA`
 * (`backend/app/services/dashboard_tecnico.py:60`), y el router lo documenta como «los últimos 7
 * días (CA 6)». Manda el código. La única ventana de 24 h del contrato es
 * `seguridad.accesos_fallidos_24h`.
 *
 * **Un percentil nulo no es un fallo.** `percentile_cont` ignora los nulos, así que el p95 del
 * modelo de lenguaje sale solo de las inferencias que sí lo llamaron
 * (`dashboard_tecnico_repository.py:166-167`): si en 7 días nadie pidió una explicación, llega
 * nulo, y eso es el estado normal de este sistema. Lo mismo vale para `inferencias: 0`. Por eso
 * el nulo elige **solo entre dos cadenas**: nunca entra en una condición que escoja color, tipo
 * de alerta o insignia, y ninguno de los textos insinúa un problema.
 */
function Latencia({ latencia }: { latencia: LatenciaDashboardTecnico }) {
  const idTitulo = useId();
  const { vision_p95_ms: vision, llm_p95_ms: llm, inferencias, errores } = latencia;

  return (
    <section className={estilos.tarjeta} aria-labelledby={idTitulo}>
      <div className={estilos.tituloTarjeta}>
        <h2 className={estilos.tituloBloque} id={idTitulo}>
          Latencia de inferencia · últimos 7 días
        </h2>
        <EnlaceBoton to="/logs-tecnicos">Ver logs técnicos</EnlaceBoton>
      </div>
      <ul className={estilos.indicadores}>
        <TarjetaIndicador
          indicador="Modelo de visión · percentil 95"
          valor={vision === null ? "—" : segundosLegibles(vision)}
          detalle={
            vision === null
              ? "Sin mediciones en los últimos 7 días. Meta: ≤ 10 s (RNF-10)"
              : "Meta: ≤ 10 s (RNF-10)"
          }
        />
        <TarjetaIndicador
          indicador="Modelo de lenguaje · percentil 95"
          valor={llm === null ? "—" : segundosLegibles(llm)}
          detalle={
            llm === null
              ? "Ninguna inferencia pidió explicación en los últimos 7 días. Meta: ≤ 10 s (RF-R05 CA 3)"
              : "Meta: ≤ 10 s (RF-R05 CA 3)"
          }
        />
        <TarjetaIndicador
          indicador="Inferencias registradas"
          valor={String(inferencias)}
          // «Correctas» no es un campo del contrato: es la resta. `errores` son las inferencias
          // con estado ERROR o TIEMPO_AGOTADO.
          detalle={
            inferencias === 0
              ? "Sin inferencias en los últimos 7 días"
              : `Correctas: ${inferencias - errores} · con error: ${errores}`
          }
        />
      </ul>
    </section>
  );
}

/**
 * W-19b (101:800): dos filas de cuatro esqueletos de tarjeta, dos anchos y cuatro filas, con
 * «Cargando…». El frame dibuja una sola fila de cuatro porque se dibujó antes de que la pantalla
 * tuviera dos bloques de cuatro tarjetas; el esqueleto sigue a la pantalla.
 *
 * El contenedor lleva `aria-busy="true"`, que es lo que documenta el propio `Esqueleto`. Por eso
 * el «Cargando…» va como `<p>` **sin `role`**: `aria-busy` silencia cualquier región live que
 * quede dentro, así que un `role="status"` aquí no se anunciaría. Es lo mismo que hace W-15.
 */
function EsqueletoDashboardTecnico() {
  return (
    <div className={estilos.cargando} aria-busy="true">
      {Array.from({ length: FILAS_TARJETAS_ESQUELETO_CUATRO }, (_, fila) => (
        <div className={estilos.esqueletoTarjetas} key={fila} aria-hidden="true">
          {Array.from({ length: TARJETAS_ESQUELETO_CUATRO }, (_, indice) => (
            <Esqueleto key={indice} forma="tarjeta-indicador" />
          ))}
        </div>
      ))}
      <div className={estilos.esqueletoTarjetasAnchas} aria-hidden="true">
        {Array.from({ length: TARJETAS_ESQUELETO_ANCHAS }, (_, indice) => (
          <Esqueleto key={indice} forma="tarjeta-indicador" />
        ))}
      </div>
      {Array.from({ length: FILAS_ESQUELETO }, (_, indice) => (
        <Esqueleto key={indice} forma="fila-tabla" />
      ))}
      <p className={estilos.textoCargando}>Cargando…</p>
    </div>
  );
}

export default function DashboardTecnico({ titulo }: { titulo: string }) {
  const { datos, cargando, aviso, recargar } = useDashboardTecnico();

  // Recorrido guiado de TOPOLOGO del administrador (W-19e a W-19p), con las mismas dos puertas
  // de entrada que el del doctor: «Ver recorrido» en Mi perfil y el primer ingreso.
  //
  // Se engancha a la **misma condición que pinta el contenido** (`!cargando && !aviso && datos`,
  // más abajo) y **no** a la carga de `/admin/modelo/metricas`, que es otra petición: si esperara
  // a ella el recorrido no arrancaría nunca mientras ese endpoint devuelva `disponible: false`, y
  // si arrancara sobre el esqueleto las anclas de los pasos 2 y 3 todavía no existirían y los
  // pasos se degradarían a tarjeta centrada sin que nada falle.
  const { recorridoActivo, cerrarRecorrido } = useRecorridoGuiado(!cargando && !aviso && !!datos);

  return (
    <>
      {/* Sin banner de aviso experimental, al contrario que W-15: el frame no lo dibuja arriba,
          y el aviso del pie lo pone la disposición. */}
      {/* «Exportar auditoría» va en la cabecera y **no depende de la carga del dashboard**: son
          dos cosas distintas, y si `/admin/dashboard` falla, la auditoría se sigue pudiendo
          exportar. Por eso está fuera de las ramas de `cargando` y `aviso`. */}
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Estado de la plataforma y desempeño documentado del modelo. Sin datos clínicos."
        acciones={<ExportarAuditoria />}
      />

      {cargando && <EsqueletoDashboardTecnico />}

      {!cargando && aviso && (
        <div className={estilos.errorCarga}>
          <Alerta tipo="error" titulo={aviso.titulo}>
            {aviso.mensaje}
          </Alerta>
          <div>
            <Boton jerarquia="secundario" onClick={recargar}>
              Reintentar
            </Boton>
          </div>
        </div>
      )}

      {!cargando && !aviso && datos && (
        <>
          {/* Dos alertas independientes, cada una con su condición; el frame solo dibuja una
              banda porque dibuja un solo ejemplo. Si se cumplen las dos, se ven las dos; si no
              se cumple ninguna, no queda hueco, porque no hay contenedor que lo reserve. */}
          {datos.alerta && (
            <Alerta
              tipo={datos.alerta.nivel === "ERROR" ? "error" : "advertencia"}
              titulo="Estado de los servicios"
            >
              {/* El mensaje lo redacta el servidor y se pinta tal cual, sin reescribirlo. */}
              {datos.alerta.mensaje}
            </Alerta>
          )}
          {hayActividadParaRevisar(datos.seguridad) && (
            <Alerta tipo="advertencia" titulo="Actividad de acceso para revisar">
              {textoActividadDeAcceso(datos.seguridad)}
            </Alerta>
          )}

          <Cuentas usuarios={datos.usuarios} />

          <ActividadAnalisis analisis={datos.analisis} />

          {/* El paso 3 del recorrido (W-19j) ilumina los tres bloques a la vez. El envoltorio
              no tiene estilos: solo existe para que el anillo los abarque, y por eso es un `div`
              contenedor nuevo con la misma separación que les daba la disposición interna, para
              que la pantalla se vea igual. Por qué **no** incluye la evaluación del modelo, que
              el frame sí abarca: ver el paso en `pasosRecorridoAdministrador.ts`. */}
          <div className={estilos.serviciosYModelo} data-recorrido="servicios-y-modelo">
            <div className={estilos.estadoYModelo}>
              <EstadoOperativo servicios={datos.servicios} verificadoEn={datos.verificado_en} />
              <ModeloDesplegado modelo={datos.modelo_vigente} />
            </div>

            <Latencia latencia={datos.latencia_7d} />
          </div>
        </>
      )}

      {/* El bloque de evaluación del modelo va **fuera** de las tres ramas de arriba, igual que
          «Exportar auditoría»: es otra petición, y que `/admin/modelo/metricas` falle no puede
          dejar en blanco las cuentas ni el estado operativo. Mientras el esqueleto de W-19b está
          en pantalla, este bloque ya se ve abajo con su propio «Cargando…»: W-19b no lo dibuja
          porque se dibujó antes de que el bloque existiera, pero son dos peticiones distintas y
          se ven como dos. */}
      <EvaluacionModelo />

      {recorridoActivo && (
        <RecorridoGuiado pasos={PASOS_RECORRIDO_ADMINISTRADOR} alCerrar={cerrarRecorrido} />
      )}
    </>
  );
}
