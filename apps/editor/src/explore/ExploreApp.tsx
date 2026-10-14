import { ExploreWorkspace } from "./ExploreWorkspace";
import { blankExploreDoc } from "./fixture";

/** Standalone M2 Explore shell. Open with #explore hash. */
export function ExploreApp() {
  return (
    <div style={{ padding: 12, color: "#e8e8e8", background: "#12141a", minHeight: "100vh" }}>
      <h2 style={{ marginTop: 0 }}>plane-engine · Explore 編輯器（M2）</h2>
      <p style={{ fontSize: 13, opacity: 0.75 }}>
        Command bus ＋ Undo／畫布／Verb×熱區矩陣／資料庫 stub／Problems。Docking 未落地。
      </p>
      <ExploreWorkspace initial={blankExploreDoc("study")} knownSceneIds={new Set(["study"])} />
    </div>
  );
}
