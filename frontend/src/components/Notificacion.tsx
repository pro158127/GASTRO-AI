// Componente «Notificación» del sistema de diseño (Figma 91:2326; celular M-N01).
// Confirmación breve de una acción. Aparece arriba a la derecha del área de contenido (en
// celular, bajo la barra superior y a todo el ancho). Nunca lleva información que solo exista ahí.
//
// Dos variantes, y la diferencia no es solo el color:
//
// - `exito` (la de siempre): se cierra sola a los 6 s, con la cuenta en pausa mientras el puntero
//   o el foco están encima (WCAG 2.2.1), y `role="status"`, que el lector anuncia sin interrumpir.
// - `error` (W-08g): **no se cierra sola**. Un fallo que desaparece mientras la persona mira a
//   otro lado deja la pantalla mintiendo, así que solo se va con el botón. `role="alert"`, para
//   que el lector lo anuncie de inmediato.
import { useEffect, useRef, useState } from "react";
import IconoCerrar from "./iconos/IconoCerrar";
import IconoError from "./iconos/IconoError";
import IconoExito from "./iconos/IconoExito";
import estilos from "./Notificacion.module.css";

const DURACION_MS = 6000;

export type TipoNotificacion = "exito" | "error";

interface PropiedadesNotificacion {
  titulo: string;
  mensaje: string;
  onCerrar: () => void;
  /** Por omisión `exito`, que es como se usaba antes de existir esta propiedad. */
  tipo?: TipoNotificacion;
}

export default function Notificacion({
  titulo,
  mensaje,
  onCerrar,
  tipo = "exito",
}: PropiedadesNotificacion) {
  const seCierraSola = tipo === "exito";
  const [pausada, setPausada] = useState(false);
  // Tiempo que queda: al pausar se conserva y al reanudar se sigue desde ahí.
  const restanteRef = useRef(DURACION_MS);
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;

  useEffect(() => {
    if (!seCierraSola || pausada) return;
    const inicio = performance.now();
    const temporizador = window.setTimeout(() => onCerrarRef.current(), restanteRef.current);
    return () => {
      window.clearTimeout(temporizador);
      restanteRef.current = Math.max(0, restanteRef.current - (performance.now() - inicio));
    };
  }, [pausada, seCierraSola]);

  const Icono = seCierraSola ? IconoExito : IconoError;

  return (
    <div
      className={`${estilos.notificacion} ${estilos[tipo]}`}
      role={seCierraSola ? "status" : "alert"}
      onMouseEnter={() => setPausada(true)}
      onMouseLeave={() => setPausada(false)}
      onFocus={() => setPausada(true)}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setPausada(false);
      }}
    >
      <Icono className={estilos.icono} />
      <div className={estilos.texto}>
        <p className={estilos.titulo}>{titulo}</p>
        <p className={estilos.mensaje}>{mensaje}</p>
      </div>
      <button type="button" className={estilos.cerrar} aria-label="Cerrar notificación" onClick={onCerrar}>
        <IconoCerrar className={estilos.iconoCerrar} />
      </button>
    </div>
  );
}
