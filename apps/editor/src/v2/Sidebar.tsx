import { useMemo, useState } from "react";
import { ASSET_GROUP_I18N, groupAssets, type AssetGroup } from "../assets";
import { AuditionButton } from "../AuditionButton";
import { isAudibleLogical, playAudition } from "../audition";
import { encodeAssetDrag } from "../beats";
import { mediaUrl } from "../media";
import { canArchiveScene, canDeleteScene } from "../scene";
import { buildRouteTree, overlayCurrent } from "../route";
import { RouteTree, SceneExitHint } from "../RouteTree";
import type { AssetMeta } from "../types";
import type { Editor } from "./useEditorState";
import { IconChevronDown, IconCg, IconChar, IconFile, IconFilm, IconImage, IconMic, IconMusic, IconNewScene, IconScene, IconSearch, IconSe } from "./icons";

const IMAGE_GROUPS = new Set<AssetGroup>(["bg", "char", "cg"]);

function GroupIcon({ group }: { group: AssetGroup }) {
  switch (group) {
    case "bg":
      return <IconImage />;
    case "char":
      return <IconChar />;
    case "voice":
      return <IconMic />;
    case "bgm":
      return <IconMusic />;
    case "se":
      return <IconSe />;
    case "cg":
      return <IconCg />;
    case "movie":
      return <IconFilm />;
    default:
      return <IconFile />;
  }
}

