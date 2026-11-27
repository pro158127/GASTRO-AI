// Pantalla W-08 · Resultado del análisis (Figma 47:870), con W-08b (ninguna característica
// supera el umbral, 95:2376). Tableta T-08 (109:893) y celular M-08 (109:1147).
// Solo rol DOCTOR. Sin TOPOLOGO: lo dice la nota de la pantalla en Figma.
//
// **Es también W-17**, el detalle abierto desde el historial o desde los casos recibidos: una
// sola ruta y un solo render (`navegacion/pantallas.tsx`). Lo que distingue una lectura de la
// otra no es la pantalla sino los datos de la respuesta. De ahí la tarjeta de procedencia
// (`ProcedenciaAnalisis`), que no pinta nada cuando el análisis es propio y no llegó por
// traslado, que es justo el caso de un análisis recién terminado.
//
// Alcance: el resultado en sí. La explicación en lenguaje natural (W-08c, W-08d) y la
// valoración profesional (W-08e a W-08h) son de la tarea 6b; sus tarjetas no se dibujan,
// aunque `explicacion` y `observaciones` ya vengan en la respuesta y estén tipadas.
//
// Tres decisiones que se apartan del dibujo, y por qué:
//
// 1. **W-08b no deja marcos vacíos.** Figma dibuja ahí un mapa de calor y una «Confianza
//    del modelo: 38 %», pero la API manda `mapa_calor: null` y `regiones: []` en ese
//    estado. Un recuadro vacío donde debería ir un hallazgo insinúa un hallazgo, así que en
//    su lugar va una frase que explica por qué no hay mapa.
// 2. **`regiones[].confianza` no se muestra.** El servidor la copia de la probabilidad de
//    su característica (`confianza=probabilidad_de[...]` en el router): no es una segunda
//    medición. Enseñarla como «Confianza del modelo» pondría el mismo número dos veces con
//    dos nombres y se leería como dos medidas que coinciden. El bloque nombra la
//    característica, que es el vínculo real, y el número queda una sola vez en su fila.
// 3. **El umbral va por fila.** Figma escribe un único «umbral de confianza vigente: 50 %»,
//    pero `umbral_aplicado` es por característica y es el del día del análisis, no el de
//    hoy (RF-A01 CA 2).
//
// `caja` se tipa y no se dibuja: Figma no pinta recuadros sobre la imagen.
import { Navigate, useParams } from "react-router";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import DistintivoExperimental from "../components/DistintivoExperimental";
import EnlaceBoton from "../components/EnlaceBoton";
import EncabezadoPagina from "../components/EncabezadoPagina";
import Esqueleto from "../components/Esqueleto";
import EstadoVacio from "../components/EstadoVacio";
import ImagenFirmada from "../components/ImagenFirmada";
import Insignia from "../components/Insignia";
import IconoMas from "../components/iconos/IconoMas";
import { CodigoFalloAnalisis } from "../services/codigosError";
import type { AnalisisDetalle, CaracteristicaResultado, MapaCalor, RegionInteres } from "../types";
import { fechaHoraCorta } from "../utils/fechas";
import { descripcionCalidad } from "./ProgresoAnalisis";
import { fraccionEnBarra, porcentajeDeFraccion, porcentajeDirecto } from "../utils/numeros";
import DescargaReporte from "./DescargaReporte";
import ProcedenciaAnalisis from "./ProcedenciaAnalisis";
import ResultadoExplicacion from "./ResultadoExplicacion";
import ResultadoValoracion from "./ResultadoValoracion";
import { useAnalisis } from "./useAnalisis";
import estilos from "./ResultadoAnalisis.module.css";

/**
 * Texto del aviso de Grad-CAM, el que va junto al mapa: **el que manda el servidor**, tal
 * cual, sin reescribirlo.
 *
 * Es la excepción a `CLAUDE.md` § 7, y decidida así por Mónica: esto no es texto de
 * interfaz sino una advertencia sobre el modelo. Si una revisión del modelo cambia lo que
 * hay que advertir, el texto cambia en el servidor y el frontend no se toca. Por eso aquí
 * no se adapta ni se recorta.
 *
 * La red: `aviso` tiene valor por omisión en el esquema y siempre debería llegar, pero una
 * respuesta sin él dejaría el mapa de calor sin ninguna advertencia, que es justo lo que no
 * puede pasar. Si llega vacío o en blanco se pinta el texto de respaldo.
 */
