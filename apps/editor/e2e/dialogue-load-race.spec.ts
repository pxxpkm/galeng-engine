import { expect, test } from "@playwright/test";

// Mount the real hook in Chromium; control only network timing, not its state logic.
const harness = `<div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
window.__vite_plugin_react_preamble_installed__=true;
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
