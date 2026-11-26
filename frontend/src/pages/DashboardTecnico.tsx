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
//
// Para el fallo de carga no hay frame propio: se usan los estados globales W-30 (sin conexión)
// y W-31 (error inesperado) en una alerta con «Reintentar», como en W-15.
//
// **Fuera de alcance, a propósito** (cada uno es otra tarea y otro endpoint):
//
// - El botón «Exportar auditoría» de la cabecera (W-19c, W-19d): `/admin/auditoria/exportar`
//   y una descarga de CSV que el frontend todavía no tiene. No se dibuja ni deshabilitado.
// - El bloque «Evaluación del modelo desplegado sobre el conjunto de prueba» y su estado vacío
//   W-19q: salen de `/admin/modelo/metricas`, que es W-23.
// - El recorrido guiado del administrador (W-19e a W-19p).
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
  LatenciaDashboardTecnico,
  ModeloVigenteResumen,
  SeguridadDashboardTecnico,
  ServicioResumen,
  UsuariosDashboardTecnico,
} from "../types";
import { fechaHoraCorta } from "../utils/fechas";
import type { TipoInsignia } from "../utils/presentacionUsuario";
import { useDashboardTecnico } from "./useDashboardTecnico";
import estilos from "./DashboardTecnico.module.css";

/** W-19b dibuja cuatro tarjetas, luego dos, y luego cuatro filas. */
const TARJETAS_ESQUELETO_FILA_1 = 4;
const TARJETAS_ESQUELETO_FILA_2 = 2;
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
      <ul className={estilos.indicadores}>
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
    <section className={estilos.tarjeta} aria-labelledby={idTitulo}>
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
 * W-19b (101:800): cuatro esqueletos de tarjeta, dos más y cuatro filas, con «Cargando…».
 *
 * El contenedor lleva `aria-busy="true"`, que es lo que documenta el propio `Esqueleto`. Por eso
 * el «Cargando…» va como `<p>` **sin `role`**: `aria-busy` silencia cualquier región live que
 * quede dentro, así que un `role="status"` aquí no se anunciaría. Es lo mismo que hace W-15.
 */
function EsqueletoDashboardTecnico() {
  return (
    <div className={estilos.cargando} aria-busy="true">
      <div className={estilos.esqueletoTarjetas} aria-hidden="true">
        {Array.from({ length: TARJETAS_ESQUELETO_FILA_1 }, (_, indice) => (
          <Esqueleto key={indice} forma="tarjeta-indicador" />
        ))}
      </div>
      <div className={estilos.esqueletoTarjetasAnchas} aria-hidden="true">
        {Array.from({ length: TARJETAS_ESQUELETO_FILA_2 }, (_, indice) => (
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

  return (
    <>
      {/* Sin banner de aviso experimental, al contrario que W-15: el frame no lo dibuja arriba,
          y el aviso del pie lo pone la disposición. */}
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Estado de la plataforma y desempeño documentado del modelo. Sin datos clínicos."
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

          <div className={estilos.estadoYModelo}>
            <EstadoOperativo servicios={datos.servicios} verificadoEn={datos.verificado_en} />
            <ModeloDesplegado modelo={datos.modelo_vigente} />
          </div>

          <Latencia latencia={datos.latencia_7d} />
        </>
      )}
    </>
  );
}
