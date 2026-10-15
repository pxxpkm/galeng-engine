import { useEffect, useState } from "react";
import { ExploreWorkspace } from "./ExploreWorkspace";
import { bootExplore } from "./exploreBoot";
import { createHttpPersistApi, type ExplorePersistApi } from "./persist";
import type { ExploreDoc, SceneCatalogEntry } from "./types";

/** Standalone M2 Explore shell. Open with #explore hash. */
export function ExploreApp() {
  const [persist] = useState<ExplorePersistApi>(() => createHttpPersistApi());
  const [doc, setDoc] = useState<ExploreDoc | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [sceneCatalog, setSceneCatalog] = useState<SceneCatalogEntry[]>([]);
  const [bootGen, setBootGen] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await bootExplore(persist);
      if (cancelled) return;
      if (result.ok) {
        setDoc(result.doc);
        setSceneCatalog(result.sceneCatalog);
        setBootError(null);
      } else {
        // Leave doc null so the workspace (and its save path) never mounts.
        setDoc(null);
        setSceneCatalog([]);
        setBootError(result.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persist, bootGen]);

  const retryBoot = () => {
    setDoc(null);
    setBootError(null);
    setBootGen((n) => n + 1);
  };

  if (bootError) {
    return (
      <div
        data-testid="explore-boot-error"
        style={{ padding: 12, color: "#e8e8e8", background: "#12141a", minHeight: "100vh" }}
      >
        <h2 style={{ marginTop: 0 }}>plane-engine · Explore 編輯器</h2>
        <p>載入失敗。（{bootError}）</p>
        <button type="button" data-testid="explore-boot-retry" onClick={retryBoot}>
          重試
        </button>
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={{ padding: 12, color: "#e8e8e8", background: "#12141a", minHeight: "100vh" }}>
        載入 Explore…
      </div>
    );
  }

  return (
    <div style={{ padding: 12, color: "#e8e8e8", background: "#12141a", minHeight: "100vh" }}>
      <h2 style={{ marginTop: 0 }}>plane-engine · Explore 編輯器</h2>
      <ExploreWorkspace initial={doc} sceneCatalog={sceneCatalog} persist={persist} />
    </div>
  );
}
