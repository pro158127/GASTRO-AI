// Lógica común de los formularios de código del segundo factor (W-03 y W-04): validación mínima,
// envío único, errores y foco. Los textos los pone cada pantalla (salen de Figma).
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { LONGITUD_CODIGO } from "../components/CampoCodigo";
import { ErrorApi } from "../services/api";
import { CodigoErrorApi } from "../services/codigosError";
import type { RespuestaIngreso } from "../types";
import { AVISO_DEMASIADOS_INTENTOS, avisoDeError, esDemasiadosIntentos } from "../utils/avisosError";
import type { AvisoError } from "../utils/avisosError";

export const ID_CAMPO_CODIGO = "codigo-segundo-factor";

export type AvisoFormulario = AvisoError & { tipo: "advertencia" | "error" };

interface OpcionesFormularioCodigo {
  /** Llama al endpoint con el código ya normalizado (6 dígitos). */
  enviar: (codigo: string) => Promise<RespuestaIngreso>;
  /** Texto del error del campo para un código incompleto o rechazado (W-03b / W-04b). */
  mensajeCodigoIncorrecto: string;
  alIngresar: (respuesta: RespuestaIngreso) => void;
  /** 409 TOTP_NO_INICIADO: no hay secreto en el servidor (solo W-03). */
  alNoIniciado?: () => void;
}

export function useFormularioCodigo({
  enviar,
  mensajeCodigoIncorrecto,
  alIngresar,
  alNoIniciado,
}: OpcionesFormularioCodigo) {
  const [codigo, setCodigo] = useState("");
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoFormulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Tras un envío fallido el foco vuelve al campo (WCAG 3.3.1); su error se lee por aria-describedby.
  const [pedirFoco, setPedirFoco] = useState(0);
  const enviandoRef = useRef(false);

  useEffect(() => {
    if (pedirFoco > 0) document.getElementById(ID_CAMPO_CODIGO)?.focus();
  }, [pedirFoco]);

  function marcarCodigoIncorrecto() {
    setErrorCodigo(mensajeCodigoIncorrecto);
    setPedirFoco((n) => n + 1);
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviandoRef.current) return;
    setAviso(null);
    setErrorCodigo(null);

    // Un código incompleto no se manda: cada fallo en el servidor cuenta para el bloqueo (RF-U12).
    if (codigo.length !== LONGITUD_CODIGO) {
      marcarCodigoIncorrecto();
      return;
    }

    enviandoRef.current = true;
    setEnviando(true);
    try {
      alIngresar(await enviar(codigo));
    } catch (error) {
      // Se conserva lo escrito.
      manejarError(error);
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  function manejarError(error: unknown) {
    if (error instanceof ErrorApi) {
      // Sesión vencida o etapa equivocada: los manejadores globales ya redirigen.
      if (
        error.codigo === CodigoErrorApi.SESION_EXPIRADA ||
        error.codigo === CodigoErrorApi.ETAPA_INVALIDA
      ) {
        return;
      }
      if (error.codigo === CodigoErrorApi.TOTP_CODIGO_INVALIDO) {
        marcarCodigoIncorrecto();
        return;
      }
      if (error.codigo === CodigoErrorApi.TOTP_NO_INICIADO && alNoIniciado) {
        alNoIniciado();
        return;
      }
    }
    if (esDemasiadosIntentos(error)) {
      setAviso({ tipo: "advertencia", ...AVISO_DEMASIADOS_INTENTOS });
      return;
    }
    // Sin conexión (W-30), 5xx y cualquier otro fallo no previsto (W-31).
    setAviso({ tipo: "error", ...avisoDeError(error) });
  }

  return { codigo, setCodigo, errorCodigo, aviso, enviando, manejarEnvio };
}
