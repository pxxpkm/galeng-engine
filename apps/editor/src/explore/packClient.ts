/**
 * Explore → host pack bridge.
 * Host already exposes POST /api/pack (see crates/host); dialogue App/v2 use the same.
 */
import { postJson } from "../api";
import {
  formatPackNote,
  packWarningsOf,
  type PackResult,
} from "../pack";

export type { PackResult };

export type PackRequest = {
  /** Output folder; omit for host default `export/game`. */
  out?: string;
  strict?: boolean;
};

export interface ExplorePackApi {
  pack(opts?: PackRequest): Promise<PackResult>;
}

export function createHttpPackApi(): ExplorePackApi {
  return {
    pack: (opts = {}) => {
      const body: Record<string, unknown> = {};
      const out = opts.out?.trim();
      if (out) body.out = out;
      if (opts.strict) body.strict = true;
      return postJson<PackResult>("/api/pack", body);
    },
  };
}

/** Short top-bar / status line (Traditional Chinese, no i18n dependency). */
export function formatExplorePackStatus(result: PackResult): string {
  const paths = result.exe ? `${result.pak} + ${result.exe}` : result.pak;
  const warnings = packWarningsOf(result);
  if (warnings.length === 0) {
    return `已出包：${paths}`;
  }
  return `已出包：${paths}（警告 ${warnings.length}）`;
}

/** Re-export shared note formatter for callers that have a `t` function. */
export { formatPackNote, packWarningsOf };
