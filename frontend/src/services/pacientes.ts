// Consulta del historial del paciente (W-06h), ../ARCHITECTURE.md § 3.5.
//
// Sirve para saber si hay que pedir el documento dos veces: solo se confirma cuando el paciente
// no tiene análisis **con este doctor** (RF-D01 CA 12). La respuesta no trae ningún dato del
// paciente, y el conteo es el de los casos de quien pregunta: no revela si tiene análisis con
// otro doctor (RF-H01 CA 5).
//
// El documento va en el cuerpo de un POST, nunca en la URL. nginx limita esta ruta a 30
// peticiones por minuto y por IP para que no se use para adivinar documentos: la pantalla
// consulta al salir del campo, no en cada tecla, y recuerda el último par consultado.
import type { HistorialPaciente } from "../types";
import { solicitar } from "./api";

/** `POST /pacientes/consulta`. 422 DOCUMENTO_INVALIDO si el número está mal escrito (W-06e). */
export function consultarPaciente(
  tipoDocumento: string,
  numeroDocumento: string
): Promise<HistorialPaciente> {
  // Sin `global: false`: un 401 aquí es la sesión vencida de verdad, y tiene que llevar al
  // inicio de sesión como en cualquier otra pantalla. El 422 del documento lo atiende el
  // formulario, que descarta antes los errores globales con `esErrorGlobal`.
  return solicitar<HistorialPaciente>("/pacientes/consulta", {
    metodo: "POST",
    cuerpo: { tipo_documento: tipoDocumento, numero_documento: numeroDocumento },
  });
}
