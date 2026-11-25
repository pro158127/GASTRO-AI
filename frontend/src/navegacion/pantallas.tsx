// Catálogo de pantallas internas: ruta, título (también el de la pestaña) y roles que las ven.
// Los roles aquí son solo comodidad de interfaz; la autorización real la hace el backend.
// Las pantallas que todavía no se construyen usan PantallaPendiente, marcada para encontrarla
// con una búsqueda de «TEMPORAL».
import type { ReactNode } from "react";
import { matchPath } from "react-router";
import { useUsuarioActual } from "../sesion/UsuarioActual";
import CrearUsuario from "../pages/CrearUsuario";
import Dashboard from "../pages/Dashboard";
import CuentasPendientes from "../pages/CuentasPendientes";
import DetalleCuenta from "../pages/DetalleCuenta";
import Historial from "../pages/Historial";
import MiPerfil from "../pages/MiPerfil";
import NuevoAnalisis from "../pages/NuevoAnalisis";
import PantallaPendiente from "../pages/PantallaPendiente";
import ProgresoAnalisis from "../pages/ProgresoAnalisis";
import ReasignarCasos from "../pages/ReasignarCasos";
import ResultadoAnalisis from "../pages/ResultadoAnalisis";
import SinPermisos from "../pages/SinPermisos";
import Usuarios from "../pages/Usuarios";
import type { RolInterfaz } from "./menus";

export interface Pantalla {
  /** Patrón de react-router; puede tener parámetros (`/usuarios/:id`). */
  ruta: string;
  /** Un solo título, o uno por rol (el dashboard es W-15 para el doctor y W-19 para el administrador). */
  titulo: string | Record<RolInterfaz, string>;
  roles: RolInterfaz[];
  elemento: (titulo: string) => ReactNode;
}

const AMBOS: RolInterfaz[] = ["doctor", "administrador"];
const SOLO_DOCTOR: RolInterfaz[] = ["doctor"];
const SOLO_ADMINISTRADOR: RolInterfaz[] = ["administrador"];

/**
 * `/dashboard` es una ruta con dos pantallas distintas: W-15 para el doctor y W-19 para el
 * administrador. El doctor ya tiene la suya; la del administrador sigue pendiente, así que el
 * reparto se hace aquí y no duplicando la ruta. La autorización real la hace el backend: cada
 * dashboard es un endpoint distinto y con su rol.
 */
function DashboardPorRol({ titulo }: { titulo: string }) {
  const { rol } = useUsuarioActual();
  if (rol === "doctor") return <Dashboard titulo={titulo} />;
  // TEMPORAL: reemplazar antes de la entrega (W-19)
  return <PantallaPendiente titulo={titulo} />;
}

export const pantallas: Pantalla[] = [
  {
    ruta: "/dashboard",
    titulo: { doctor: "Dashboard", administrador: "Dashboard técnico" },
    roles: AMBOS,
    elemento: (titulo) => <DashboardPorRol titulo={titulo} />, // W-15 (doctor) / W-19 (pendiente)
  },
  {
    ruta: "/nuevo-analisis",
    titulo: "Nuevo análisis",
    roles: SOLO_DOCTOR,
    elemento: (titulo) => <NuevoAnalisis titulo={titulo} />, // W-06
  },
  {
    // Progreso del análisis recién solicitado. Va bajo `/nuevo-analisis` para que el ítem del
    // menú siga marcado (`incluyeSubrutas`) y el título de la pestaña no cambie a mitad del
    // flujo. El identificador del análisis sí puede ir en la URL; el documento del paciente no.
    ruta: "/nuevo-analisis/:idAnalisis",
    titulo: "Nuevo análisis",
    roles: SOLO_DOCTOR,
    elemento: (titulo) => <ProgresoAnalisis titulo={titulo} />, // W-07
  },
  {
    // Destino de un análisis completado. No tiene ítem de menú: se llega desde W-07.
    ruta: "/analisis/:idAnalisis",
    titulo: "Resultado del análisis",
    roles: SOLO_DOCTOR,
    elemento: (titulo) => <ResultadoAnalisis titulo={titulo} />, // W-08, W-08b
  },
  {
    ruta: "/historial",
    titulo: "Historial",
    roles: SOLO_DOCTOR,
    elemento: (titulo) => <Historial titulo={titulo} />, // W-16, W-16b a W-16g
  },
  {
    ruta: "/casos-recibidos",
    titulo: "Casos recibidos",
    roles: SOLO_DOCTOR,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega (W-27c)
  },
  {
    ruta: "/perfil",
    titulo: "Mi perfil",
    roles: AMBOS,
    elemento: (titulo) => <MiPerfil titulo={titulo} />, // W-18
  },
  {
    ruta: "/usuarios",
    titulo: "Usuarios",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <Usuarios titulo={titulo} />, // W-09
  },
  // Subrutas de Usuarios: mismos roles que /usuarios (SOLO_ADMINISTRADOR). App.tsx envuelve
  // cada pantalla de esta lista en <RutaPorRol roles={pantalla.roles}>, así que un doctor que
  // escriba estas rutas a mano vuelve a /dashboard (y el backend responde 403 en la API).
  {
    ruta: "/usuarios/nuevo",
    titulo: "Crear usuario",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <CrearUsuario titulo={titulo} />, // W-10
  },
  {
    ruta: "/usuarios/:id",
    titulo: "Detalle de cuenta",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <DetalleCuenta titulo={titulo} />, // W-11
  },
  {
    // No tiene ítem de menú: se entra desde W-11 (D-02) o escribiendo la ruta. `matchPath` exige
    // que la ruta coincida entera, así que no se confunde con `/usuarios/:id`.
    ruta: "/usuarios/:id/reasignar-casos",
    titulo: "Reasignar casos activos",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <ReasignarCasos titulo={titulo} />, // W-25
  },
  {
    ruta: "/cuentas-pendientes",
    titulo: "Cuentas pendientes",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <CuentasPendientes titulo={titulo} />, // W-20
  },
  {
    ruta: "/bitacora",
    titulo: "Bitácora",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega
  },
  {
    ruta: "/estado-operativo",
    titulo: "Estado operativo",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega
  },
  {
    ruta: "/metricas-del-modelo",
    titulo: "Métricas del modelo",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega
  },
  {
    ruta: "/logs-tecnicos",
    titulo: "Logs técnicos",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega
  },
  {
    ruta: "/parametros",
    titulo: "Parámetros",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega
  },
  {
    ruta: "/sin-permisos",
    titulo: "Acceso no permitido",
    roles: AMBOS,
    elemento: () => <SinPermisos />, // W-28
  },
];

/**
 * Pantalla de una ruta concreta (`/usuarios/3f2a…` → `/usuarios/:id`). Primero la ruta exacta,
 * para que `/usuarios/nuevo` no se confunda con `/usuarios/:id`.
 */
export function buscarPantalla(ruta: string): Pantalla | undefined {
  return (
    pantallas.find((pantalla) => pantalla.ruta === ruta) ??
    pantallas.find((pantalla) => matchPath(pantalla.ruta, ruta) !== null)
  );
}

/** Título de la pantalla para el rol dado. */
export function tituloDePantalla(pantalla: Pantalla, rol: RolInterfaz): string {
  if (typeof pantalla.titulo === "string") return pantalla.titulo;
  return pantalla.titulo[rol];
}
