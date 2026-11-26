// La lista de eventos de W-21 (Figma 70:5981), con el esqueleto de W-21b (101:2264).
//
// Escritorio: tabla. Desde tableta: tarjetas, igual que en W-16 y W-27 y por el mismo motivo:
// a 320 px cinco columnas no caben sin desplazamiento horizontal (WCAG 1.4.10), así que no se
// encoge la tabla, se cambia de forma.
//
// **Ninguna columna se puede ordenar.** Figma dibuja la flecha descendente en «Fecha y hora» y
// el ícono de ordenable en las otras cuatro, pero `GET /admin/bitacora` **no acepta ningún
// parámetro de orden**: los ocho que acepta son `pagina`, `por_pagina`, `accion`, `resultado`,
// `actor_id`, `actor`, `desde` y `hasta`, y el servidor devuelve siempre lo más reciente
// primero. Tampoco se ordena en el navegador: reordenar las 8 filas de la página aparentaría
// ordenar las 245 del total, que es peor que no tener orden. Así que los encabezados son texto,
// sin botón, sin ícono y sin `aria-sort`, y el sentido se dice con palabras: visible en el pie
// de la pantalla y, aquí, en el `<span>` para lector de pantalla de «Fecha y hora» (WCAG 1.4.1).
// Queda anotado en CONTRATOS_API.md (BI-2).
//
// **Los textos los redacta el servidor.** `accion_texto` y `detalle` llegan ya escritos en
// español desde `backend/app/services/bitacora.py`; aquí no hay ningún mapa de códigos a
// etiquetas ni se compone ningún detalle. El código crudo (`accion`) no se muestra nunca.
import Esqueleto from "../components/Esqueleto";
import Insignia from "../components/Insignia";
import type { EntradaBitacora } from "../types";
import { fechaHoraCorta } from "../utils/fechas";
import { nombreDeOrigen } from "./TablaCasosRecibidos";
import estilos from "./TablaBitacora.module.css";

/** W-21b dibuja seis filas de esqueleto; en tarjetas, cuatro (lo que entra en tableta). */
const FILAS_ESQUELETO = 6;
const TARJETAS_ESQUELETO = 4;

/** El sentido del orden, para el pie de la pantalla y para el encabezado de la fecha. */
export const SENTIDO_ORDEN = "del más reciente al más antiguo";

/**
 * «19/10/2026 15:27». Si `fechaHoraCorta` no entiende el instante devuelve cadena vacía, y una
 * celda vacía en una tabla se lee como un dato perdido: nunca se deja colgando.
 */
function textoFecha(entrada: EntradaBitacora): string {
  return fechaHoraCorta(entrada.ocurrido_en) || "Fecha no disponible";
}

/**
 * Quién hizo la acción. `actor: null` **no es un hueco ni un error**: significa que el intento
 * no llegó a identificar a nadie (por ejemplo, un inicio de sesión con un correo que no
 * existe), que es justo el caso al que manda la alerta de W-19. Por eso se dice con palabras y
 * no con un guion.
 *
 * Figma escribe aquí el correo de la cuenta («marta.rios@usc.edu.co»), pero el contrato no
 * entrega correos: `actor` es `{id, nombre, apellido, cuenta_eliminada}`. Se pinta el nombre.
 */
function textoActor(entrada: EntradaBitacora): string {
  return entrada.actor ? nombreDeOrigen(entrada.actor) : "Sin sesión identificada";
}

/**
 * El detalle, con **el objetivo delante**: «Carlos Díaz · De Doctor a Administrador».
 *
 * Hace falta porque `detalle_legible()` del servidor no nombra nunca a la cuenta afectada —un
 * cambio de rol llega como «De Doctor a Administrador», sin decir de quién—, y el frame sí la
 * escribe, dentro de esta misma columna. El `detalle` no se reescribe ni se compone: se le pone
 * delante un nombre que el contrato ya entrega aparte, en `objetivo`.
 */
function textoDetalle(entrada: EntradaBitacora): string {
  const quien = entrada.objetivo ? nombreDeOrigen(entrada.objetivo) : "";
  const detalle = entrada.detalle ?? "";
  if (quien && detalle) return `${quien} · ${detalle}`;
  return quien || detalle || "Sin detalle registrado";
}

function textoIp(entrada: EntradaBitacora): string {
  return entrada.ip ?? "Sin IP registrada";
}

