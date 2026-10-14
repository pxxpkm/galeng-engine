import { useEffect, useState } from "react";
import { ExploreWorkspace } from "./ExploreWorkspace";
import { blankExploreDoc } from "./fixture";
import { createHttpPersistApi, loadExploreDoc, type ExplorePersistApi } from "./persist";
import type { ExploreDoc } from "./types";

/** Standalone M2 Explore shell. Open with #explore hash. */
export function ExploreApp() {
  const [persist] = useState<ExplorePersistApi>(() => createHttpPersistApi());
  const [doc, setDoc] = useState<ExploreDoc | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [known, setKnown] = useState<Set<string>>(new Set(["study"]));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadExploreDoc(persist, "study");
        if (cancelled) return;
        setDoc(loaded);
        setKnown(new Set([loaded.scene.id, loaded.project.startScene]));
      } catch (e) {
        if (cancelled) return;
        setBootError(e instanceof Error ? e.message : String(e));
        setDoc(blankExploreDoc("study"));
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
      <ExploreWorkspace initial={doc} knownSceneIds={known} persist={persist} />
    </div>
  );
}
