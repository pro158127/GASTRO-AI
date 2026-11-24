// Campo «Rol» a partir del catálogo de la API (`GET /catalogos/roles`, consulta U-16). Lo usan
// las dos pantallas que tienen que ofrecer los roles antes de que la cuenta exista o cambie: el
// formulario de W-10 (crear usuario) y el diálogo D-04 (cambiar rol).
//
// Antes había una tabla de etiquetas en el frontend porque no existía el catálogo. Ya existe, así
// que los nombres visibles salen del servidor y son los mismos que llegan como `rol_nombre` en
// `/admin/usuarios`: un solo origen para el mismo texto.
//
// Qué se ve mientras tanto:
// - Cargando: la etiqueta del campo y «Cargando los roles…» anunciado con `role="status"`.
// - Si falla: el campo explica que no se pudieron cargar y ofrece «Reintentar», sin tocar el
//   resto del formulario. No hay una lista de respaldo escrita a mano: sería la misma tabla
//   provisional con otro nombre y mostraría un nombre inventado si el backend renombrara un rol.
//   Como no hay opciones, no se puede elegir ninguna y el formulario no deja continuar, que es
//   justo lo que tiene que pasar.
import { useEffect, useId, useState } from "react";
import Boton from "./Boton";
import CampoOpciones from "./CampoOpciones";
import IconoError from "./iconos/IconoError";
import { obtenerRoles } from "../services/catalogos";
import type { RolCatalogo, RolUsuario } from "../types";
import { esErrorGlobal } from "../utils/avisosError";
import estilos from "./CampoRol.module.css";

export interface EstadoRoles {
  roles: RolCatalogo[];
  cargando: boolean;
  error: boolean;
  reintentar: () => void;
}

/**
 * Pide el catálogo de roles. El servicio lo guarda en memoria tras el primer éxito, así que entre
 * W-10 y D-04 solo se sale a la red una vez; quien llama no tiene que saberlo.
 */
export function useRoles(): EstadoRoles {
  const [roles, setRoles] = useState<RolCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(false);
    obtenerRoles()
      .then((items) => {
        if (vigente) setRoles(items);
      })
      .catch((causa: unknown) => {
        // Un 401 o un 403 ya los atienden los manejadores globales: la pantalla se va a ir.
        if (vigente && !esErrorGlobal(causa)) setError(true);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [intento]);

  return { roles, cargando, error, reintentar: () => setIntento((n) => n + 1) };
}

interface PropiedadesCampoRol {
  estado: EstadoRoles;
  /** Etiqueta visible del grupo: «Rol» en W-10, «Nuevo rol» en D-04. */
  etiqueta: string;
  /** Nombre del grupo de radios; debe ser único dentro del formulario. */
  nombre: string;
  /** Base de los identificadores, para poder llevar el foco a la primera opción. */
  id?: string;
  valor: string;
  onCambio: (valor: string) => void;
  ayuda?: string;
  mensajeError?: string;
  disabled?: boolean;
  /**
   * Marca el rol que la cuenta ya tiene («Administrador (rol actual)»). Lo usa D-04, donde el
   * diálogo tapa la tarjeta que lo dice y si no habría que recordarlo de memoria.
   */
  rolActual?: RolUsuario;
}

export default function CampoRol({
  estado,
  etiqueta,
  nombre,
  id,
  valor,
  onCambio,
  ayuda,
  mensajeError,
  disabled = false,
  rolActual,
}: PropiedadesCampoRol) {
  const idGenerado = useId();
  const idBase = id ?? idGenerado;
  // Sin roles y sin carga en curso es lo mismo que un fallo para quien mira la pantalla: nunca se
  // deja el campo en blanco sin explicación.
  const hayProblema = estado.error || (!estado.cargando && estado.roles.length === 0);

  if (estado.cargando || hayProblema) {
    return (
      <div className={estilos.campo}>
        <p className={estilos.etiqueta}>{etiqueta}</p>
        {estado.cargando ? (
          <p className={estilos.cargando} role="status">
            Cargando los roles…
          </p>
        ) : (
          <>
            <div className={estilos.error}>
              <IconoError tamano={16} className={estilos.iconoError} />
              <p className={estilos.textoError}>
                No se pudieron cargar los roles. Sin ellos no se puede elegir uno.
              </p>
            </div>
            <div>
              <Boton jerarquia="secundario" onClick={estado.reintentar}>
                Reintentar
                <span className={estilos.soloLector}> cargar los roles</span>
              </Boton>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <CampoOpciones
      id={idBase}
      nombre={nombre}
      etiqueta={etiqueta}
      opciones={estado.roles.map((rol) => ({
        valor: rol.codigo,
        etiqueta: rol.codigo === rolActual ? `${rol.nombre} (rol actual)` : rol.nombre,
      }))}
      valor={valor}
      onCambio={onCambio}
      ayuda={ayuda}
      mensajeError={mensajeError}
      disabled={disabled}
    />
  );
}
