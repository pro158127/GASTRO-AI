import { FormEvent, useState } from "react";
import { login, setToken } from "../services/api";
import { isValidEmail } from "../utils/validators";

interface Props {
  onLoggedIn: () => void;
}

export default function Login({ onLoggedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError("Correo electrónico inválido.");
      return;
    }
    setLoading(true);
    try {
      const res = await login(email, password);
      setToken(res.access_token);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <h1>Gastro-AI</h1>
      <p className="muted">Análisis asistido de imágenes clínicas</p>
      <label>
        Correo electrónico
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label>
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}
