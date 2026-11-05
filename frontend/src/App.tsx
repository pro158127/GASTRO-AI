import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import DisposicionInterna from "./disposicion/DisposicionInterna";
import { pantallas, tituloDePantalla } from "./navegacion/pantallas";
import type { Pantalla } from "./navegacion/pantallas";
import InicioSesion from "./pages/InicioSesion";
import { ProveedorSesion } from "./sesion/ProveedorSesion";
import RutaPorRol from "./sesion/RutaPorRol";
import RutaProtegida from "./sesion/RutaProtegida";
import RutaPublica from "./sesion/RutaPublica";
import { useUsuarioActual } from "./sesion/UsuarioActual";

// Al cerrar sesión, RutaProtegida redirige a /iniciar-sesion; el aviso de W-01f lo lleva
// `motivoCierre` en ProveedorSesion.

/** Pantalla interna con su título según el rol (solo se monta con el usuario ya cargado). */
function ElementoPantalla({ pantalla }: { pantalla: Pantalla }) {
  const { rol } = useUsuarioActual();
  return <>{pantalla.elemento(tituloDePantalla(pantalla, rol))}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ProveedorSesion>
        <Routes>
          <Route
            path="/iniciar-sesion"
            element={
              <RutaPublica>
                <InicioSesion />
              </RutaPublica>
            }
          />
          <Route
            element={
              <RutaProtegida>
                <DisposicionInterna />
              </RutaProtegida>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            {pantallas.map((pantalla) => (
              <Route
                key={pantalla.ruta}
                path={pantalla.ruta}
                element={
                  <RutaPorRol roles={pantalla.roles}>
                    <ElementoPantalla pantalla={pantalla} />
                  </RutaPorRol>
                }
              />
            ))}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProveedorSesion>
    </BrowserRouter>
  );
}
