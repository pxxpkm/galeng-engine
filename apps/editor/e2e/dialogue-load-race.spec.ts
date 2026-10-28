import { expect, test } from "@playwright/test";

// Mount the real hook in Chromium; control only network timing, not its state logic.
const harness = `<div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
window.__vite_plugin_react_preamble_installed__=true;
</script><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import {useEditorState} from '/src/v2/useEditorState.ts';
function Harness(){window.ed=useEditorState();return React.createElement('pre',null,JSON.stringify({scene:window.ed.scene?.id,dirty:window.ed.dirty}));}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script>`;

test("scene loads preserve new edits and ignore superseded responses", async ({ page }) => {
  let releaseB!: () => void;
  let requestedB!: () => void;
  let gate = new Promise<void>(r => { releaseB = r; });
  let requested = new Promise<void>(r => { requestedB = r; });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path === "/api/project") body = { id: "audit", title: "Audit", schemaVersion: 2, resolution: { width: 1920, height: 1080 }, startScene: "a", locale: "en" };
    if (path === "/api/scenes") body = ["a", "b", "c"].map(id => ({ id, title: id, sceneKind: "dialogue", beatCount: 1 }));
    if (path === "/api/asset-root") body = { path: "/tmp/audit", isDefault: true };
    if (path.startsWith("/api/scenes/")) {
      const id = path.split("/").at(-1);
      if (id === "b") { requestedB(); await gate; }
      body = { id, sceneKind: "dialogue", beats: [{ say: { speaker: "n", text: id } }] };
    }
    await route.fulfill({ json: body });
  });
  await page.route("**/audit-load", r => r.fulfill({ contentType: "text/html", body: harness }));
  await page.goto("/audit-load");
  await page.waitForFunction(() => (window as any).ed?.scene?.id === "a");
  await page.evaluate(() => { void (window as any).ed.selectScene("b"); });
  await requested;
  await page.evaluate(() => {
    const ed = (window as any).ed;
    ed.commitScene({ ...ed.scene, title: "UNSAVED_EDIT" });
  });
  releaseB();
  await page.waitForFunction(() => (window as any).ed.sceneId === "a");
  expect(await page.evaluate(() => {
    const ed = (window as any).ed;
    return { scene: ed.scene.id, title: ed.scene.title, dirty: ed.dirty };
  })).toEqual({ scene: "a", title: "UNSAVED_EDIT", dirty: true });

  // Reload creates a new editor. Hold B, accept C, then deliver obsolete B.
  await page.reload();
  await page.waitForFunction(() => (window as any).ed?.scene?.id === "a");
  gate = new Promise<void>(r => { releaseB = r; });
  requested = new Promise<void>(r => { requestedB = r; });
  await page.evaluate(() => { void (window as any).ed.selectScene("b"); });
  await requested;
  await page.evaluate(() => { void (window as any).ed.selectScene("c"); });
  await page.waitForFunction(() => (window as any).ed.scene?.id === "c");
  const responseB = page.waitForResponse(r => r.url().endsWith("/api/scenes/b"));
  releaseB();
  await responseB;
  // Wait for the response body and React's subsequent paint, not just headers.
  await (await responseB).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => {
    const ed = (window as any).ed;
    return { selected: ed.sceneId, scene: ed.scene.id, dirty: ed.dirty };
  })).toEqual({ selected: "c", scene: "c", dirty: false });
});

for (const deleteFails of [false, true]) {
  test(`dirty scene deletion ${deleteFails ? "failure preserves edits" : "drains saves without resurrection"}`, async ({ page }) => {
    const scenes = new Map(["a", "b"].map(id => [id, { id, sceneKind: "dialogue", beats: [{ say: { speaker: "n", text: id } }] }]));
    let project = { id: "audit", title: "Audit", schemaVersion: 2, resolution: { width: 1920, height: 1080 }, startScene: "a", locale: "en" };
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const sending = new Promise<void>(r => { started = r; });
    let firstPut = true;
    const writes: string[] = [];
    await page.route("**/api/**", async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      let body: unknown = [];
      if (path === "/api/project") {
        if (req.method() === "PUT") project = req.postDataJSON();
        body = project;
      }
      if (path === "/api/scenes") body = [...scenes.values()].map(s => ({ id: s.id, sceneKind: s.sceneKind, beatCount: 1 }));
      if (path.startsWith("/api/scenes/")) {
        const id = path.split("/").at(-1)!;
        if (req.method() === "PUT") {
          writes.push(`PUT ${id}`);
          if (firstPut) { firstPut = false; started(); await gate; }
          scenes.set(id, req.postDataJSON());
        }
        if (req.method() === "DELETE") {
          writes.push(`DELETE ${id}`);
          if (deleteFails) { await route.fulfill({ status: 500, body: "delete failed" }); return; }
          scenes.delete(id);
        }
        body = scenes.get(id) ?? {};
      }
      await route.fulfill({ json: body });
    });
    page.on("dialog", d => d.accept());
    await page.route("**/audit-load", r => r.fulfill({ contentType: "text/html", body: harness }));
    await page.goto("/audit-load");
    await page.waitForFunction(() => (window as any).ed?.scene?.id === "a");
    await page.evaluate(() => (window as any).ed.selectScene("b"));
    await page.waitForFunction(() => (window as any).ed.scene?.id === "b");
    await page.evaluate(() => { const ed = (window as any).ed; ed.commitScene({ ...ed.scene, title: "first" }); });
    await page.evaluate(() => { (window as any).saving = (window as any).ed.save(); });
    await sending;
    await page.evaluate(() => {
      const ed = (window as any).ed;
      ed.commitScene({ ...ed.scene, title: "latest draft" });
      localStorage.setItem("galeng.backup.b", "backup");
      (window as any).removing = ed.deleteCurrentScene().catch((e: Error) => e.message);
    });
    // A second save during deletion must not enqueue another scene PUT.
    await page.evaluate(() => (window as any).ed.save());
    await page.evaluate(() => { const ed = (window as any).ed; ed.patchProject({ ...ed.project, title: "UNSAVED PROJECT" }); });
    release();
    const result = await page.evaluate(() => (window as any).removing);
    if (deleteFails) {
      expect(result).toContain("delete failed");
      expect(await page.evaluate(() => ({ id: (window as any).ed.scene.id, title: (window as any).ed.scene.title, dirty: (window as any).ed.dirty, undo: (window as any).ed.canUndo })))
        .toEqual({ id: "b", title: "latest draft", dirty: true, undo: true });
      expect(scenes.has("b")).toBe(true);
      expect(await page.evaluate(() => localStorage.getItem("galeng.backup.b"))).not.toBeNull();
    } else {
      await page.waitForFunction(() => (window as any).ed.scene?.id === "a");
      expect(await page.evaluate(() => ({ title: (window as any).ed.project.title, dirty: (window as any).ed.dirty, undo: (window as any).ed.canUndo, backup: localStorage.getItem("galeng.backup.b") })))
        .toEqual({ title: "UNSAVED PROJECT", dirty: true, undo: false, backup: null });
      await page.evaluate(() => (window as any).ed.save());
      expect(scenes.has("b")).toBe(false);
      expect(project.title).toBe("UNSAVED PROJECT");
    }
    expect(writes).toEqual(["PUT b", "DELETE b"]);
  });
}