const AVISO_GRAD_CAM_DE_RESPALDO =
  "El mapa de calor Grad-CAM es una visualización experimental de las zonas que más " +
  "influyeron en el modelo. No es una segmentación clínica ni delimita una lesión.";

export function textoAvisoGradCam(mapa: MapaCalor): string {
  const delServidor = typeof mapa.aviso === "string" ? mapa.aviso.trim() : "";
  return delServidor || AVISO_GRAD_CAM_DE_RESPALDO;
}

/** Una fila de «Características identificadas». */
function FilaCaracteristica({ caracteristica }: { caracteristica: CaracteristicaResultado }) {
  const { nombre, probabilidad, umbral_aplicado, supera_umbral } = caracteristica;
  return (
    <li className={estilos.fila}>
      <div className={estilos.filaCabecera}>
        <span className={estilos.nombre}>{nombre}</span>
        {/* El estado lo dice el texto; el color solo refuerza (WCAG 1.4.1). */}
        <Insignia tipo={supera_umbral ? "info" : "neutral"}>
          {supera_umbral ? "Supera el umbral" : "Bajo el umbral"}
        </Insignia>
        <span className={estilos.probabilidad}>{porcentajeDeFraccion(probabilidad)}</span>
      </div>
      {/* Decorativa: el porcentaje y la insignia ya dicen todo lo que la barra dibuja. */}
      <div className={estilos.barra} aria-hidden="true">
        <span
          className={supera_umbral ? estilos.rellenoSupera : estilos.rellenoBajo}
          style={{ width: `${fraccionEnBarra(probabilidad)}%` }}
        />
        <span className={estilos.marcaUmbral} style={{ left: `${fraccionEnBarra(umbral_aplicado)}%` }} />
      </div>
      <p className={estilos.umbral}>Umbral aplicado: {porcentajeDeFraccion(umbral_aplicado)}</p>
    </li>
  );
}

/** Un bloque «Región de interés detectada». El orden es el que manda el servidor. */
function BloqueRegion({
  region,
  numero,
  nombreCaracteristica,
}: {
  region: RegionInteres;
  numero: number;
  nombreCaracteristica: string | null;
}) {
  return (
    <li className={estilos.region}>
      <p className={estilos.regionHallazgo}>
        Hallazgo relevante:{" "}
        {nombreCaracteristica ? `${nombreCaracteristica} (Región ${numero})` : `Región ${numero}`}
      </p>
      <p className={estilos.regionDato}>
        Área analizada: {porcentajeDirecto(region.area_porcentaje)} de la imagen
      </p>
    </li>
  );
}

/**
 * Por qué falló un análisis, con lo que sí trae `GET /analisis/{id}`: `codigo_error` y, en
 * el fallo de calidad, `calidad.causas`. Está en pasado y **no ofrece reintentar**: desde el
 * historial se abre algo que falló hace días, no un intento recién hecho.
 *
 * El `ERR-xxxx` no se le muestra a la persona. El código que se dicta al administrador es el
 * de los 5xx (W-31), y estos cuatro no lo son: son fallos documentados del análisis.
 */
function motivoDelFallo(detalle: AnalisisDetalle): string {
  if (detalle.codigo_error === CodigoFalloAnalisis.CALIDAD_INSUFICIENTE) {
    return descripcionCalidad(detalle.calidad);
  }
  // `ERR-1002` (inferencia), `ERR-1003` (cola) y `ERR-1004` (error interno) son todos fallos
  // del servicio y se dicen con el mismo texto, sin detalles técnicos (RF-R05 CA 5).
  return (
    "El servicio que clasifica las imágenes no respondió y el análisis quedó sin resultado. " +
    "La imagen no se guardó."
  );
}

