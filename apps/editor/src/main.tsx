import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { App } from "./App";
import { editorRouteFromHash, type EditorRoute } from "./editorRoute";
import { ExploreApp } from "./explore/ExploreApp";
import { V2App } from "./v2/V2App";
import { getUiVersion } from "./v2/uiVersion";

function readRoute(): EditorRoute {
  return typeof location !== "undefined"
    ? editorRouteFromHash(location.hash)
    : "dialogue";
}

function Root() {
  const [route, setRoute] = useState<EditorRoute>(readRoute);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (route === "explore") {
    return <ExploreApp />;
  }
  return getUiVersion() === "v2" ? <V2App /> : <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
