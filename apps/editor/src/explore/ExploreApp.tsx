import { useEffect, useRef, useState } from "react";
import { exploreRouteParams, navigateToDialogueEditor } from "../editorRoute";
import { exploreDocForNewRoom } from "../sceneOpen";
import { ExploreWorkspace } from "./ExploreWorkspace";
import { editorT } from "./ExploreSettings";
import { bootExplore } from "./exploreBoot";
import { createHttpPersistApi, saveExploreDoc, type ExplorePersistApi } from "./persist";
import { exploreNewSceneIdError, parseNewExploreSceneId } from "./sceneId";
import type { ExploreDoc, SceneCatalogEntry } from "./types";

const shellStyle = {
  padding: 12,
  color: "#e8e8e8",
  background: "#12141a",
  minHeight: "100vh",
} as const;

function firstFreeRoomId(ids: readonly string[]): string {
  const taken = new Set(ids);
  if (!taken.has("room")) return "room";
  for (let n = 2; n < 10000; n += 1) {
    const id = `room_${n}`;
    if (!taken.has(id)) return id;
  }
  return "room_new";
}

function ExploreEmptyState({
  persist,
  projectRaw,
  sceneCatalog,
  onCreated,
}: {
  persist: ExplorePersistApi;
  projectRaw: unknown;
  sceneCatalog: SceneCatalogEntry[];
  onCreated: (doc: ExploreDoc) => void;
}) {
  const t = editorT();
  const mounted = useRef(true);
  const [idDraft, setIdDraft] = useState(() =>
    firstFreeRoomId(sceneCatalog.map((entry) => entry.id)),
  );
  const [titleDraft, setTitleDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function createRoom() {
    if (busy) return;
    const existing = sceneCatalog.map((entry) => entry.id);
    const idError = exploreNewSceneIdError(idDraft, existing);
    if (idError) {
      setError(idError);
      return;
    }
    const id = parseNewExploreSceneId(idDraft, existing);
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      // Same path as the dialogue shell: keep the real project, including startScene.
      const draft = exploreDocForNewRoom(projectRaw, id, titleDraft);
      const saved = await saveExploreDoc(persist, draft);
      if (!mounted.current) return;
      onCreated({
        ...draft,
        project: saved.project,
        scene: saved.scene,
        _rawProject: saved._rawProject,
        _rawScene: saved._rawScene,
      });
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div data-testid="explore-boot-empty" style={shellStyle}>
      <h2 style={{ marginTop: 0 }}>plane-engine · Explore 編輯器</h2>
      <p>{t("editor.exploreEmpty")}</p>
      <label style={{ display: "block", marginTop: 12 }}>
        {t("editor.sceneId")}
        <input
          data-testid="explore-empty-id"
          type="text"
          value={idDraft}
          onChange={(event) => {
            setIdDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void createRoom();
            }
          }}
          style={{ display: "block", marginTop: 4, padding: 6, width: 280 }}
        />
      </label>
      <label style={{ display: "block", marginTop: 8 }}>
        {t("editor.newSceneDisplayTitle")}
        <input
          data-testid="explore-empty-title"
          type="text"
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void createRoom();
            }
          }}
          style={{ display: "block", marginTop: 4, padding: 6, width: 280 }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          data-testid="explore-empty-new"
          disabled={busy || idDraft.trim().length === 0}
          onClick={() => void createRoom()}
        >
          {t("editor.exploreNewRoom")}
        </button>
        <button
          type="button"
          data-testid="explore-empty-back"
          onClick={() => navigateToDialogueEditor()}
        >
          {t("editor.exploreBackDialogue")}
        </button>
      </div>
      {error ? (
        <p data-testid="explore-empty-error" style={{ color: "#f88" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Standalone M2 Explore shell. Open with #explore hash. */
export function ExploreApp() {
  const [persist] = useState<ExplorePersistApi>(() => createHttpPersistApi());
  const [doc, setDoc] = useState<ExploreDoc | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [emptyBoot, setEmptyBoot] = useState<{
    projectRaw: unknown;
    sceneCatalog: SceneCatalogEntry[];
  } | null>(null);
  const [sceneCatalog, setSceneCatalog] = useState<SceneCatalogEntry[]>([]);
  const [bootGen, setBootGen] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hash = typeof location !== "undefined" ? location.hash : "";
      const result = await bootExplore(persist, exploreRouteParams(hash));
      if (cancelled) return;
      if (result.ok === true) {
        setDoc(result.doc);
        setSceneCatalog(result.sceneCatalog);
        setBootError(null);
        setEmptyBoot(null);
      } else if (result.ok === "empty") {
        setDoc(null);
        setBootError(null);
        setSceneCatalog(result.sceneCatalog);
        setEmptyBoot({
          projectRaw: result.projectRaw,
          sceneCatalog: result.sceneCatalog,
        });
      } else if (result.ok === "dialogue") {
        setDoc(null);
        setBootError(null);
        setEmptyBoot(null);
        navigateToDialogueEditor({ sceneId: result.sceneId });
      } else {
        // Leave doc null so the workspace (and its save path) never mounts.
        setDoc(null);
        setSceneCatalog([]);
        setEmptyBoot(null);
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
    setEmptyBoot(null);
    setBootGen((n) => n + 1);
  };

  if (bootError) {
    return (
      <div data-testid="explore-boot-error" style={shellStyle}>
        <h2 style={{ marginTop: 0 }}>plane-engine · Explore 編輯器</h2>
        <p>載入失敗。（{bootError}）</p>
        <button type="button" data-testid="explore-boot-retry" onClick={retryBoot}>
          重試
        </button>
      </div>
    );
  }

  if (emptyBoot && !doc) {
    return (
      <ExploreEmptyState
        persist={persist}
        projectRaw={emptyBoot.projectRaw}
        sceneCatalog={emptyBoot.sceneCatalog}
        onCreated={(created) => {
          setBootError(null);
          setEmptyBoot(null);
          setSceneCatalog([
            ...emptyBoot.sceneCatalog.filter((entry) => entry.id !== created.scene.id),
            { id: created.scene.id, kind: "explore", title: created.scene.title },
          ]);
          setDoc(created);
        }}
      />
    );
  }

  if (!doc) {
    return <div style={shellStyle}>載入 Explore…</div>;
  }

  return (
    <div style={shellStyle}>
      <h2 style={{ marginTop: 0 }}>plane-engine · Explore 編輯器</h2>
      <ExploreWorkspace initial={doc} sceneCatalog={sceneCatalog} persist={persist} />
    </div>
  );
}
