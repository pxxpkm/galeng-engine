import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import type { Project, Scene } from "./types.js";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadSchema(name: string): object {
  const path = join(packageDir, "schema", name);
  return JSON.parse(readFileSync(path, "utf8")) as object;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const projectValidator = ajv.compile<Project>(loadSchema("galeng.project.schema.json"));
const sceneValidator = ajv.compile<Scene>(loadSchema("galeng.scene.schema.json"));

export interface ValidationFailure {
  ok: false;
  errors: ErrorObject[];
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | ValidationFailure;

function fail(errors: ErrorObject[] | null | undefined): ValidationFailure {
  return { ok: false, errors: errors ?? [] };
}

export function validateProject(data: unknown): ValidationResult<Project> {
  if (projectValidator(data)) {
    return { ok: true, value: data };
  }
  return fail(projectValidator.errors);
}

export function validateScene(data: unknown): ValidationResult<Scene> {
  if (sceneValidator(data)) {
    return { ok: true, value: data };
  }
  return fail(sceneValidator.errors);
}

export function parseJsonUtf8(text: string): unknown {
  if (text.charCodeAt(0) === 0xfeff) {
    throw new Error("UTF-8 BOM is not allowed");
  }
  return JSON.parse(text) as unknown;
}