/**
 * El evento, con la insignia «Fallido» cuando `resultado` es FALLO.
 *
 * No es adorno: el servidor manda el **mismo** `accion_texto` («Inicio de sesión») para quien
 * entró y para quien falló, así que sin esto las dos filas se leerían igual. El significado lo
 * da la palabra «Fallido»; el color solo la refuerza (WCAG 1.4.1). Los EXITO no llevan
 * insignia: son la mayoría de las filas y una marca en todas no distinguiría nada.
 */
function Evento({ entrada }: { entrada: EntradaBitacora }) {
  return (
    <>
      <span className={estilos.accion}>{entrada.accion_texto}</span>
      {entrada.resultado === "FALLO" && (
        <span className={estilos.marcaResultado}>
          <Insignia tipo="error">Fallido</Insignia>
        </span>
      )}
    </>
  );
}

interface PropiedadesTablaBitacora {
  filas: EntradaBitacora[];
}

export default function TablaBitacora({ filas }: PropiedadesTablaBitacora) {
  return (
    <>
      <div className={`${estilos.marcoTabla} ${estilos.soloEscritorio}`}>
        <table className={estilos.tabla}>
          <caption className={estilos.soloLector}>Bitácora de eventos</caption>
          <thead>
            <tr>
              <th scope="col" className={estilos.columnaFecha}>
                Fecha y hora
                {/* El sentido del orden, sin prometer un control que no existe. */}
                <span className={estilos.soloLector}>, {SENTIDO_ORDEN}</span>
              </th>
              <th scope="col" className={estilos.columnaUsuario}>
                Usuario
              </th>
              <th scope="col" className={estilos.columnaEvento}>
                Evento
              </th>
              <th scope="col">Detalle</th>
              <th scope="col" className={estilos.columnaIp}>
                IP de origen
              </th>
            </tr>
          </thead>
          <tbody>
            {/* `id` es un bigint que viaja como texto: aquí es la clave y nada más. */}
            {filas.map((fila) => (
              <tr key={fila.id}>
                <td className={estilos.fecha}>{textoFecha(fila)}</td>
                <td className={fila.actor ? undefined : estilos.sinDato}>{textoActor(fila)}</td>
                <td className={estilos.celdaEvento}>
                  <Evento entrada={fila} />
                </td>
                <td className={fila.detalle || fila.objetivo ? undefined : estilos.sinDato}>
                  {textoDetalle(fila)}
                </td>
                <td className={fila.ip ? estilos.ip : estilos.sinDato}>{textoIp(fila)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* En tarjeta el titular es el evento, no la fecha: es lo que se busca al recorrer la
          lista. El detalle va entero, sin recortar: es la columna larga y justo el dato que
          explica la fila, así que en celular hace más falta todavía. */}
      <ul className={`${estilos.tarjetas} ${estilos.soloTarjetas}`}>
        {filas.map((fila) => (
          <li key={fila.id} className={estilos.tarjeta}>
            <div className={estilos.lineaEvento}>
              <Evento entrada={fila} />
            </div>
            <p className={estilos.datoTarjeta}>{textoFecha(fila)}</p>
            <p className={`${estilos.datoTarjeta} ${fila.actor ? "" : estilos.sinDato}`}>
              {textoActor(fila)}
            </p>
            <p
              className={`${estilos.datoTarjeta} ${
                fila.detalle || fila.objetivo ? "" : estilos.sinDato
              }`}
            >
              {textoDetalle(fila)}
            </p>
            {/* Con el rótulo delante: fuera de la tabla una IP suelta no se identifica sola. */}
            <p className={`${estilos.datoTarjeta} ${fila.ip ? "" : estilos.sinDato}`}>
              {fila.ip ? `IP ${fila.ip}` : textoIp(fila)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

/** W-21b: esqueleto con forma de filas en escritorio y de tarjetas desde tableta. */
export function EsqueletoBitacora() {
  return (
    <>
      <div className={`${estilos.marcoTabla} ${estilos.soloEscritorio}`} aria-hidden="true">
        {Array.from({ length: FILAS_ESQUELETO }, (_, indice) => (
          <Esqueleto key={indice} forma="fila-tabla" />
        ))}
      </div>
      <div className={`${estilos.tarjetas} ${estilos.soloTarjetas}`} aria-hidden="true">
        {Array.from({ length: TARJETAS_ESQUELETO }, (_, indice) => (
          <Esqueleto key={indice} forma="tarjeta" />
        ))}
      </div>
    </>
  );
}
