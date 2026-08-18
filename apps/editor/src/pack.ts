export type PackResult = {
  pak: string;
  exe?: string;
  dll?: string;
  warnings?: string[];
  signed?: boolean;
};

export function packWarningsOf(result: PackResult): string[] {
  return result.warnings ?? [];
}

export function formatPackNote(result: PackResult, t: (key: string) => string): string {
  const paths = result.exe ? `${result.pak} + ${result.exe}` : result.pak;
  const lines = [`${t("editor.packWrote")}: ${paths}`];
  if (result.signed) {
    lines.push(t("editor.packSigned"));
  }
  const warnings = packWarningsOf(result);
  if (warnings.length > 0) {
    lines.push(`${t("editor.packWarnings")} (${warnings.length}):`);
    lines.push(...warnings);
  }
  return lines.join("\n");
}
