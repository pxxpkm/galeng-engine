import { assetGroupOf, charAssetPath } from "./assets";
import type { AssetMeta, Project, Scene } from "./types";

export type CiteField =
  | "bg"
  | "char"
  | "voice"
  | "bgm"
  | "se"
  | "amb"
  | "cg"
  | "movie"
  | "titleBgm"
  | "titleBg"
  | "titleMovie"
  | "font"
  | "msgBox"
  | "icon"
  | "titleButton"
  | "gallery"
  | "music";

export interface CiteSite {
  logical: string;
  field: CiteField;
  sceneId?: string;
  sceneTitle?: string;
  beatIndex?: number;
}

export type CiteStatus = "used" | "orphan" | "missing";

export interface CiteRow {
  logical: string;
  kind: string;
  count: number;
  status: CiteStatus;
  sites: CiteSite[];
}

function pushCite(out: CiteSite[], site: CiteSite): void {
  const logical = site.logical.trim();
  if (!logical) {
    return;
  }
  out.push({ ...site, logical });
}

export function collectCites(project: Project | null, scenes: Scene[]): CiteSite[] {
  const out: CiteSite[] = [];
  if (project) {
    if (project.titleBgm) {
      pushCite(out, { logical: project.titleBgm, field: "titleBgm" });
    }
    if (project.titleBg) {
      pushCite(out, { logical: project.titleBg, field: "titleBg" });
    }
    if (project.titleMovie) {
      pushCite(out, { logical: project.titleMovie, field: "titleMovie" });
    }
    if (project.font) {
      pushCite(out, { logical: project.font, field: "font" });
    }
    if (project.msgBox) {
      pushCite(out, { logical: project.msgBox, field: "msgBox" });
    }
    if (project.icon) {
      pushCite(out, { logical: project.icon, field: "icon" });
    }
    for (const btn of Object.values(project.titleButtons ?? {})) {
      if (btn?.image) {
        pushCite(out, { logical: btn.image, field: "titleButton" });
      }
      if (btn?.hover) {
        pushCite(out, { logical: btn.hover, field: "titleButton" });
      }
    }
    for (const btn of Object.values(project.pauseButtons ?? {})) {
      if (btn?.image) {
        pushCite(out, { logical: btn.image, field: "titleButton" });
      }
      if (btn?.hover) {
        pushCite(out, { logical: btn.hover, field: "titleButton" });
      }
    }
    for (const item of project.cg ?? []) {
      pushCite(out, { logical: item.asset, field: "gallery" });
    }
    for (const item of project.musicGallery ?? []) {
      pushCite(out, { logical: item.asset, field: "music" });
    }
  }
  for (const scene of scenes) {
    scene.beats.forEach((beat, beatIndex) => {
      const at = { sceneId: scene.id, sceneTitle: scene.title, beatIndex };
      if (beat.bg?.asset) {
        pushCite(out, { ...at, logical: beat.bg.asset, field: "bg" });
      }
      for (const ch of beat.chars ?? []) {
        const logical = charAssetPath(ch.id, ch.face);
        if (logical) {
          pushCite(out, { ...at, logical, field: "char" });
        }
      }
      if (beat.say?.voice) {
        pushCite(out, { ...at, logical: beat.say.voice, field: "voice" });
      }
      if (beat.bgm?.asset) {
        pushCite(out, { ...at, logical: beat.bgm.asset, field: "bgm" });
      }
      for (const se of beat.se ?? []) {
        if (se.asset) {
          pushCite(out, { ...at, logical: se.asset, field: "se" });
        }
      }
      if (typeof beat.cg === "string" && beat.cg) {
        pushCite(out, { ...at, logical: beat.cg, field: "cg" });
      }
      if (typeof beat.amb === "string" && beat.amb) {
        pushCite(out, { ...at, logical: beat.amb, field: "amb" });
      }
      if (beat.movie?.asset) {
        pushCite(out, { ...at, logical: beat.movie.asset, field: "movie" });
      }
    });
  }
  return out;
}

const STATUS_RANK: Record<CiteStatus, number> = {
  missing: 0,
  used: 1,
  orphan: 2,
};

export function buildOverview(cites: CiteSite[], assets: AssetMeta[]): CiteRow[] {
  const known = new Map(assets.map((asset) => [asset.logical, asset]));
  const grouped = new Map<string, CiteSite[]>();
  for (const site of cites) {
    const list = grouped.get(site.logical) ?? [];
    list.push(site);
    grouped.set(site.logical, list);
  }
  const rows: CiteRow[] = [];
  for (const [logical, sites] of grouped) {
    const asset = known.get(logical);
    rows.push({
      logical,
      kind: asset?.kind ?? assetGroupOf(logical),
      count: sites.length,
      status: asset ? "used" : "missing",
      sites,
    });
  }
  for (const asset of assets) {
    if (grouped.has(asset.logical)) {
      continue;
    }
    rows.push({
      logical: asset.logical,
      kind: asset.kind,
      count: 0,
      status: "orphan",
      sites: [],
    });
  }
  rows.sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) {
      return rank;
    }
    return a.logical.localeCompare(b.logical);
  });
  return rows;
}

export function canJumpCite(site: CiteSite): boolean {
  return Boolean(site.sceneId);
}

export function overviewOf(project: Project | null, scenes: Scene[], assets: AssetMeta[]): CiteRow[] {
  return buildOverview(collectCites(project, scenes), assets);
}
