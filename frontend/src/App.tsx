import { useState } from "react";
import { getToken } from "./services/api";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean>(() => Boolean(getToken()));

  if (!loggedIn) {
    return <Login onLoggedIn={() => setLoggedIn(true)} />;
  }
  return <Dashboard onLogout={() => setLoggedIn(false)} />;
}
