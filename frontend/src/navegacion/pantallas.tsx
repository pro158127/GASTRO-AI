// Catálogo de pantallas internas: ruta, título (también el de la pestaña) y roles que las ven.
// Los roles aquí son solo comodidad de interfaz; la autorización real la hace el backend.
// Las pantallas que todavía no se construyen usan PantallaPendiente, marcada para encontrarla
// con una búsqueda de «TEMPORAL».
import type { ReactNode } from "react";
import { matchPath } from "react-router";
import MiPerfil from "../pages/MiPerfil";
import PantallaPendiente from "../pages/PantallaPendiente";
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
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega (W-06)
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
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega (W-10)
  },
  {
    ruta: "/usuarios/:id",
    titulo: "Detalle de cuenta",
    roles: SOLO_ADMINISTRADOR,
    elemento: (titulo) => <PantallaPendiente titulo={titulo} />, // TEMPORAL: reemplazar antes de la entrega (W-11)
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