test("Settings saves only changed fields after a room has changed verbs", async ({ page }) => {
  let holdPut = false;
  let releasePut!: () => void;
  let putStarted!: () => void;
  const pendingPut = new Promise<void>(r => { releasePut = r; });
  const sendingPut = new Promise<void>(r => { putStarted = r; });
  let project: any = { id: "audit", title: "Audit", schemaVersion: 2, resolution: { width: 1920, height: 1080 }, startScene: "a", locale: "en", titleBgm: "bgm/old", verbs: [{ id: "look", label: "old" }] };
  await page.route("**/api/**", async route => {
    if (route.request().url().endsWith("/api/project")) {
      if (route.request().method() === "PUT") {
        if (holdPut) { putStarted(); await pendingPut; }
        project = route.request().postDataJSON();
      }
      await route.fulfill({ json: project });
    } else await route.fulfill({ json: [] });
  });
  const settingsHarness = harness.replace("import {useEditorState} from '/src/v2/useEditorState.ts';", "import {ExploreSettingsDialog} from '/src/explore/ExploreSettings.tsx';")
    .replace(/function Harness\(\).*?\nReactDOM/s, `function Harness(){return React.createElement(ExploreSettingsDialog,{open:true,onClose:()=>{},onSaved:p=>{window.saved=p;}});}\nReactDOM`);
  await page.route("**/audit-load", r => r.fulfill({ contentType: "text/html", body: settingsHarness }));
  await page.goto("/audit-load");
  await page.getByTestId("explore-settings-audio").click();
  await expect(page.getByPlaceholder("bgm/…").first()).toHaveValue("bgm/old");
  // Another completed writer changes the owned room fields after the dialog opened.
  project = { ...project, verbs: [{ id: "look", label: "room edit" }] };
  await page.getByPlaceholder("bgm/…").first().fill("bgm/new");
  await page.getByTestId("explore-settings-save").click();
  await page.waitForFunction(() => (window as any).saved?.titleBgm === "bgm/new");
  expect(project.verbs).toEqual([{ id: "look", label: "room edit" }]);
  // A deletion must also be explicit, without restoring an old room snapshot.
  project = { ...project, verbs: [{ id: "look", label: "second room edit" }] };
  await page.getByPlaceholder("bgm/…").first().fill("");
  await page.getByTestId("explore-settings-save").click();
  await page.waitForFunction(() => (window as any).saved && !("titleBgm" in (window as any).saved));
  expect(project.verbs).toEqual([{ id: "look", label: "second room edit" }]);
  expect(project).not.toHaveProperty("titleBgm");

  holdPut = true;
  await page.getByPlaceholder("bgm/…").first().fill("bgm/first");
  await page.getByTestId("explore-settings-save").click();
  await sendingPut;
  await page.getByPlaceholder("bgm/…").first().fill("bgm/second");
  holdPut = false;
  releasePut();
  await page.waitForFunction(() => (window as any).saved?.titleBgm === "bgm/first");
  await expect(page.getByPlaceholder("bgm/…").first()).toHaveValue("bgm/second");
  await expect(page.getByTestId("explore-settings-save")).toBeEnabled();
  project = { ...project, verbs: [{ id: "look", label: "third room edit" }] };
  await page.getByTestId("explore-settings-save").click();
  await page.waitForFunction(() => (window as any).saved?.titleBgm === "bgm/second");
  expect(project.verbs).toEqual([{ id: "look", label: "third room edit" }]);
  await expect(page.getByTestId("explore-settings-save")).toBeDisabled();
});