/** «ID A-2026-000123 · 19/10/2026 10:42 · Modelo: usuario/modelo @ 3e1f9c0» */
function lineaDatos(detalle: AnalisisDetalle): string {
  const cuando = fechaHoraCorta(detalle.completado_en ?? detalle.solicitado_en);
  const modelo = `${detalle.modelo.repositorio_hf} @ ${detalle.modelo.revision_corta}`;
  return [`ID ${detalle.codigo}`, cuando, `Modelo: ${modelo}`].filter(Boolean).join(" · ");
}

export default function ResultadoAnalisis({ titulo }: { titulo: string }) {
  const { idAnalisis = "" } = useParams();
  const { detalle, cargando, recargando, noEncontrado, aviso, recargar } = useAnalisis(idAnalisis);

  const enlaceNuevoAnalisis = (
    <EnlaceBoton jerarquia="primario" to="/nuevo-analisis">
      <IconoMas className={estilos.iconoBoton} />
      <span>Nuevo análisis</span>
    </EnlaceBoton>
  );

  // Lo único que ve la rama FALLIDO. **Aquí no entra «Descargar reporte»**: ver la nota junto
  // al encabezado de la rama COMPLETADO.
  const accionNuevo = <div className={estilos.accionEncabezado}>{enlaceNuevoAnalisis}</div>;

  if (noEncontrado) {
    return (
      <>
        <EncabezadoPagina titulo={titulo} />
        <EstadoVacio
          nivelTitulo="h2"
          titulo="No encontramos este análisis"
          mensaje="Puede que el enlace sea incorrecto o que el análisis no sea suyo."
        >
          <EnlaceBoton to="/nuevo-analisis" jerarquia="primario">
            Solicitar un análisis nuevo
          </EnlaceBoton>
        </EstadoVacio>
      </>
    );
  }

  if (cargando) {
    return (
      <>
        <EncabezadoPagina titulo={titulo} />
        <div className={estilos.cargando} aria-busy="true">
          <p className={estilos.textoCargando}>Cargando el resultado…</p>
          <Esqueleto forma="tarjeta" />
          <Esqueleto forma="tarjeta" />
        </div>
      </>
    );
  }

  // Sin datos y con fallo: no hay nada que leer, así que el aviso ocupa la pantalla.
  if (!detalle) {
    return (
      <>
        <EncabezadoPagina titulo={titulo} />
        {aviso && (
          <div className={estilos.avisoSolo}>
            <Alerta tipo="error" titulo={aviso.titulo}>
              {aviso.mensaje}
            </Alerta>
            <Boton jerarquia="secundario" cargando={recargando} etiquetaCargando="Cargando…" onClick={recargar}>
              Reintentar
            </Boton>
          </div>
        )}
      </>
    );
  }

  // Un análisis que todavía corre sí se ve en W-07: ahí el seguimiento en vivo tiene
  // sentido y es su pantalla.
  if (detalle.estado === "PROCESANDO") {
    return <Navigate to={`/nuevo-analisis/${encodeURIComponent(idAnalisis)}`} replace />;
  }

  // PROPUESTA no dibujada: un análisis FALLIDO se queda aquí.
  //
  // Hasta la tarea 7 también se redirigía a W-07, decisión de la 6a tomada cuando el
  // historial no existía y aquí solo se llegaba recién hecho el análisis. Abierto desde el
  // historial, eso enseñaba «Su imagen no se guardó. Intente de nuevo en unos minutos» con
  // un «Reintentar» para algo que falló hace dos días: un texto escrito para un intento
  // recién hecho.
  if (detalle.estado === "FALLIDO") {
    return (
      <>
        <EncabezadoPagina
          titulo="Resultado del análisis"
          descripcion={lineaDatos(detalle)}
          acciones={accionNuevo}
        />
        {/* Encima del contenido, igual que en la rama COMPLETADO: de quién es el análisis se
            lee antes de leer el análisis. Ver la nota junto a la otra aparición. */}
        <ProcedenciaAnalisis realizadoPor={detalle.realizado_por} trasladado={detalle.trasladado} />
        <section className={estilos.tarjeta} aria-labelledby="titulo-fallo">
          <h2 id="titulo-fallo" className={estilos.tituloTarjeta}>
            Este análisis no produjo resultado
          </h2>
          {/* `advertencia` y no `error`: es un hecho ya pasado que se consulta, no un fallo
              que acaba de ocurrir, así que se anuncia con `role="status"` y no interrumpe. */}
          <Alerta tipo="advertencia">{motivoDelFallo(detalle)}</Alerta>
          {/* «Solicitado», no «Falló»: ninguna de las dos rutas de fallo del backend escribe
              `completado_en` (`procesamiento.py:_fallar` y `clasificacion.py`), así que la
              única fecha que llega es la de la solicitud. Decir «falló el …» sería inventar
              un dato que la API no da. */}
          <p className={estilos.fechaFallo}>
            Solicitado el {fechaHoraCorta(detalle.solicitado_en)}.
          </p>
          <p className={estilos.pieTarjeta}>
            No hay imagen, mapa de calor ni características: el análisis se interrumpió antes
            de generarlos.
          </p>
        </section>
      </>
    );
  }

  const { imagen, mapa_calor: mapaCalor, caracteristicas, regiones, ninguna_supera_umbral } = detalle;
  const nombrePorId = new Map(caracteristicas.map((c) => [c.id, c.nombre]));

  // W-17 dibuja dos acciones en la cabecera, «Volver al historial» y «Descargar reporte»; lo
  // implementado tiene «Nuevo análisis» porque este mismo componente es también W-08. Se
  // conserva «Nuevo análisis» como primario y «Descargar reporte» va a su izquierda, como botón
  // secundario (en W-17e y W-17f está dibujado blanco con borde e icono, no relleno).
  //
  // **Solo en esta rama.** El reporte exige un análisis COMPLETADO (422 ANALISIS_SIN_RESULTADO
  // si no lo está), así que en la rama FALLIDO el botón no existe, ni deshabilitado; y
  // PROCESANDO redirige antes de llegar aquí. El identificador que viaja es `detalle.id` (el
  // UUID que pide el POST), no el parámetro de la ruta.
  const accionesResultado = (
    <div className={estilos.accionEncabezado}>
      <DescargaReporte idAnalisis={detalle.id} />
      {enlaceNuevoAnalisis}
    </div>
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Resultado del análisis"
        descripcion={lineaDatos(detalle)}
        acciones={accionesResultado}
      />

      {/* Falló una recarga con el resultado ya en pantalla: se avisa sin quitar lo que se lee. */}
      {aviso && (
        <Alerta tipo="error" titulo={aviso.titulo}>
          {aviso.mensaje}
        </Alerta>
      )}

      {/* W-17b. Va **encima** del contenido y a todo el ancho, no dentro de una columna, y en
          esta rama y en la del fallo por el mismo principio: de quién es el análisis se lee
          antes que el análisis. Dentro de `.columnaDerecha` competiría con «Características
          identificadas» y en celular caería después de la imagen y del mapa, es decir después
          de haber interpretado la imagen. Es además un dato del análisis entero, como la línea
          del encabezado, y no de ninguna de las dos columnas.

          Con un ejecutor propio y sin traslado el componente no pinta nada, que es el caso de
          W-08 recién terminado un análisis: esa pantalla queda igual. */}
      <ProcedenciaAnalisis realizadoPor={detalle.realizado_por} trasladado={detalle.trasladado} />

      <div className={estilos.columnas}>
        <section className={estilos.tarjeta} aria-labelledby="titulo-imagen">
          <h2 id="titulo-imagen" className={estilos.tituloTarjeta}>
            Imagen y explicación visual
          </h2>

          <div className={estilos.imagenes}>
            <ImagenFirmada
              url={imagen.url}
              alt="Imagen endoscópica del análisis, anonimizada"
              pie="Imagen cargada (anonimizada)"
              ancho={imagen.ancho}
              alto={imagen.alto}
              onRecargar={recargar}
              recargando={recargando}
            />
            {mapaCalor && (
              <ImagenFirmada
                url={mapaCalor.url}
                alt="Mapa de calor Grad-CAM sobre la imagen del análisis: resalta las zonas que más influyeron en el modelo."
                pie="Mapa de calor Grad-CAM"
                nota={textoAvisoGradCam(mapaCalor)}
                // El mapa se superpone a la imagen, así que comparte su tamaño: la API no
                // manda uno propio y con este se reserva bien el sitio en la página.
                ancho={imagen.ancho}
                alto={imagen.alto}
                onRecargar={recargar}
                recargando={recargando}
              />
            )}
          </div>

          {!mapaCalor && (
            <p className={estilos.sinMapa}>
              {ninguna_supera_umbral
                ? "No se generó mapa de calor: ninguna característica superó su umbral, así que el modelo no señaló ninguna región."
                : "Este análisis no tiene mapa de calor ni regiones señaladas."}
            </p>
          )}

          {regiones.length > 0 && (
            <div className={estilos.regiones}>
              <h3 className={estilos.tituloRegiones}>
                {regiones.length === 1 ? "Región de interés detectada" : "Regiones de interés detectadas"}
              </h3>
              <ul className={estilos.listaRegiones}>
                {regiones.map((region, indice) => (
                  <BloqueRegion
                    key={`${region.caracteristica_id}-${region.orden}`}
                    region={region}
                    numero={indice + 1}
                    nombreCaracteristica={nombrePorId.get(region.caracteristica_id) ?? null}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Columna derecha: tres tarjetas apiladas. En celular todo queda en una columna. */}
        <div className={estilos.columnaDerecha}>
          <section className={estilos.tarjeta} aria-labelledby="titulo-caracteristicas">
            <div className={estilos.cabeceraTarjeta}>
              <h2 id="titulo-caracteristicas" className={estilos.tituloTarjeta}>
                Características identificadas
              </h2>
              <DistintivoExperimental />
            </div>

            {/* W-08b. No se deduce de la lista: el servidor lo dice en un campo propio. */}
            {ninguna_supera_umbral && (
              <Alerta tipo="info" titulo="Ninguna característica supera el umbral de confianza">
                El modelo no alcanzó la confianza mínima en ninguna característica. Esto no
                descarta hallazgos: interprete la imagen con su criterio profesional.
              </Alerta>
            )}

            {caracteristicas.length === 0 ? (
              <p className={estilos.sinCaracteristicas}>
                Este análisis no tiene características evaluadas.
              </p>
            ) : (
              <ul className={estilos.caracteristicas}>
                {caracteristicas.map((caracteristica) => (
                  <FilaCaracteristica key={caracteristica.id} caracteristica={caracteristica} />
                ))}
              </ul>
            )}

            <p className={estilos.pieTarjeta}>
              La raya vertical de cada barra marca el umbral que se aplicó a este análisis, que
              puede no ser el que está configurado hoy (lo configura el administrador, RF-A01).
              Una imagen puede tener varias características a la vez: las probabilidades no suman
              100 %.
            </p>
          </section>

          {/* W-08c y W-08d. Llega después del resultado y no lo bloquea (RF-R05 CA 3). */}
          <ResultadoExplicacion idAnalisis={idAnalisis} semilla={detalle.explicacion} />

          {/* W-08e a W-08h. Solo cuenta la observación propia para valorar: las de otros
              doctores llegan con un caso trasladado y se listan aparte, sin poder editarse.
              Que al terminar un análisis nuevo no se vea ninguna ajena no lo decide esta
              pantalla —es la misma para W-08 y W-17 (`navegacion/pantallas.tsx`)— sino la
              respuesta, que en ese momento no trae observaciones de nadie más. */}
          <ResultadoValoracion
            idAnalisis={idAnalisis}
            observacionPropia={detalle.observaciones.find((o) => o.es_mia) ?? null}
            observacionesAjenas={detalle.observaciones.filter((o) => !o.es_mia)}
            onRecargar={recargar}
          />
        </div>
      </div>
    </>
  );
}
