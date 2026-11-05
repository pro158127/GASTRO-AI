import { FormEvent, useEffect, useRef, useState } from "react";
import { crearAnalisis, obtenerAnalisis } from "../services/api";
import { subscribeAnalisis } from "../services/websocket";
import type { Analisis } from "../types";
import { isValidDocumento } from "../utils/validators";
import estilos from "./Dashboard.module.css";

// Pantalla vieja, anterior al sistema de diseño. Hoy hace de «Nuevo análisis» (/nuevo-analisis)
// hasta que se construya W-06. El cierre de sesión y el encabezado los da ahora DisposicionInterna.
export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [documento, setDocumento] = useState("");
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Selecciona una imagen para analizar.");
      return;
    }
    if (!isValidDocumento(documento)) {
      setError("El número de documento no es válido.");
      return;
    }
    setUploading(true);
    try {
      const created = await crearAnalisis(file, documento, "CC");
      setAnalisis(created);

      const unsubscribe = subscribeAnalisis(created.id, async (msg) => {
        if (msg.estado === "COMPLETADO" || msg.estado === "FALLIDO") {
          const full = await obtenerAnalisis(created.id);
          setAnalisis(full);
          unsubscribe();
        }
      });
      unsubscribeRef.current = unsubscribe;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la imagen.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={estilos.contenedor}>
      <h1>Nuevo análisis</h1>

      <form onSubmit={handleSubmit} className={estilos.tarjeta}>
        <label>
          Imagen clínica (JPG / PNG / DICOM)
          <input
            type="file"
            accept="image/*,.dcm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </label>
        <label>
          Número de documento
          <input
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            placeholder="Cédula del paciente"
            required
          />
        </label>
        {error && <p className={estilos.error}>{error}</p>}
        <button type="submit" disabled={uploading}>
          {uploading ? "Enviando..." : "Iniciar análisis"}
        </button>
      </form>

      {analisis && (
        <section className={estilos.tarjeta}>
          <h2>Resultado del análisis</h2>
          <p>
            <strong>ID:</strong> {analisis.id}
          </p>
          <p>
            <strong>Estado:</strong> {analisis.estado}
          </p>
          {analisis.estado === "PROCESANDO" && (
            <p className={estilos.apagado}>
              Procesando en segundo plano… la página se actualiza en tiempo real.
            </p>
          )}
          {analisis.estado === "COMPLETADO" && (
            <>
              <p>{analisis.explicacion}</p>
              {analisis.grad_cam_url && (
                <img
                  src={analisis.grad_cam_url}
                  alt="Mapa de calor Grad-CAM"
                  className={estilos.mapaCalor}
                />
              )}
              {analisis.resultado && (
                <pre>{JSON.stringify(analisis.resultado, null, 2)}</pre>
              )}
            </>
          )}
          {analisis.estado === "FALLIDO" && (
            <p className={estilos.error}>El análisis falló: {analisis.error}</p>
          )}
        </section>
      )}
    </div>
  );
}
