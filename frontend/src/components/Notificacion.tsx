// Componente «Notificación» del sistema de diseño (Figma 91:2326; celular M-N01).
// Confirmación breve de una acción. Aparece arriba a la derecha del área de contenido (en
// celular, bajo la barra superior y a todo el ancho). La de éxito se cierra sola a los 6 s, pero
// la cuenta se pausa mientras el puntero o el foco están sobre ella (WCAG 2.2.1), y se puede
// cerrar antes con el botón. role="status": el lector de pantalla la anuncia sin interrumpir.
// Nunca lleva información que solo exista ahí. Por ahora solo se usa la variante de éxito.
import { useEffect, useRef, useState } from "react";
import IconoCerrar from "./iconos/IconoCerrar";
import IconoExito from "./iconos/IconoExito";
import estilos from "./Notificacion.module.css";

const DURACION_MS = 6000;

interface PropiedadesNotificacion {
  titulo: string;
  mensaje: string;
  onCerrar: () => void;
}

export default function Notificacion({ titulo, mensaje, onCerrar }: PropiedadesNotificacion) {
  const [pausada, setPausada] = useState(false);
  // Tiempo que queda: al pausar se conserva y al reanudar se sigue desde ahí.
  const restanteRef = useRef(DURACION_MS);
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;

  useEffect(() => {
    if (pausada) return;
    const inicio = performance.now();
    const temporizador = window.setTimeout(() => onCerrarRef.current(), restanteRef.current);
    return () => {
      window.clearTimeout(temporizador);
      restanteRef.current = Math.max(0, restanteRef.current - (performance.now() - inicio));
    };
  }, [pausada]);

  return (
    <div
      className={estilos.notificacion}
      role="status"
      onMouseEnter={() => setPausada(true)}
      onMouseLeave={() => setPausada(false)}
      onFocus={() => setPausada(true)}
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setPausada(false);
      }}
    >
      <IconoExito className={estilos.icono} />
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
