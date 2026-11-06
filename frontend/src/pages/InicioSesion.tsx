// Pantalla W-01 · Inicio de sesión (con W-01b error, W-01c cargando y W-01f cierre de sesión).
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Alerta from "../components/Alerta";
import type { TipoAlerta } from "../components/Alerta";
import AvisoExperimental from "../components/AvisoExperimental";
import Boton from "../components/Boton";
import CampoContrasena from "../components/CampoContrasena";
import CampoTexto from "../components/CampoTexto";
import Logo from "../components/Logo";
import { ErrorApi, login } from "../services/api";
import { avisoDeError } from "../utils/avisosError";
import { useSesion } from "../sesion/ProveedorSesion";
import { isValidEmail } from "../utils/validators";
import estilos from "./InicioSesion.module.css";

interface Aviso {
  tipo: TipoAlerta;
  titulo: string;
  mensaje: string;
}

const AVISOS = {
  // W-01b. Mensaje genérico: nunca dice si falló el correo o la contraseña (ni si la cuenta está
  // inactiva o bloqueada). Se usa también cuando el correo o la contraseña están vacíos o mal
  // escritos (no se llama al servidor) y cuando el servidor rechaza los datos (422).
  credenciales: {
    tipo: "error",
    titulo: "No se pudo iniciar sesión",
    mensaje: "Verifique su correo y su contraseña e intente de nuevo.",
  },
  // W-01e. TEMPORAL_EXPIRADA.
  temporalVencida: {
    tipo: "advertencia",
    titulo: "Su contraseña temporal venció",
    mensaje:
      "Pasaron más de 72 horas desde que se generó. Pida una nueva al administrador de la plataforma.",
  },
  // W-01f.
  cierre: {
    tipo: "exito",
    titulo: "Cerró sesión correctamente",
    mensaje:
      "Para volver a entrar, inicie sesión. Si usa un equipo compartido, cierre también el navegador.",
  },
} satisfies Record<string, Aviso>;

function avisoDesdeError(error: unknown): Aviso {
  if (error instanceof ErrorApi) {
    if (error.codigo === "TEMPORAL_EXPIRADA") return AVISOS.temporalVencida;
    if (error.codigo === "CREDENCIALES_INVALIDAS" || error.codigo === "DATOS_INVALIDOS") {
      return AVISOS.credenciales;
    }
  }
  // Sin conexión (W-30), 5xx y cualquier otro fallo no previsto (W-31, con el código de referencia).
  return { tipo: "error", ...avisoDeError(error) };
}

export default function InicioSesion() {
  const { refrescarSesion, motivoCierre, consumirMotivoCierre } = useSesion();

  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(() =>
    motivoCierre === "cierre" ? AVISOS.cierre : null
  );
  // Evita dobles peticiones aunque el envío se dispare dos veces antes de repintar.
  const enviandoRef = useRef(false);

  useEffect(() => {
    document.title = "Iniciar sesión · Gastro-AI";
  }, []);

  // El aviso de cierre de sesión se muestra una sola vez; ya quedó copiado en `aviso`.
  useEffect(() => {
    consumirMotivoCierre();
  }, [consumirMotivoCierre]);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviandoRef.current) return;

    // La validación del cliente es solo ayuda; la autoridad es el servidor.
    if (!isValidEmail(correo.trim()) || contrasena.length === 0) {
      setAviso(AVISOS.credenciales);
      return;
    }

    enviandoRef.current = true;
    setEnviando(true);
    setAviso(null);
    try {
      await login(correo.trim(), contrasena);
      // La cookie ya quedó puesta. Se consulta la sesión para tener usuario y etapa; en cuanto
      // cambia el estado, RutaPublica lleva a la pantalla de la etapa que sigue.
      await refrescarSesion();
    } catch (error) {
      // Se conserva lo escrito en ambos campos.
      setAviso(avisoDesdeError(error));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  return (
    <main className={estilos.pagina}>
      <Logo />
      <div className={estilos.tarjeta}>
        <p className={estilos.descripcion}>
          Plataforma académica experimental de análisis endoscópico
        </p>
        <h1 className={estilos.titulo}>Iniciar sesión</h1>
        {/* method="post": si el JavaScript fallara, el correo no viajaría en la URL. */}
        <form className={estilos.formulario} method="post" onSubmit={manejarEnvio} noValidate>
          {aviso && (
            <Alerta tipo={aviso.tipo} titulo={aviso.titulo}>
              {aviso.mensaje}
            </Alerta>
          )}
          <CampoTexto
            etiqueta="Correo electrónico"
            name="correo"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
          />
          <CampoContrasena
            etiqueta="Contraseña"
            name="contrasena"
            autoComplete="current-password"
            value={contrasena}
            onChange={(evento) => setContrasena(evento.target.value)}
          />
          <Boton
            type="submit"
            anchoCompleto
            cargando={enviando}
            etiquetaCargando="Iniciando sesión…"
          >
            Iniciar sesión
          </Boton>
        </form>
        <p className={estilos.ayuda}>
          ¿Olvidó su contraseña? Solicite el restablecimiento al administrador de la plataforma.
        </p>
      </div>
      <AvisoExperimental />
    </main>
  );
}
