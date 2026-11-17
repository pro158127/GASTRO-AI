// Pantalla W-04 · Código del segundo factor (con W-04b: código incorrecto o vencido). Se pide en
// cada ingreso de una cuenta con la app ya vinculada. Los intentos fallidos cuentan para el
// bloqueo (RF-U12): al quinto consecutivo la cuenta se bloquea 15 minutos y se vuelve a W-01
// con el mensaje genérico de W-01b (ver ProveedorSesion).
import { useEffect, useRef } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoCodigo from "../components/CampoCodigo";
import DisposicionAcceso from "../components/DisposicionAcceso";
import IconoEscudo from "../components/iconos/IconoEscudo";
import { verificarTotp } from "../services/api";
import { useSesion } from "../sesion/ProveedorSesion";
import { ID_CAMPO_CODIGO, useFormularioCodigo } from "../sesion/useFormularioCodigo";
import estilos from "./AccesoPasos.module.css";
import estilosVerificacion from "./VerificarCodigo.module.css";

// W-04b.
const MENSAJE_CODIGO_INCORRECTO =
  "Código incorrecto o vencido. Escriba el que muestra ahora su app (cambia cada 30 segundos).";

export default function VerificarCodigo() {
  const { avanzarEtapa, cerrarSesion } = useSesion();
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = "Verificación en dos pasos · Gastro-AI";
    // Al llegar a la pantalla, el foco va al título.
    tituloRef.current?.focus({ preventScroll: true });
  }, []);

  const { codigo, setCodigo, errorCodigo, aviso, enviando, manejarEnvio } = useFormularioCodigo({
    enviar: verificarTotp,
    mensajeCodigoIncorrecto: MENSAJE_CODIGO_INCORRECTO,
    // Cuenta activa: las guardas llevan a la pantalla principal. `ruta_inicial` se ignora.
    alIngresar: (respuesta) => avanzarEtapa(respuesta.etapa, respuesta.usuario),
  });

  return (
    <DisposicionAcceso ancho={440}>
      <IconoEscudo className={estilosVerificacion.escudo} />
      <h1 ref={tituloRef} tabIndex={-1} className={estilos.titulo}>
        Verificación en dos pasos
      </h1>
      <p className={estilos.introduccion}>
        Escriba el código de 6 dígitos que muestra su app autenticadora.
      </p>
      <form className={estilos.formulario} method="post" onSubmit={manejarEnvio} noValidate>
        {aviso && (
          <Alerta tipo={aviso.tipo} titulo={aviso.titulo}>
            {aviso.mensaje}
          </Alerta>
        )}
        <CampoCodigo
          id={ID_CAMPO_CODIGO}
          etiqueta="Código de 6 dígitos"
          name="codigo"
          placeholder="123456"
          ayuda="El código cambia cada 30 segundos y solo se puede usar una vez."
          mensajeError={errorCodigo ?? undefined}
          value={codigo}
          onChange={setCodigo}
        />
        <div className={estilos.acciones}>
          <Boton type="submit" anchoCompleto cargando={enviando} etiquetaCargando="Verificando…">
            Verificar
          </Boton>
          <Boton jerarquia="terciario" anchoCompleto onClick={cerrarSesion}>
            Volver al inicio de sesión
          </Boton>
        </div>
      </form>
    </DisposicionAcceso>
  );
}
