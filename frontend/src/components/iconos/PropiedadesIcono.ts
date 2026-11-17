/**
 * Propiedades comunes de los iconos. Son decorativos (`aria-hidden`): el significado lo da
 * siempre el texto que los acompaña o el nombre accesible del botón que los contiene.
 * El color se hereda con `currentColor`, así que se asigna con `color` desde el CSS de
 * quien los usa, con variables de diseño.
 */
export interface PropiedadesIcono {
  className?: string;
}
