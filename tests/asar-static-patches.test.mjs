import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(repoRoot, "scratch/asar/webview/assets");
const mainBuildDir = path.join(repoRoot, "scratch/asar/.vite/build");
const restoredDir = path.join(repoRoot, "scratch/restored");

async function readAssetSources() {
  const names = await readdir(assetsDir);
  return await Promise.all(
    names
      .filter((name) => name.endsWith(".js"))
      .map(async (name) => ({
        name,
        text: await readFile(path.join(assetsDir, name), "utf8"),
      })),
  );
}

test("asar patches disable Statsig network traffic", async () => {
  const sources = await readAssetSources();
  const optionsAsset = sources.find(({ text }) =>
    text.includes("https://ab.chatgpt.com/v1"),
  );
  const sdkAsset = sources.find(({ text }) =>
    text.includes("codexWebStatsigNoopClient"),
  );

  assert.ok(optionsAsset, "Statsig options asset should exist");
  assert.ok(sdkAsset, "Statsig SDK asset should exist");
  assert.ok(/preventAllNetworkTraffic\s*:\s*(?:!0|true)/.test(optionsAsset.text));
  assert.ok(/disableLogging\s*:\s*(?:!0|true)/.test(optionsAsset.text));
  assert.ok(optionsAsset.text.includes("window.__ELECTRON_SHIM__.overrideAdapter"));
  assert.ok(!sdkAsset.text.includes("Attempting to retrieve a StatsigClient"));
  assert.ok(/_loggingEnabled\s*===\s*`disabled`\)\s*return/.test(sdkAsset.text));
  assert.ok(
    !/_loggingEnabled\s*===\s*`disabled`\)\s*\{\s*this\._storeEventToStorage/.test(
      sdkAsset.text,
    ),
  );
});

test("Statsig noop fallback is patched from restored source", async () => {
  const restoredText = await readFile(
    path.join(
      restoredDir,
      "vendor/remote-projects-app-shared-current-bundle.ts",
    ),
    "utf8",
  );

  assert.ok(restoredText.includes("codexWebStatsigNoopClient"));
  assert.ok(!restoredText.includes("Attempting to retrieve a StatsigClient"));
});

test("Statsig provider remains mounted after telemetry is disabled", async () => {
  const sources = await readAssetSources();
  const providerAsset = sources.find(({ text }) =>
    text.includes("CodexStatsigProvider.async"),
  );

  assert.ok(providerAsset, "Statsig provider asset should exist");
  assert.ok(
    !/function yq\(\{[\s\S]{0,180}children: a,[\s\S]{0,80}\}\) \{\n\s+return a;/.test(
      providerAsset.text,
    ),
    `${providerAsset.name}: telemetry patch must not bypass StatsigProvider`,
  );
  assert.ok(
    /children: \(0, [A-Za-z0-9_$]+\.jsxs\)\([A-Za-z0-9_$]+\.StatsigProvider,/.test(
      providerAsset.text,
    ),
    `${providerAsset.name}: ready StatsigProvider should still be rendered`,
  );
});

test("open-in-new-window reuses the main browser window", async () => {
  const restoredText = await readFile(
    path.join(
      restoredDir,
      "main/ipc/view-message-ipc/view-message-handler.ts",
    ),
    "utf8",
  );
  const mainChunk = (await readdir(mainBuildDir)).find((name) =>
    /^main-.*\.js$/.test(name),
  );

  assert.ok(mainChunk, "main runtime chunk should exist");
  const runtimeText = await readFile(path.join(mainBuildDir, mainChunk), "utf8");

  assert.ok(restoredText.includes("const targetWindow = await ensureWindow();"));
  assert.ok(
    restoredText.includes("navigateToRoute(targetWindow, message.path);"),
  );
  assert.ok(!runtimeText.includes("let e = await h(n.path);"));
  assert.match(runtimeText, /C\(e,\s*n\.path\)/);
});

test("avatar overlay pet window is disabled from restored source", async () => {
  const restoredText = await readFile(
    path.join(
      restoredDir,
      "main/ipc/view-message-ipc/view-message-handler.ts",
    ),
    "utf8",
  );
  const mainChunk = (await readdir(mainBuildDir)).find((name) =>
    /^main-.*\.js$/.test(name),
  );

  assert.ok(mainChunk, "main runtime chunk should exist");
  const runtimeText = await readFile(path.join(mainBuildDir, mainChunk), "utf8");

  assert.ok(restoredText.includes("avatarOverlayNativeStack: false"));
  assert.ok(restoredText.includes("void event.sender;"));
  assert.ok(restoredText.includes("void message.enabled;"));
  assert.ok(!runtimeText.includes("await y(e.sender)"));
  assert.ok(!runtimeText.includes("_(n.enabled)"));
  assert.ok(!runtimeText.includes("avatarOverlayNativeStack: n.avatarOverlayNativeStack"));
  assert.ok(runtimeText.includes("avatarOverlayNativeStack: !1"));
});

test("app header navigation buttons are regenerated from restored source", async () => {
  const restoredSource = await readFile(
    path.join(restoredDir, "app-shell/sidebar-navigation-controls.tsx"),
    "utf8",
  );
  const runtimeSource = await readFile(
    path.join(
      assetsDir,
      "app-initial~app-main~worktree-init-v2-page~remote-conversation-page~new-thread-panel-page~o~kg2pu5rs-N3llppXI.js",
    ),
    "utf8",
  );

  assert.ok(!restoredSource.includes("{navigationButtons}"));
  assert.ok(runtimeSource.includes("children: [j]"));
  assert.ok(!runtimeSource.includes("children: [j, V]"));
});

test("thread header open-location button is hidden", async () => {
  const restoredSource = await readFile(
    path.join(
      restoredDir,
      "app-shell/thread-app-shell-chrome/open-primary-target.tsx",
    ),
    "utf8",
  );
  const runtimeSource = await readFile(
    path.join(assetsDir, "thread-app-shell-chrome-CEI45G4c.js"),
    "utf8",
  );

  assert.ok(restoredSource.includes("return null;"));
  assert.ok(runtimeSource.includes("function qn(e) {\n  return null;\n}"));
  assert.ok(!runtimeSource.includes("localConversationPage.openPrimaryTarget"));
  assert.ok(!runtimeSource.includes("De(), rr(), fe()"));
  assert.ok(!runtimeSource.includes("function Jn(e)"));
  assert.ok(!runtimeSource.includes("primaryAriaLabel: b"));
});

test("local remote run-location dropdown is hidden", async () => {
  const restoredSource = await readFile(
    path.join(
      restoredDir,
      "thread-summary/local-remote-dropdown-parts/local-remote-dropdown.tsx",
    ),
    "utf8",
  );
  const runtimeSource = await readFile(
    path.join(assetsDir, "local-remote-dropdown-BT-TSjGN.js"),
    "utf8",
  );

  assert.ok(restoredSource.includes("return null;"));
  assert.ok(
    runtimeSource.includes("(va = (0, ga.memo)(function (e) {\n        return null;"),
  );
});
