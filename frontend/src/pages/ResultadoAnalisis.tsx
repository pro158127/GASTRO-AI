// Pantalla W-08 · Resultado del análisis (Figma 47:870), con W-08b (ninguna característica
// supera el umbral, 95:2376). Tableta T-08 (109:893) y celular M-08 (109:1147).
// Solo rol DOCTOR. Sin TOPOLOGO: lo dice la nota de la pantalla en Figma.
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
import type { AnalisisDetalle, CaracteristicaResultado, MapaCalor, RegionInteres } from "../types";
import { fechaHoraCorta } from "../utils/fechas";
import { fraccionEnBarra, porcentajeDeFraccion, porcentajeDirecto } from "../utils/numeros";
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

/** «ID A-2026-000123 · 19/10/2026 10:42 · Modelo: usuario/modelo @ 3e1f9c0» */
function lineaDatos(detalle: AnalisisDetalle): string {
  const cuando = fechaHoraCorta(detalle.completado_en ?? detalle.solicitado_en);
  const modelo = `${detalle.modelo.repositorio_hf} @ ${detalle.modelo.revision_corta}`;
  return [`ID ${detalle.codigo}`, cuando, `Modelo: ${modelo}`].filter(Boolean).join(" · ");
}

export default function ResultadoAnalisis({ titulo }: { titulo: string }) {
  const { idAnalisis = "" } = useParams();
  const { detalle, cargando, recargando, noEncontrado, aviso, recargar } = useAnalisis(idAnalisis);

  const accionNuevo = (
    <div className={estilos.accionEncabezado}>
      <EnlaceBoton jerarquia="primario" to="/nuevo-analisis">
        <IconoMas className={estilos.iconoBoton} />
        <span>Nuevo análisis</span>
      </EnlaceBoton>
    </div>
  );

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

  // Un análisis que todavía corre o que falló se ve en W-07, que es su pantalla. Pasa si
  // alguien guardó el enlace del resultado. No está dibujado: por eso se redirige en vez de
  // inventar un estado.
  if (detalle.estado !== "COMPLETADO") {
    return <Navigate to={`/nuevo-analisis/${encodeURIComponent(idAnalisis)}`} replace />;
  }

  const { imagen, mapa_calor: mapaCalor, caracteristicas, regiones, ninguna_supera_umbral } = detalle;
  const nombrePorId = new Map(caracteristicas.map((c) => [c.id, c.nombre]));

  return (
    <>
      <EncabezadoPagina titulo="Resultado del análisis" descripcion={lineaDatos(detalle)} acciones={accionNuevo} />

      {/* Falló una recarga con el resultado ya en pantalla: se avisa sin quitar lo que se lee. */}
      {aviso && (
        <Alerta tipo="error" titulo={aviso.titulo}>
          {aviso.mensaje}
        </Alerta>
      )}

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
              El modelo no alcanzó la confianza mínima en ninguna característica. Esto no descarta
              hallazgos: interprete la imagen con su criterio profesional.
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
            La raya vertical de cada barra marca el umbral que se aplicó a este análisis, que puede
            no ser el que está configurado hoy (lo configura el administrador, RF-A01). Una imagen
            puede tener varias características a la vez: las probabilidades no suman 100 %.
          </p>
        </section>
      </div>
    </>
  );
}
