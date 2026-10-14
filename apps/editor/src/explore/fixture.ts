import { BUILTIN_VERBS, emptyUi, type ExploreDoc } from "./types";

/** Minimal blank explore doc for editor / golden-path tests. */
export function blankExploreDoc(sceneId = "room"): ExploreDoc {
  return {
    project: {
      id: "demo",
      title: "Demo",
      schemaVersion: 2,
      resolution: { width: 1920, height: 1080 },
      startScene: sceneId,
      locale: "zh-Hant",
      verbs: [...BUILTIN_VERBS],
      items: [],
      switches: [],
      characters: [],
      fallback: {
        perVerb: {
          look: "冇咩特別。",
          take: "拎唔到。",
          use: "咁樣用唔到。",
          talk: "冇人應。",
          open: "開唔到。",
          move: "去唔到。",
        },
        itemOnHotspot: "用呢樣嘢冇效果。",
        global: "……",
      },
    },
    scene: {
      id: sceneId,
      title: "新房間",
      sceneKind: "explore",
      bg: { asset: "bg/room", trans: "fade", ms: 400 },
      hotspots: [],
      interactions: [],
      onEnter: [],
    },
    ui: emptyUi(),
  };
}
