import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const destinoProxyApi = env.DESTINO_PROXY_API || "http://api:8000";
  const destinoProxyWs = destinoProxyApi.replace(/^http/, "ws");

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        "/api": { target: destinoProxyApi, changeOrigin: true },
        "/ws": { target: destinoProxyWs, ws: true },
      },
    },
  };
});
