// Componente «Campo de contraseña» del sistema de diseño (Figma 16:788).
// Permite pegar y usar gestores de contraseñas (WCAG 3.3.8) y tiene botón «Mostrar contraseña».
import { useState } from "react";
import CampoTexto from "./CampoTexto";
import type { PropiedadesCampoTexto } from "./CampoTexto";
import IconoOcultar from "./iconos/IconoOcultar";
import IconoVer from "./iconos/IconoVer";
import estilos from "./CampoContrasena.module.css";

type PropiedadesCampoContrasena = Omit<PropiedadesCampoTexto, "type" | "accionFinal">;

export default function CampoContrasena({
  autoComplete = "current-password",
  ...resto
}: PropiedadesCampoContrasena) {
  const [visible, setVisible] = useState(false);

  return (
    <CampoTexto
      {...resto}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      accionFinal={
        <button
          type="button"
          className={estilos.botonMostrar}
          aria-label="Mostrar contraseña"
          aria-pressed={visible}
          disabled={resto.disabled}
          onClick={() => setVisible((actual) => !actual)}
        >
          {/* El ícono muestra el estado actual: ojo abierto con la contraseña visible y ojo
              tachado con la contraseña oculta. El nombre accesible y aria-pressed no cambian. */}
          {visible ? (
            <IconoVer className={estilos.icono} />
          ) : (
            <IconoOcultar className={estilos.icono} />
          )}
        </button>
      }
    />
  );
}
