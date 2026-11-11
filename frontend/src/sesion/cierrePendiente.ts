// Marca de «cierre de sesión pendiente»: única excepción permitida de almacenamiento en el
// navegador (CLAUDE.md, sección 6). Es un booleano sin ningún dato personal.
//
// Con la cookie HttpOnly solo el servidor puede borrar la sesión (al responder POST /auth/logout).
// Si esa llamada falla, la marca recuerda que hay que reintentarla al cargar la aplicación, antes
// de consultar la sesión; así, en un equipo compartido, recargar no reabre la cuenta anterior.
// Se usa sessionStorage (no localStorage) para que se descarte al cerrar la pestaña.
const CLAVE = "gastroai_cierre_pendiente";

export function marcarCierrePendiente(): void {
  try {
    sessionStorage.setItem(CLAVE, "1");
  } catch {
    // Sin sessionStorage no se puede recordar el cierre pendiente.
  }
}

export function hayCierrePendiente(): boolean {
  try {
    return sessionStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export function borrarCierrePendiente(): void {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
}
