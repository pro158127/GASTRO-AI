/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Rol de los datos simulados del usuario actual: "doctor" (por defecto) o "admin". */
  readonly VITE_ROL_SIMULADO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
