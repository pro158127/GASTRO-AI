// Pantalla W-03 · Vincular app autenticadora (con W-03b: código incorrecto). Paso 2 de 2 del primer
// ingreso. El secreto TOTP (QR y clave escrita) vive solo en el estado de esta pantalla: no se
// guarda en ningún almacenamiento, no va a la URL ni al estado del router, no se escribe en la
// consola y se descarta al salir. Solo viaja en la respuesta de POST /auth/totp/iniciar.
import { useCallback, useEffect, useRef, useState } from "react";
import Alerta from "../components/Alerta";
import Boton from "../components/Boton";
import CampoCodigo from "../components/CampoCodigo";
import DisposicionAcceso from "../components/DisposicionAcceso";
import IndicadorCarga from "../components/iconos/IndicadorCarga";
import { iniciarVinculacionTotp, vincularTotp } from "../services/api";
import type { VinculacionTotp } from "../services/api";
import { useSesion } from "../sesion/ProveedorSesion";
import { ID_CAMPO_CODIGO, useFormularioCodigo } from "../sesion/useFormularioCodigo";
import { avisoDeError } from "../utils/avisosError";
import { urlDeQrPng } from "../utils/qr";
import estilos from "./AccesoPasos.module.css";
import estilosVinculacion from "./VincularAplicacion.module.css";

// W-03b.
const MENSAJE_CODIGO_INCORRECTO =
  "El código no es válido. Escriba el código que muestra ahora la app; si sigue fallando, revise que la hora de su celular sea automática.";

type EstadoVinculacion =
  | { fase: "cargando" }
  | { fase: "error"; causa: unknown }
  | { fase: "listo"; secretoManual: string; urlQr: string };

export default function VincularAplicacion() {
  const { avanzarEtapa, cerrarSesion } = useSesion();
  const [estado, setEstado] = useState<EstadoVinculacion>({ fase: "cargando" });
  const [intento, setIntento] = useState(0);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  // Cada llamada a /totp/iniciar genera un secreto nuevo en el servidor. En desarrollo,
  // React StrictMode monta, desmonta y vuelve a montar la pantalla, y ejecuta el efecto dos veces:
  // si cada ejecución llamara al servidor, el QR mostrado podría no ser el que quedó guardado. Por
  // eso la solicitud vive en un ref y las dos ejecuciones esperan la MISMA promesa. (Un simple
  // «ya empecé» no sirve: la primera ejecución queda marcada como cancelada y la segunda no haría
  // nada, y la pantalla se quedaría sin QR.) El ref no se vacía al desmontar: StrictMode también
  // ejecuta esa limpieza y obligaría a una segunda llamada; al salir de la pantalla el ref, el
  // estado y el secreto se descartan junto con el componente.
  const solicitudRef = useRef<Promise<VinculacionTotp> | null>(null);

  useEffect(() => {
    document.title = "Vincular app autenticadora · Gastro-AI";
    // Al llegar a la pantalla, el foco va al título.
    tituloRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let montada = true;
    solicitudRef.current ??= iniciarVinculacionTotp();
    solicitudRef.current
      .then((vinculacion) => {
        if (!montada) return;
        const urlQr = urlDeQrPng(vinculacion.qrPngBase64);
        // Un QR que no sea un PNG en Base64 válido no se muestra: se trata como error inesperado.
        setEstado(
          urlQr === null
            ? { fase: "error", causa: null }
            : { fase: "listo", secretoManual: vinculacion.secretoManual, urlQr }
        );
      })
      .catch((causa: unknown) => {
        if (montada) setEstado({ fase: "error", causa });
      });
    return () => {
      montada = false;
    };
  }, [intento]);

  // Pide un secreto nuevo (único camino, además de montar la pantalla): «Reintentar» tras un
  // fallo y el 409 TOTP_NO_INICIADO.
  const reiniciar = useCallback(() => {
    solicitudRef.current = null;
    setEstado({ fase: "cargando" });
    setIntento((n) => n + 1);
  }, []);

  const { codigo, setCodigo, errorCodigo, aviso, enviando, manejarEnvio } = useFormularioCodigo({
    enviar: vincularTotp,
    mensajeCodigoIncorrecto: MENSAJE_CODIGO_INCORRECTO,
    alIngresar: (respuesta) => {
      // Se descarta el secreto antes de salir de la pantalla.
      setEstado({ fase: "cargando" });
      // Cuenta activa: las guardas llevan a la pantalla principal. `ruta_inicial` se ignora.
      avanzarEtapa(respuesta.etapa, respuesta.usuario);
    },
    alNoIniciado: reiniciar,
  });

  const listo = estado.fase === "listo";

  return (
    <DisposicionAcceso ancho={560}>
      <p className={estilos.paso}>Primer ingreso · Paso 2 de 2</p>
      <h1 ref={tituloRef} tabIndex={-1} className={estilos.titulo}>
        Vincule su app autenticadora
      </h1>

      {estado.fase === "error" ? (
        <div className={estilos.formulario}>
          <Alerta tipo="error" titulo={avisoDeError(estado.causa).titulo}>
            {avisoDeError(estado.causa).mensaje}
          </Alerta>
          <div className={estilos.acciones}>
            <Boton onClick={reiniciar} anchoCompleto>
              Reintentar
            </Boton>
            <Boton jerarquia="terciario" anchoCompleto onClick={cerrarSesion}>
              Cancelar
            </Boton>
          </div>
        </div>
      ) : (
        <>
          <div className={estilosVinculacion.qrEInstrucciones}>
            <div className={estilosVinculacion.marcoQr}>
              {estado.fase === "listo" ? (
                <img
                  src={estado.urlQr}
                  width={168}
                  height={168}
                  alt="Código QR para vincular su app autenticadora. Si no puede escanearlo, use la clave escrita que aparece al lado."
                  className={estilosVinculacion.qr}
                />
              ) : (
                <p className={estilosVinculacion.cargandoQr} role="status">
                  <IndicadorCarga className={estilosVinculacion.indicador} />
                  Cargando…
                </p>
              )}
            </div>
            <div className={estilosVinculacion.pasos}>
              <p className={estilosVinculacion.paso}>1. Instale en su celular una app autenticadora.</p>
              <p className={estilosVinculacion.paso}>
                2. En la app, agregue una cuenta y escanee este código.
              </p>
              <p className={estilosVinculacion.paso}>
                3. Escriba abajo el código de 6 dígitos que muestra la app.
              </p>
              {estado.fase === "listo" && (
                <p className={estilosVinculacion.clave}>
                  ¿No puede escanear? Escriba en la app esta clave: {estado.secretoManual}
                </p>
              )}
            </div>
          </div>

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
              ayuda="El código cambia cada 30 segundos."
              mensajeError={errorCodigo ?? undefined}
              value={codigo}
              onChange={setCodigo}
            />
            <div className={estilos.acciones}>
              <Boton
                type="submit"
                anchoCompleto
                cargando={enviando}
                etiquetaCargando="Verificando…"
                disabled={!listo}
              >
                Verificar y entrar
              </Boton>
              {/* No dibujado en Figma (pendiente de agregar): salida para quien no quiere seguir. */}
              <Boton jerarquia="terciario" anchoCompleto onClick={cerrarSesion}>
                Cancelar
              </Boton>
            </div>
          </form>
        </>
      )}
    </DisposicionAcceso>
  );
}
