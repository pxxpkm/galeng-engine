/** Node-only FS backend for ExplorePersistApi (host layout: galeng.json + scenario/). */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExplorePersistApi } from "./persist";

export function createFsPersistApi(rootDir: string): ExplorePersistApi {
  const projectPath = path.join(rootDir, "galeng.json");
  const scenePath = (id: string) => path.join(rootDir, "scenario", `${id}.json`);

  async function readJson(file: string): Promise<unknown> {
    const text = await readFile(file, "utf8");
    return JSON.parse(text) as unknown;
  }

  async function writeJson(file: string, body: unknown): Promise<unknown> {
    await mkdir(path.dirname(file), { recursive: true });
    const pretty = `${JSON.stringify(body, null, 2)}\n`;
    await writeFile(file, pretty, "utf8");
    return body;
  }

  return {
    loadProject: () => readJson(projectPath),
    saveProject: (body) => writeJson(projectPath, body),
    loadScene: (id) => readJson(scenePath(id)),
    saveScene: (id, body) => writeJson(scenePath(id), body),
  };
}
