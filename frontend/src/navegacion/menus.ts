// Menús de la barra lateral por rol, tal como están en Figma (W-15 doctor, W-19 administrador).
// Ocultar ítems por rol es solo interfaz: la autorización real la hace el backend en cada
// endpoint. Esto nunca debe tratarse como control de acceso.
import type { ComponentType } from "react";
import IconoAjustes from "../components/iconos/IconoAjustes";
import IconoBitacora from "../components/iconos/IconoBitacora";
import IconoEstado from "../components/iconos/IconoEstado";
import IconoHistorial from "../components/iconos/IconoHistorial";
import IconoInicio from "../components/iconos/IconoInicio";
import IconoMetricas from "../components/iconos/IconoMetricas";
import IconoNuevoAnalisis from "../components/iconos/IconoNuevoAnalisis";
import IconoUsuario from "../components/iconos/IconoUsuario";
import IconoUsuarios from "../components/iconos/IconoUsuarios";
import type { PropiedadesIcono } from "../components/iconos/PropiedadesIcono";
import type { RolUsuario } from "../types";

export type RolInterfaz = "doctor" | "administrador";

export interface ItemMenu {
  id: string;
  etiqueta: string;
  ruta: string;
  Icono: ComponentType<PropiedadesIcono>;
  /** Muestra el contador de casos recibidos sin revisar (se oculta cuando vale 0). */
  conContadorCasosRecibidos?: boolean;
  /**
   * El ítem queda activo también en sus subrutas (Usuarios en /usuarios/nuevo y /usuarios/:id).
   * Por defecto solo en su ruta exacta.
   */
  incluyeSubrutas?: boolean;
}

export const menusPorRol: Record<RolInterfaz, ItemMenu[]> = {
  doctor: [
    { id: "dashboard", etiqueta: "Dashboard", ruta: "/dashboard", Icono: IconoInicio },
    { id: "nuevo-analisis", etiqueta: "Nuevo análisis", ruta: "/nuevo-analisis", Icono: IconoNuevoAnalisis },
    { id: "historial", etiqueta: "Historial", ruta: "/historial", Icono: IconoHistorial },
    {
      id: "casos-recibidos",
      etiqueta: "Casos recibidos",
      ruta: "/casos-recibidos",
      Icono: IconoUsuarios,
      conContadorCasosRecibidos: true,
    },
  ],
  administrador: [
    { id: "dashboard", etiqueta: "Dashboard", ruta: "/dashboard", Icono: IconoInicio },
    { id: "usuarios", etiqueta: "Usuarios", ruta: "/usuarios", Icono: IconoUsuarios, incluyeSubrutas: true },
    { id: "cuentas-pendientes", etiqueta: "Cuentas pendientes", ruta: "/cuentas-pendientes", Icono: IconoUsuario },
    { id: "bitacora", etiqueta: "Bitácora", ruta: "/bitacora", Icono: IconoBitacora },
    { id: "estado-operativo", etiqueta: "Estado operativo", ruta: "/estado-operativo", Icono: IconoEstado },
    { id: "metricas-del-modelo", etiqueta: "Métricas del modelo", ruta: "/metricas-del-modelo", Icono: IconoMetricas },
    // Figma usa el mismo ícono que Bitácora.
    { id: "logs-tecnicos", etiqueta: "Logs técnicos", ruta: "/logs-tecnicos", Icono: IconoBitacora },
    { id: "parametros", etiqueta: "Parámetros", ruta: "/parametros", Icono: IconoAjustes },
  ],
};

/** Rótulos neutros de rol (Figma mezcla «Administrador» y «Administradora»). */
export const etiquetaRol: Record<RolInterfaz, string> = {
  doctor: "Doctor",
  administrador: "Administrador",
};

/** Del rol del backend (`DOCTOR` o `ADMINISTRADOR`) al rol de la interfaz. */
export function rolDeInterfaz(rol: RolUsuario): RolInterfaz {
  return rol === "DOCTOR" ? "doctor" : "administrador";
}
