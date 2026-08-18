import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { App } from "./App";
import { V2App } from "./v2/V2App";
import { getUiVersion } from "./v2/uiVersion";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{getUiVersion() === "v2" ? <V2App /> : <App />}</StrictMode>,
);
