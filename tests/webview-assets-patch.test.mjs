import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  patchInvalidCssPropertyInitialValuesAsset,
  patchInvalidCssPropertyInitialValuesSupport,
  patchStatsigTelemetryDisableAsset,
  patchStatsigTelemetryDisableSupport,
} from "../scripts/patch_webview_assets.mjs";

test("patchInvalidCssPropertyInitialValuesSupport fixes rem @property initial values", () => {
  const source =
    '@property --edge-fade-distance{syntax:"<length>";inherits:false;initial-value:1rem}';
  const patched = patchInvalidCssPropertyInitialValuesSupport(source);

  assert.equal(
    patched,
    '@property --edge-fade-distance{syntax:"<length>";inherits:false;initial-value:16px}',
  );
  assert.equal(patchInvalidCssPropertyInitialValuesSupport(patched), patched);
});

test("patchInvalidCssPropertyInitialValuesAsset patches app css assets", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const appCss = join(assetsDir, "app-test.css");
  await writeFile(
    appCss,
    '@property --edge-fade-distance{syntax:"<length>";inherits:false;initial-value:1rem}',
  );
  await writeFile(join(assetsDir, "other.css"), "body{}");

  assert.deepEqual(patchInvalidCssPropertyInitialValuesAsset(assetsDir), [
    appCss,
  ]);
  assert.match(await readFile(appCss, "utf8"), /initial-value:16px/);
});

test("patchStatsigTelemetryDisableSupport disables Statsig network traffic at init options", () => {
  const source =
    "const KP=`api`,tP=`log`,qP=`exception`,UP=()=>{};let QP={networkConfig:{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,networkOverrideFunc:UP}};";

  const patched = patchStatsigTelemetryDisableSupport(source);

  assert.match(
    patched,
    /QP=\{overrideAdapter:window\.__ELECTRON_SHIM__\.overrideAdapter,disableLogging:true,networkConfig:\{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,preventAllNetworkTraffic:true,networkOverrideFunc:UP\}\}/,
  );
});

test("patchStatsigTelemetryDisableSupport handles formatted Statsig options", () => {
  const source = [
    "const KP = `api`, tP = `log`, qP = `exception`, UP = () => {};",
    "let QP = {",
    "  networkConfig: {",
    "    api: KP,",
    "    logEventUrl: tP,",
    "    sdkExceptionUrl: qP,",
    "    networkOverrideFunc: UP,",
    "  },",
    "};",
  ].join("\n");

  const patched = patchStatsigTelemetryDisableSupport(source);

  assert.match(
    patched,
    /overrideAdapter:\s*window\.__ELECTRON_SHIM__\.overrideAdapter/,
  );
  assert.match(patched, /disableLogging:\s*true/);
  assert.match(patched, /preventAllNetworkTraffic:\s*true/);
});

test("patchStatsigTelemetryDisableAsset skips unrelated Statsig SDK chunks", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const appMain = join(assetsDir, "app-main-test.js");

  await writeFile(
    join(assetsDir, "statsig-test.js"),
    "const networkOverrideFunc = true;",
  );
  await writeFile(
    appMain,
    "let QP={networkConfig:{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,networkOverrideFunc:UP}};",
  );

  const patchedFile = patchStatsigTelemetryDisableAsset(assetsDir);
  const patched = await readFile(appMain, "utf8");

  assert.equal(patchedFile, appMain);
  assert.match(patched, /preventAllNetworkTraffic:true/);
});

test("patchStatsigTelemetryDisableAsset accepts already patched formatted assets", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const appMain = join(assetsDir, "app-main-test.js");

  await writeFile(
    join(assetsDir, "statsig-test.js"),
    "const networkOverrideFunc = true;",
  );
  await writeFile(
    appMain,
    "let QP = { overrideAdapter: window.__ELECTRON_SHIM__.overrideAdapter, disableLogging: true, networkConfig: { api: KP, logEventUrl: tP, sdkExceptionUrl: qP, preventAllNetworkTraffic: true, networkOverrideFunc: UP } };",
  );

  assert.equal(patchStatsigTelemetryDisableAsset(assetsDir), appMain);
});

test("patchStatsigTelemetryDisableSupport accepts reordered patched Statsig options", () => {
  const source =
    "let QP={overrideAdapter:window.__ELECTRON_SHIM__.overrideAdapter,disableLogging:true,networkConfig:{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,networkOverrideFunc:UP,preventAllNetworkTraffic:true}};";

  assert.equal(patchStatsigTelemetryDisableSupport(source), source);
});

test("patchStatsigTelemetryDisableSupport repairs missing Statsig disableLogging", () => {
  const source =
    "let QP={overrideAdapter:window.__ELECTRON_SHIM__.overrideAdapter,networkConfig:{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,preventAllNetworkTraffic:true,networkOverrideFunc:UP}};";

  const patched = patchStatsigTelemetryDisableSupport(source);

  assert.match(patched, /disableLogging:true/);
});

test("patchStatsigTelemetryDisableAsset ignores unrelated disabled network chunks", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const appMain = join(assetsDir, "z-app-main-test.js");

  await writeFile(
    join(assetsDir, "a-statsig-test.js"),
    'const networkOverrideFunc = true; const marker = "window.__ELECTRON_SHIM__.overrideAdapter"; const x = { preventAllNetworkTraffic: true };',
  );
  await writeFile(
    appMain,
    "let QP={networkConfig:{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,networkOverrideFunc:UP}};",
  );

  assert.equal(patchStatsigTelemetryDisableAsset(assetsDir), appMain);
  assert.match(
    await readFile(appMain, "utf8"),
    /preventAllNetworkTraffic:true/,
  );
});

test("patchStatsigTelemetryDisableAsset ignores unrelated fully marked chunks", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const appMain = join(assetsDir, "z-app-main-test.js");

  await writeFile(
    join(assetsDir, "a-statsig-test.js"),
    'const networkOverrideFunc = true; const marker = "window.__ELECTRON_SHIM__.overrideAdapter"; const x = { disableLogging: true, preventAllNetworkTraffic: true };',
  );
  await writeFile(
    appMain,
    "let QP={networkConfig:{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,networkOverrideFunc:UP}};",
  );

  assert.equal(patchStatsigTelemetryDisableAsset(assetsDir), appMain);
  assert.match(
    await readFile(appMain, "utf8"),
    /preventAllNetworkTraffic:true/,
  );
});

test("patchStatsigTelemetryDisableAsset ignores non-Statsig patched options", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const appMain = join(assetsDir, "z-app-main-test.js");

  await writeFile(
    join(assetsDir, "a-statsig-test.js"),
    "let x={overrideAdapter:window.__ELECTRON_SHIM__.overrideAdapter,disableLogging:true,networkConfig:{preventAllNetworkTraffic:true,networkOverrideFunc:noop}};",
  );
  await writeFile(
    appMain,
    "let QP={networkConfig:{api:KP,logEventUrl:tP,sdkExceptionUrl:qP,networkOverrideFunc:UP}};",
  );

  assert.equal(patchStatsigTelemetryDisableAsset(assetsDir), appMain);
  assert.match(
    await readFile(appMain, "utf8"),
    /preventAllNetworkTraffic:true/,
  );
});
