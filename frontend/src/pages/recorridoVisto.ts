// Única puerta a «¿ya vio el recorrido?» (W-13, W-14b…W-14h).
//
// HOY NO LLAMA A NINGÚN ENDPOINT. El backend tiene la columna `Usuario.recorrido_visto_en`
// (`backend/app/models/usuarios.py:119-122`, migración 0003), pero ningún esquema ni endpoint la
// expone todavía. Mientras no se sepa si la persona ya vio el recorrido, el recorrido **no
// arranca solo**: se lanza únicamente desde «Ver recorrido» en Mi perfil (W-18).
//
// Cuando lleguen `GET /perfil → recorrido_visto: bool` y `POST /perfil/recorrido-visto → 204`
// (idempotente), que el equipo del backend ya está implementando, **SOLO SE CAMBIA ESTE
// ARCHIVO**: el cuerpo de las dos funciones y sus importaciones. Ninguna pantalla se toca,
// porque las firmas ya son las definitivas. Ver CONTRATOS_API.md (RT-1).
//
// Prohibido `localStorage` y `sessionStorage`: la marca se olvidaría al cambiar de equipo y se
// le mostraría a quien comparta la máquina (ver `ProveedorSesion.tsx:3`). La única excepción de
// almacenamiento del proyecto sigue siendo el cierre de sesión pendiente.

/**
 * `null` = todavía no se puede saber (no hay endpoint). Es lo que hace que el recorrido no
 * arranque solo en el primer ingreso.
 */
export async function yaVioElRecorrido(): Promise<boolean | null> {
  // LÍNEA A CAMBIAR: `return (await obtenerPerfil()).recorrido_visto;`
  return null;
}

/**
 * Marca que la persona ya terminó u omitió el recorrido. Hoy no hace nada, pero ya se llama
 * desde el recorrido, para que el día del endpoint no haya que buscar dónde ponerla.
 */
export async function marcarRecorridoVisto(): Promise<void> {
  // LÍNEA A CAMBIAR: `await marcarRecorridoVistoEnServidor();` (POST /perfil/recorrido-visto)
}
