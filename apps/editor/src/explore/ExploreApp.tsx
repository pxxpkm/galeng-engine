import { useEffect, useState } from "react";
import { ExploreWorkspace } from "./ExploreWorkspace";
import { blankExploreDoc } from "./fixture";
import { createHttpPersistApi, loadExploreDoc, type ExplorePersistApi } from "./persist";
import { loadSceneCatalog } from "./sceneCatalog";
import type { ExploreDoc, SceneCatalogEntry } from "./types";

/** Standalone M2 Explore shell. Open with #explore hash. */
export function ExploreApp() {
  const [persist] = useState<ExplorePersistApi>(() => createHttpPersistApi());
  const [doc, setDoc] = useState<ExploreDoc | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [sceneCatalog, setSceneCatalog] = useState<SceneCatalogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loaded, catalog] = await Promise.all([
          loadExploreDoc(persist, "study"),
          loadSceneCatalog(persist),
        ]);
        if (cancelled) return;
        setDoc(loaded);
        // Always include current explore scene even if list was empty.
        const byId = new Map(catalog.map((e) => [e.id, e]));
        if (!byId.has(loaded.scene.id)) {
          byId.set(loaded.scene.id, {
            id: loaded.scene.id,
            kind: "explore",
            title: loaded.scene.title,
          });
        }
        if (!byId.has(loaded.project.startScene)) {
          byId.set(loaded.project.startScene, {
            id: loaded.project.startScene,
            kind: "explore",
          });
        }
        setSceneCatalog([...byId.values()]);
      } catch (e) {
        if (cancelled) return;
        setBootError(e instanceof Error ? e.message : String(e));
        setDoc(blankExploreDoc("study"));
        setSceneCatalog([{ id: "study", kind: "explore" }]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persist]);

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
      {bootError ? (
        <p style={{ fontSize: 13, opacity: 0.75 }}>啟動載入失敗，已用空白稿。（{bootError}）</p>
      ) : null}
      <ExploreWorkspace initial={doc} sceneCatalog={sceneCatalog} persist={persist} />
    </div>
  );
}
