import { FormEvent, useEffect, useRef, useState } from "react";
import { clearToken, crearAnalisis, obtenerAnalisis } from "../services/api";
import { subscribeAnalisis } from "../services/websocket";
import type { Analisis } from "../types";
import { isValidDocumento } from "../utils/validators";

interface Props {
  onLogout: () => void;
}

export default function Dashboard({ onLogout }: Props) {
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

  function handleLogout() {
    clearToken();
    onLogout();
  }

  return (
    <div className="container">
      <header>
        <h1>Gastro-AI</h1>
        <button onClick={handleLogout} className="secondary">
          Cerrar sesión
        </button>
      </header>

      <form onSubmit={handleSubmit} className="card">
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
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={uploading}>
          {uploading ? "Enviando..." : "Iniciar análisis"}
        </button>
      </form>

      {analisis && (
        <section className="card">
          <h2>Resultado del análisis</h2>
          <p>
            <strong>ID:</strong> {analisis.id}
          </p>
          <p>
            <strong>Estado:</strong> {analisis.estado}
          </p>
          {analisis.estado === "PROCESANDO" && (
            <p className="muted">
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
                  className="gradcam"
                />
              )}
              {analisis.resultado && (
                <pre>{JSON.stringify(analisis.resultado, null, 2)}</pre>
              )}
            </>
          )}
          {analisis.estado === "FALLIDO" && (
            <p className="error">El análisis falló: {analisis.error}</p>
          )}
        </section>
      )}
    </div>
  );
}
