// Catálogo de pantallas internas: ruta, título (también el de la pestaña) y roles que las ven.
// Los roles aquí son solo comodidad de interfaz; la autorización real la hace el backend.
// Las pantallas que todavía no se construyen usan PantallaPendiente, marcada para encontrarla
// con una búsqueda de «TEMPORAL».
import type { ReactNode } from "react";
import Dashboard from "../pages/Dashboard";
import PantallaPendiente from "../pages/PantallaPendiente";
import type { RolInterfaz } from "./menus";

export interface Pantalla {
  ruta: string;
  /** Un solo título, o uno por rol (el dashboard es W-15 para el doctor y W-19 para el administrador). */
  titulo: string | Record<RolInterfaz, string>;
  roles: RolInterfaz[];
  elemento: (titulo: string) => ReactNode;
}

const AMBOS: RolInterfaz[] = ["doctor", "administrador"];
const SOLO_DOCTOR: RolInterfaz[] = ["doctor"];
const SOLO_ADMINISTRADOR: RolInterfaz[] = ["administrador"];

export const pantallas: Pantalla[] = [
  {
    ruta: "/dashboard",
    titulo: { doctor: "Dashboard", administrador: "Dashboard técnico" },
    roles: AMBOS,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega (W-15 / W-19)
  },
  {
    ruta: "/nuevo-analisis",
    titulo: "Nuevo análisis",
    roles: SOLO_DOCTOR,
    // Pantalla vieja: se queda aquí hasta que se construya W-06.
    elemento: () => <Dashboard />,
  },
  {
    ruta: "/historial",
    titulo: "Historial",
    roles: SOLO_DOCTOR,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega (W-16c)
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
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega (Mi perfil)
  },
  {
    ruta: "/usuarios",
    titulo: "Usuarios",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega (W-09)
  },
  {
    ruta: "/cuentas-pendientes",
    titulo: "Cuentas pendientes",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega
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
];

export function buscarPantalla(ruta: string): Pantalla | undefined {
  return pantallas.find((pantalla) => pantalla.ruta === ruta);
}

/** Título de la pantalla para el rol dado; sin rol conocido usa el del doctor. */
export function tituloDePantalla(pantalla: Pantalla, rol: RolInterfaz | null): string {
  if (typeof pantalla.titulo === "string") return pantalla.titulo;
  return pantalla.titulo[rol ?? "doctor"];
}
