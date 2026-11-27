// Pantalla W-16 · Historial (Figma 81:7288 y 63:3389). Solo rol DOCTOR.
//
// Dos pestañas con endpoints distintos y criterios de privacidad opuestos:
//
// - «Mis análisis» (`GET /analisis`) **nunca** devuelve datos del paciente, así que sus
//   filtros pueden vivir en la query string y sobrevivir a recargar y a «atrás».
// - «Buscar por paciente» (`POST /pacientes/analisis/buscar`) gira alrededor de un número de
//   documento, que no puede tocar la URL. Ese documento vive en el estado de su componente y
//   en memoria de módulo para la vuelta del detalle; ver `busquedaPacienteEnMemoria.ts`.
//
// En la URL solo queda `?pestana=`, que no dice de quién es nada.
import { useId } from "react";
import { useSearchParams } from "react-router";
import EncabezadoPagina from "../components/EncabezadoPagina";
import Pestanas, { idDePanel, idDePestana } from "../components/Pestanas";
import type { Pestana } from "../components/Pestanas";
import HistorialMisAnalisis from "./HistorialMisAnalisis";
import HistorialPaciente from "./HistorialPaciente";
import estilos from "./Historial.module.css";

const MIS_ANALISIS = "mis-analisis";
const PACIENTE = "paciente";

const PESTANAS: readonly Pestana[] = [
  { id: MIS_ANALISIS, etiqueta: "Mis análisis" },
  { id: PACIENTE, etiqueta: "Buscar por paciente" },
];

export default function Historial({ titulo }: { titulo: string }) {
  const idBase = useId();
  const [parametros, setParametros] = useSearchParams();
  const activa = parametros.get("pestana") === PACIENTE ? PACIENTE : MIS_ANALISIS;

  function cambiarPestana(id: string) {
    const nuevos = new URLSearchParams(parametros);
    if (id === MIS_ANALISIS) nuevos.delete("pestana");
    else nuevos.set("pestana", id);
    // Los filtros de la otra pestaña no tienen sentido aquí.
    for (const clave of ["pagina", "origen", "codigo", "desde", "hasta", "orden"]) {
      nuevos.delete(clave);
    }
    setParametros(nuevos, { replace: true });
  }

  return (
    <>
      <EncabezadoPagina
        titulo={titulo}
        descripcion="Consulte todos sus análisis o busque los de un paciente por su documento de identidad. El número solo se usa para buscar y no se guarda."
      />

      <Pestanas
        etiqueta="Secciones del historial"
        pestanas={PESTANAS}
        activa={activa}
        onCambio={cambiarPestana}
        idBase={idBase}
      />

      {/* Cada panel se monta solo cuando su pestaña está activa: así la de paciente no
          mantiene vivo el documento mientras se mira la otra. */}
      <div
        role="tabpanel"
        id={idDePanel(idBase)}
        aria-labelledby={idDePestana(idBase, activa)}
        className={estilos.panel}
      >
        {activa === MIS_ANALISIS ? <HistorialMisAnalisis /> : <HistorialPaciente />}
      </div>
    </>
  );
}
