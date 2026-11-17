import {
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
} from "react-router";
import DisposicionInterna from "./disposicion/DisposicionInterna";
import { pantallas, tituloDePantalla } from "./navegacion/pantallas";
import type { Pantalla } from "./navegacion/pantallas";
import CambioContrasena from "./pages/CambioContrasena";
import InicioSesion from "./pages/InicioSesion";
import VerificarCodigo from "./pages/VerificarCodigo";
import VincularAplicacion from "./pages/VincularAplicacion";
import { ProveedorSesion } from "./sesion/ProveedorSesion";
import RutaEtapa from "./sesion/RutaEtapa";
import RutaPorRol from "./sesion/RutaPorRol";
import RutaProtegida from "./sesion/RutaProtegida";
import RutaPublica from "./sesion/RutaPublica";
import { useUsuarioActual } from "./sesion/UsuarioActual";

// Router en modo de datos (createBrowserRouter), sin loaders ni actions: las rutas y las guardas
// son las mismas que en el modo declarativo. El modo de datos hace falta para `useBlocker`
// (aviso de cambios sin guardar). ProveedorSesion va en la ruta raíz porque usa `useNavigate`.
//
// Al cerrar sesión, RutaProtegida redirige a /iniciar-sesion; el aviso de W-01f lo lleva
// `motivoCierre` en ProveedorSesion.

/** Pantalla interna con su título según el rol (solo se monta con el usuario ya cargado). */
function ElementoPantalla({ pantalla }: { pantalla: Pantalla }) {
  const { rol } = useUsuarioActual();
  return <>{pantalla.elemento(tituloDePantalla(pantalla, rol))}</>;
}

/** Ruta raíz: la sesión envuelve a todas las pantallas. */
function Raiz() {
  return (
    <ProveedorSesion>
      <Outlet />
    </ProveedorSesion>
  );
}

const enrutador = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Raiz />}>
      <Route
        path="/iniciar-sesion"
        element={
          <RutaPublica>
            <InicioSesion />
          </RutaPublica>
        }
      />
      <Route
        path="/cambiar-contrasena"
        element={
          <RutaEtapa etapa="CAMBIO_CONTRASENA">
            <CambioContrasena />
          </RutaEtapa>
        }
      />
      <Route
        path="/vincular-aplicacion"
        element={
          <RutaEtapa etapa="VINCULAR_TOTP">
            <VincularAplicacion />
          </RutaEtapa>
        }
      />
      <Route
        path="/verificar-codigo"
        element={
          <RutaEtapa etapa="PENDIENTE_2FA">
            <VerificarCodigo />
          </RutaEtapa>
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
    </Route>
  )
);

export default function App() {
  return <RouterProvider router={enrutador} />;
}
