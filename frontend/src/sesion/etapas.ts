// Ruta de cada etapa del inicio de sesión. W-02, W-03 y W-04 todavía no están construidas.
import type { EtapaSesion } from "../types";

export const rutaDeEtapa: Record<EtapaSesion, string> = {
  CAMBIO_CONTRASENA: "/cambiar-contrasena", // W-02
  VINCULAR_TOTP: "/vincular-aplicacion", // W-03
  PENDIENTE_2FA: "/verificar-codigo", // W-04
  ACTIVA: "/",
};
