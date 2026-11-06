// Antes de la cookie de sesión, el token se guardaba en localStorage con esta clave. Se borra una
// sola vez al arrancar para que no quede un token viejo en el navegador. Se puede eliminar cuando
// ya no haya navegadores con la clave anterior.
const CLAVE_TOKEN_ANTERIOR = "gastroai_token";

export function borrarTokenAnterior(): void {
  try {
    localStorage.removeItem(CLAVE_TOKEN_ANTERIOR);
  } catch {
    // Sin acceso a localStorage no hay nada que borrar.
  }
}
