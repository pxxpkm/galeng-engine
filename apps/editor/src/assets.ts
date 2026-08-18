import type { AssetMeta } from "./types";

export const ASSET_GROUPS = ["bg", "char", "voice", "bgm", "se", "amb", "cg", "movie", "fonts", "ui", "other"] as const;

export type AssetGroup = (typeof ASSET_GROUPS)[number];

export type AssetGroupBucket = {
  group: AssetGroup;
  items: AssetMeta[];
};

const KNOWN = new Set<string>(ASSET_GROUPS.filter((g) => g !== "other"));

export function assetGroupOf(logical: string): AssetGroup {
  const head = logical.split("/")[0] ?? "";
  if (KNOWN.has(head)) {
    return head as AssetGroup;
  }
  return "other";
}

/** Fixed order. Empty groups omitted. */
export function groupAssets(assets: AssetMeta[]): AssetGroupBucket[] {
  const buckets = new Map<AssetGroup, AssetMeta[]>();
  for (const asset of assets) {
    const group = assetGroupOf(asset.logical);
    const list = buckets.get(group) ?? [];
    list.push(asset);
    buckets.set(group, list);
  }
  return ASSET_GROUPS.flatMap((group) => {
    const items = buckets.get(group);
    return items && items.length > 0 ? [{ group, items }] : [];
  });
}

export function knownLogicals(assets: AssetMeta[]): Set<string> {
  return new Set(assets.map((asset) => asset.logical));
}

export function logicalsWithPrefix(assets: AssetMeta[], prefix: string): string[] {
  return assets.filter((asset) => asset.logical.startsWith(prefix)).map((asset) => asset.logical);
}

/** Empty / whitespace is "unset", not missing. */
export function isMissingAsset(
  path: string | undefined | null,
  known: Iterable<string>,
): boolean {
  const trimmed = path?.trim() ?? "";
  if (trimmed.length === 0) {
    return false;
  }
  const set = known instanceof Set ? known : new Set(known);
  return !set.has(trimmed);
}

export function charAssetPath(id: string, face: string): string {
  const trimmedId = id.trim();
  const trimmedFace = face.trim();
  if (!trimmedId || !trimmedFace) {
    return "";
  }
  return `char/${trimmedId}/${trimmedFace}`;
}

export type AssetLists = {
  bg: string[];
  bgm: string[];
  se: string[];
  amb: string[];
  voice: string[];
  cg: string[];
  movie: string[];
  fonts: string[];
  ui: string[];
  images: string[];
  charIds: string[];
  facesFor: (id: string) => string[];
  known: Set<string>;
};

export function assetLists(assets: AssetMeta[]): AssetLists {
  const charParts = assets
    .filter((asset) => asset.logical.startsWith("char/"))
    .map((asset) => asset.logical.split("/"));
  const facesById = new Map<string, string[]>();
  for (const parts of charParts) {
    const id = parts[1];
    const face = parts[2];
    if (!id || !face) continue;
    const list = facesById.get(id) ?? [];
    if (!list.includes(face)) {
      list.push(face);
    }
    facesById.set(id, list);
  }
  return {
    bg: logicalsWithPrefix(assets, "bg/"),
    bgm: logicalsWithPrefix(assets, "bgm/"),
    se: logicalsWithPrefix(assets, "se/"),
    amb: logicalsWithPrefix(assets, "amb/"),
    voice: logicalsWithPrefix(assets, "voice/"),
    cg: logicalsWithPrefix(assets, "cg/"),
    movie: assets
      .filter((asset) => asset.kind === "movie" || asset.logical.startsWith("movie/"))
      .map((asset) => asset.logical),
    fonts: logicalsWithPrefix(assets, "fonts/"),
    ui: logicalsWithPrefix(assets, "ui/"),
    images: assets.filter((asset) => asset.kind === "image").map((asset) => asset.logical),
    charIds: [...facesById.keys()],
    facesFor: (id: string) => facesById.get(id) ?? [],
    known: knownLogicals(assets),
  };
}

export const ASSET_GROUP_I18N: Record<AssetGroup, string> = {
  bg: "editor.trackBg",
  char: "editor.trackChar",
  voice: "editor.trackVoice",
  bgm: "editor.trackBgm",
  se: "editor.trackSe",
  amb: "editor.trackAmb",
  cg: "editor.trackCg",
  movie: "editor.movie",
  fonts: "editor.font",
  ui: "editor.msgBox",
  other: "editor.mediaOther",
};
