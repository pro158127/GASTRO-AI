import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import Dashboard from "./pages/Dashboard";
import InicioSesion from "./pages/InicioSesion";
import { ProveedorSesion, useSesion } from "./sesion/ProveedorSesion";
import RutaProtegida from "./sesion/RutaProtegida";
import RutaPublica from "./sesion/RutaPublica";

// Mientras no exista la pantalla W-15, la ruta protegida muestra el Dashboard actual.
// Al cerrar sesión, RutaProtegida redirige a /iniciar-sesion; el aviso de W-01f lo lleva
// `motivoCierre` en ProveedorSesion.
function PanelPrivado() {
  const { cerrarSesion } = useSesion();
  return <Dashboard onLogout={cerrarSesion} />;
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
            path="/"
            element={
              <RutaProtegida>
                <PanelPrivado />
              </RutaProtegida>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ProveedorSesion>
    </BrowserRouter>
  );
}
