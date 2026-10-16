import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { App } from "./App";
import { editorRouteFromHash, type EditorRoute } from "./editorRoute";
import { ExploreApp } from "./explore/ExploreApp";
import { ensureShellCleanForLeave } from "./shellGate";
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
    let committedHash = typeof location !== "undefined" ? location.hash : "";
    let committedRoute = readRoute();
    let gating = false;

    const onHash = () => {
      void (async () => {
        const nextRoute = readRoute();
        // Same shell (e.g. #dialogue → #dialogue?scripts=1): keep mounted editor.
        if (nextRoute === committedRoute) {
          committedHash = location.hash;
          return;
        }
        if (gating) return;
        gating = true;
        const ok = await ensureShellCleanForLeave();
        gating = false;
        if (!ok) {
          // replaceState does not re-fire hashchange — restore previous shell URL.
          const revert = committedHash || "#";
          history.replaceState(null, "", `${location.pathname}${location.search}${revert}`);
          return;
        }
        committedRoute = nextRoute;
        committedHash = location.hash;
        setRoute(nextRoute);
      })();
    };

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
