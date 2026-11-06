import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App";
import "./estilos/variables.css";
import "./index.css";
import { borrarTokenAnterior } from "./sesion/limpiezaTokenAnterior";

borrarTokenAnterior();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
