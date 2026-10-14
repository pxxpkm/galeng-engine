import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { App } from "./App";
import { ExploreApp } from "./explore/ExploreApp";
import { V2App } from "./v2/V2App";
import { getUiVersion } from "./v2/uiVersion";

function rootApp() {
  if (typeof location !== "undefined" && location.hash.replace(/^#/, "") === "explore") {
    return <ExploreApp />;
  }
  return getUiVersion() === "v2" ? <V2App /> : <App />;
}

createRoot(document.getElementById("root")!).render(<StrictMode>{rootApp()}</StrictMode>);
