export type PackResult = {
  pak: string;
  exe?: string;
  dll?: string;
  warnings?: string[];
};

export function packWarningsOf(result: PackResult): string[] {
  return result.warnings ?? [];
}

export function formatPackNote(result: PackResult, t: (key: string) => string): string {
  const paths = result.exe ? `${result.pak} + ${result.exe}` : result.pak;
  const head = `${t("editor.packWrote")}: ${paths}`;
  const warnings = packWarningsOf(result);
  if (warnings.length === 0) {
    return head;
  }
  return `${head}\n${t("editor.packWarnings")} (${warnings.length}):\n${warnings.join("\n")}`;
}
