import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import AppRouter from "./AppRouter";
// @ts-ignore
import "./index.css";

export const PORT = `${(window as any).PORT}`;

createRoot(document.getElementById("root")!).render(
  <HashRouter>
    <AppRouter />
  </HashRouter>,
);