function AssetThumb({ asset, group }: { asset: AssetMeta; group: AssetGroup }) {
  const [broken, setBroken] = useState(false);
  if (IMAGE_GROUPS.has(group) && !broken) {
    return (
      <img
        className="v2-asset-thumb"
        src={mediaUrl(asset.logical)}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="v2-asset-thumb v2-asset-icon">
      <GroupIcon group={group} />
    </span>
  );
}

function MediaPanel({ ed }: { ed: Editor }) {
  const { t } = ed;
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<AssetGroup>>(new Set());

  const buckets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groupAssets(ed.assets)
      .map((bucket) => ({
        ...bucket,
        items: q ? bucket.items.filter((a) => a.logical.toLowerCase().includes(q)) : bucket.items,
      }))
      .filter((bucket) => bucket.items.length > 0);
  }, [ed.assets, query]);

  return (
    <div className="v2-side-panel">
      <div className="v2-search">
        <IconSearch />
        <input
          type="search"
          value={query}
          placeholder={t("editor.searchMedia")}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="v2-asset-root">
        <span className="v2-asset-root-path" title={ed.assetRoot?.path}>
          {ed.assetRoot?.path ?? t("editor.assetRoot")}
        </span>
        <button type="button" className="v2-btn" onClick={() => void ed.browseAssetRoot()}>
          {t("editor.assetBrowse")}
        </button>
        <button
          type="button"
          className="v2-btn"
          disabled={!ed.assetRoot || ed.assetRoot.isDefault}
          onClick={() => void ed.resetAssetRoot()}
        >
          {t("editor.assetDefault")}
        </button>
      </div>
      <p className="v2-hint">{t("editor.assetHint")}</p>
      <p className="v2-hint">{t("editor.applyHint")}</p>
      <div className="v2-side-scroll">
        {buckets.length === 0 ? (
          <p className="v2-empty">{t("editor.noMediaMatch")}</p>
        ) : (
          buckets.map((bucket) => {
            const isCollapsed = collapsed.has(bucket.group);
            return (
              <div key={bucket.group} className="v2-asset-group">
                <button
                  type="button"
                  className="v2-asset-group-head"
                  onClick={() =>
                    setCollapsed((cur) => {
                      const next = new Set(cur);
                      if (next.has(bucket.group)) {
                        next.delete(bucket.group);
                      } else {
                        next.add(bucket.group);
                      }
                      return next;
                    })
                  }
                >
                  <GroupIcon group={bucket.group} />
                  <span>{t(ASSET_GROUP_I18N[bucket.group])}</span>
                  <span className="v2-count">{bucket.items.length}</span>
                  <span className={`v2-caret${isCollapsed ? " closed" : ""}`}>
                    <IconChevronDown size={13} />
                  </span>
                </button>
                {isCollapsed ? null : (
                  <div className="v2-asset-list">
                    {bucket.items.map((a) => (
                      <div
                        key={a.logical}
                        className="v2-asset"
                        draggable
                        title={a.logical}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", encodeAssetDrag(a));
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => {
                          ed.applyMedia(a);
                          if (isAudibleLogical(a.logical)) {
                            playAudition(a.logical);
                          }
                        }}
                      >
                        <AssetThumb asset={a} group={bucket.group} />
                        <span className="v2-asset-name">{a.logical}</span>
                        <AuditionButton logical={a.logical} t={t} className="v2-btn v2-btn-icon v2-asset-play" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ScenePanel({ ed }: { ed: Editor }) {
  const { t } = ed;
  const routeScenes = useMemo(() => overlayCurrent(ed.scenes, ed.scene), [ed.scenes, ed.scene]);
  const routeIds = useMemo(() => new Set(routeScenes.map((item) => item.id)), [routeScenes]);
  return (
    <div className="v2-side-panel">
      <div className="v2-side-scroll">
        {routeScenes.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`v2-scene${s.id === ed.sceneId ? " active" : ""}`}
            onClick={() => void ed.selectScene(s.id)}
          >
            <IconScene />
            <span className="v2-scene-text">
              <span className="v2-scene-title">{s.title ?? s.id}</span>
              {s.title ? <span className="v2-scene-id">{s.id}</span> : null}
              <SceneExitHint exit={s.exit} ids={routeIds} t={t} />
            </span>
            {s.id === ed.project?.startScene ? (
              <span className="v2-scene-flag" title={t("editor.startScene")}>
                ★
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="v2-side-foot">
        <button type="button" className="v2-btn v2-btn-block" onClick={() => ed.requestNewScene()}>
          <IconNewScene />
          {t("editor.newScene")}
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-block"
          disabled={!canArchiveScene(ed.sceneId ?? "", ed.project?.startScene)}
          title={t("editor.archiveTitle")}
          onClick={() => void ed.archiveCurrentScene().catch(ed.fail)}
        >
          {t("editor.archive")}
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-block"
          disabled={!canDeleteScene(ed.sceneId ?? "", ed.project?.startScene)}
          title={t("editor.deleteSceneTitle")}
          onClick={() => void ed.deleteCurrentScene().catch(ed.fail)}
        >
          {t("editor.deleteScene")}
        </button>
        {ed.archived.length > 0 ? (
          <div className="v2-archived">
            <div className="v2-archived-title">{t("editor.archived")}</div>
            {ed.archived.map((item) => (
              <div key={item.id} className="v2-archived-row">
                <span>{item.title ?? item.id}</span>
                <button
                  type="button"
                  className="v2-btn"
                  onClick={() => void ed.unarchiveScene(item.id).catch(ed.fail)}
                >
                  {t("editor.unarchive")}
                </button>
                <button
                  type="button"
                  className="v2-btn"
                  onClick={() => void ed.deleteArchivedScene(item.id).catch(ed.fail)}
                >
                  {t("editor.deleteArchived")}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RoutePanel({ ed }: { ed: Editor }) {
  const { t } = ed;
  const routeScenes = useMemo(() => overlayCurrent(ed.scenes, ed.scene), [ed.scenes, ed.scene]);
  const routeView = useMemo(
    () => buildRouteTree(ed.project?.startScene ?? "", routeScenes),
    [ed.project?.startScene, routeScenes],
  );
  return (
    <div className="v2-side-panel">
      <div className="v2-side-scroll">
        <RouteTree
          view={routeView}
          currentId={ed.sceneId ?? ""}
          onSelect={(id) => void ed.selectScene(id)}
          t={t}
        />
      </div>
    </div>
  );
}

export function Sidebar({ ed }: { ed: Editor }) {
  const { t } = ed;
  const [tab, setTab] = useState<"scenes" | "media" | "route">("scenes");
  return (
    <aside className="v2-sidebar">
      <div className="v2-tabs">
        <button
          type="button"
          className={`v2-tab${tab === "scenes" ? " active" : ""}`}
          onClick={() => setTab("scenes")}
        >
          {t("editor.scenes")}
        </button>
        <button
          type="button"
          className={`v2-tab${tab === "media" ? " active" : ""}`}
          onClick={() => setTab("media")}
        >
          {t("editor.media")}
        </button>
        <button
          type="button"
          className={`v2-tab${tab === "route" ? " active" : ""}`}
          onClick={() => setTab("route")}
        >
          {t("editor.route")}
        </button>
      </div>
      {tab === "scenes" ? <ScenePanel ed={ed} /> : tab === "media" ? <MediaPanel ed={ed} /> : <RoutePanel ed={ed} />}
    </aside>
  );
}
