import type { Scene } from "./types";

export interface BackupSnap {
  scene: Scene;
  savedAt: number;
}

export function backupKey(sceneId: string): string {
  return `galeng.backup.${sceneId}`;
}

/** Latest unsaved snapshot of `scene`; overwrites any previous backup for it. */
export function writeBackup(storage: Storage | undefined, scene: Scene): void {
  if (!storage) {
    return;
  }
  try {
    const snap: BackupSnap = { scene, savedAt: Date.now() };
    storage.setItem(backupKey(scene.id), JSON.stringify(snap));
  } catch {
    // quota exceeded or storage unavailable: editing must keep working
  }
}

export function readBackup(storage: Storage | undefined, sceneId: string): BackupSnap | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(backupKey(sceneId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<BackupSnap> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.savedAt !== "number") {
      return null;
    }
    const scene = parsed.scene as Scene | undefined;
    if (!scene || typeof scene !== "object" || scene.id !== sceneId || !Array.isArray(scene.beats)) {
      return null;
    }
    return { scene, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function clearBackup(storage: Storage | undefined, sceneId: string): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(backupKey(sceneId));
  } catch {
    // storage unavailable
  }
}

/** Offer restore only when the backup still differs from what is saved on disk. */
export function backupNeedsOffer(saved: Scene, backup: BackupSnap | null): boolean {
  if (!backup) {
    return false;
  }
  return JSON.stringify(backup.scene) !== JSON.stringify(saved);
}
