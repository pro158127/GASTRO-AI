// Única puerta a «¿ya vio el recorrido?» (W-13, W-14b…W-14h).
//
// El backend ya expone la columna `Usuario.recorrido_visto_en` (migración 0003) con dos
// endpoints: `GET /perfil → recorrido_visto: bool` y `POST /perfil/recorrido-visto → 204`
// (rama `feature/63-backend-base`, commit `a5b7afe`, PR #319). Ver CONTRATOS_API.md (RT-1).
//
// El campo significa «la primera vez que lo vio», no «la última»: el servicio del backend solo
// escribe la fecha si estaba nula, así que el POST es idempotente de verdad y aquí no hace falta
// protegerse de la doble invocación de StrictMode por ese lado.
//
// Las dos funciones son lo único del frontend que conoce el campo: las pantallas solo ven estas
// firmas. Por eso la caché de más abajo vive aquí y no en el dashboard ni en la sesión.
//
// Prohibido `localStorage` y `sessionStorage`: la marca se olvidaría al cambiar de equipo y se
// le mostraría a quien comparta la máquina (ver `ProveedorSesion.tsx:3`). La única excepción de
// almacenamiento del proyecto sigue siendo el cierre de sesión pendiente. La caché de módulo sí
// se permite porque vive en la memoria del JS y muere con la página, que es exactamente la vida
// útil que se busca.
import { marcarRecorridoVistoEnServidor, obtenerPerfil } from "../services/api";

/**
 * Lo que ya se sabe, para no volver a preguntarlo en lo que dure la página. Solo se guarda
 * `true`: es el único valor que no puede cambiar sin que esta página lo provoque. Un `false` no
 * se cachea porque el recorrido puede terminarse en este mismo rato, y un fallo tampoco, para
 * que el próximo ingreso lo reintente.
 */
let yaLoSabemos = false;

/** La consulta en vuelo, para que dos llamadas a la vez (StrictMode) compartan una sola. */
let consultaEnCurso: Promise<boolean | null> | null = null;

/**
 * `true`/`false` según lo haya visto o no; `null` cuando no se pudo saber (falló la consulta),
 * y entonces el recorrido **no arranca solo**: es la degradación aceptada.
 *
 * El lanzamiento manual («Ver recorrido» en Mi perfil, W-18) no pasa por aquí: abre y ya.
 */
export async function yaVioElRecorrido(): Promise<boolean | null> {
  if (yaLoSabemos) return true;
  if (consultaEnCurso) return consultaEnCurso;

  consultaEnCurso = (async () => {
    try {
      const visto = (await obtenerPerfil()).recorrido_visto;
      if (visto) yaLoSabemos = true;
      return visto;
    } catch {
      // Se traga el fallo a propósito: no hay nada que mostrarle a nadie por un recorrido, y los
      // errores globales (401, 403) ya los atendieron los manejadores de `api.ts` antes de
      // llegar aquí. **Consecuencia:** devolver `null` hace que el recorrido no arranque solo en
      // este ingreso. Si alguien informa que nunca le arranca en el primer ingreso, el síntoma a
      // buscar es un `GET /perfil` que falla o un `recorrido_visto` que no llega en la respuesta.
      return null;
    } finally {
      consultaEnCurso = null;
    }
  })();

  return consultaEnCurso;
}

/**
 * Marca que la persona ya terminó u omitió el recorrido. Se llama al cerrar el recorrido, y
 * **nunca falla hacia la pantalla**: el recorrido se cierra igual y no se muestra ningún error.
 */
export async function marcarRecorridoVisto(): Promise<void> {
  // Se recuerda antes de pedirlo: aunque el POST falle, dentro de esta página ya no hay que
  // volver a preguntar ni a abrirlo.
  yaLoSabemos = true;
  try {
    await marcarRecorridoVistoEnServidor();
  } catch {
    // Se traga el fallo a propósito: un aviso de error encima del dashboard por un recorrido es
    // peor que la consecuencia. **Consecuencia:** la fecha no queda escrita, así que el
    // recorrido **volverá a salir solo en el próximo ingreso**, y en todos, hasta que un POST
    // llegue bien. Es la degradación aceptada para una red caída, pero el mismo síntoma —el
    // recorrido que reaparece siempre— es el que daría un error de programación aquí dentro (una
    // ruta mal escrita, por ejemplo), que este `catch` también se traga en silencio. Si alguien
    // informa eso, lo primero que hay que mirar es la respuesta de `POST /perfil/recorrido-visto`
    // en la pestaña de red del navegador.
  }
}
