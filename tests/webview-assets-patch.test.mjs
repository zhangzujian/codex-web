import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  patchRefetchQueriesCancelRefetchAsset,
  patchRefetchQueriesCancelRefetchSupport,
  patchStatsigTelemetryDisableAsset,
  patchStatsigTelemetryFlushDisableAsset,
  patchStatsigTelemetryFlushDisableSupport,
  patchStatsigTelemetryDisableSupport,
  patchStatsigNoopClientOverrideAsset,
  patchStatsigNoopClientOverrideSupport,
  patchDynamicToolsAutomationAsset,
  patchDynamicToolsAutomationSupport,
  patchAutomationDefaultModelAsset,
  patchAutomationDefaultModelSupport,
  patchAutomationModelPickerAsset,
  patchAutomationModelPickerSupport,
  patchAutomationToolContractAsset,
  patchAutomationToolContractSupport,
  patchAutomationArgumentsNormalizationSupport,
  patchAutomationRemoteDefaultHostSupport,
  patchSettingsAllSettingsSectionFiltersAsset,
  patchSettingsAllSettingsSectionFiltersSupport,
  patchSettingsArchivedChatsRemoteDefaultAsset,
  patchSettingsArchivedChatsRemoteDefaultSupport,
  patchAppHeaderNavigationButtonsRenderAsset,
  patchAppHeaderNavigationButtonsRenderSupport,
  checkPatchedJavaScriptFilesSyntax,
  verifyPatchedWebviewAssets,
} from "../scripts/patch_webview_assets.mjs";

test("checkPatchedJavaScriptFilesSyntax rejects invalid patched JavaScript", async () => {
  const dir = await mkdtemp(join(tmpdir(), "codex-web-syntax-"));
  try {
    const valid = join(dir, "valid.js");
    const invalid = join(dir, "invalid.js");
    const html = join(dir, "index.html");
    await writeFile(valid, "const ok = 1;\n");
    await writeFile(invalid, "function broken( { export const nope = 1;\n");
    await writeFile(html, "<html></html>\n");

    assert.throws(
      () => checkPatchedJavaScriptFilesSyntax([valid, html, invalid]),
      /Invalid JavaScript syntax in patched file/,
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("checkPatchedJavaScriptFilesSyntax rejects invalid ESM syntax missed by node --check", async () => {
  const dir = await mkdtemp(join(tmpdir(), "codex-web-esm-syntax-"));
  try {
    const invalid = join(dir, "invalid-esm.js");
    await writeFile(invalid, "const a = 1; export { a as b) };\n");

    assert.throws(
      () => checkPatchedJavaScriptFilesSyntax([invalid]),
      /Invalid JavaScript syntax in patched file/,
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("verifyPatchedWebviewAssets rejects stale patch targets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "codex-web-assets-verify-"));
  const asset = join(dir, "query-client-test.js");
  try {
    await writeFile(
      asset,
      "class QueryClient{refetchQueries(e,t={}){let n={...t,cancelRefetch:t.cancelRefetch??!0};return n}}",
    );

    assert.throws(
      () => verifyPatchedWebviewAssets(dir, [asset]),
      /refetchQueries still defaults cancelRefetch to true/,
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("verifyPatchedWebviewAssets rejects invalid patched file lists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "codex-web-assets-verify-"));
  try {
    assert.throws(
      () => verifyPatchedWebviewAssets(dir, [join(tmpdir(), "outside.js")]),
      /Patched asset is outside/,
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("verifyPatchedWebviewAssets checks syntax for every webview JavaScript asset", async () => {
  const dir = await mkdtemp(join(tmpdir(), "codex-web-assets-verify-"));
  const listed = join(dir, "listed.js");
  const unlistedInvalid = join(dir, "lazy-chunk.js");
  try {
    await writeFile(listed, "const ok = 1;\n");
    await writeFile(unlistedInvalid, "const a = 1; export { a as b) };\n");

    assert.throws(
      () => verifyPatchedWebviewAssets(dir, [listed]),
      /Invalid JavaScript syntax in patched file/,
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("patchAppHeaderNavigationButtonsRenderSupport stops rendering app header history buttons", () => {
  const source =
    "viewTransitionName:`sidebar-trigger`,onClick:w});let N=(0,mL.jsx)(dL,{ariaLabel:k,onClick:uL});let R=(0,mL.jsx)(dL,{ariaLabel:P,onClick:lL});let z=(0,mL.jsx)(Kn,{children:(0,mL.jsxs)(mL.Fragment,{children:[N,R]})});let B;return t[44]!==O||t[45]!==z?(B=(0,mL.jsxs)(`div`,{className:`flex items-center gap-1`,children:[O,z]}),t[44]=O,t[45]=z,t[46]=B):B=t[46],B}function lL(){return Hn(`navigateForward`,`sidebar_forward`)}function uL(){return Hn(`navigateBack`,`sidebar_back`)}";
  const patched = patchAppHeaderNavigationButtonsRenderSupport(source);

  assert.match(patched, /children:\[O\]\}/);
  assert.match(patched, /children:\[N,R\]/);
  assert.doesNotMatch(patched, /children:\[O,z\]/);
  assert.equal(patchAppHeaderNavigationButtonsRenderSupport(patched), patched);
});

test("patchAppHeaderNavigationButtonsRenderAsset patches the app shell chunk", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const appShell = join(assetsDir, "app-shell.js");
  const unrelated = join(assetsDir, "other.js");
  try {
    await writeFile(
      appShell,
      "viewTransitionName:`sidebar-trigger`,onClick:w});let N=(0,mL.jsx)(dL,{ariaLabel:k,onClick:uL});let R=(0,mL.jsx)(dL,{ariaLabel:P,onClick:lL});let z=(0,mL.jsx)(Kn,{children:(0,mL.jsxs)(mL.Fragment,{children:[N,R]})});let B;return t[44]!==O||t[45]!==z?(B=(0,mL.jsxs)(`div`,{className:`flex items-center gap-1`,children:[O,z]}),t[44]=O,t[45]=z,t[46]=B):B=t[46],B}function lL(){return Hn(`navigateForward`,`sidebar_forward`)}function uL(){return Hn(`navigateBack`,`sidebar_back`)}",
    );
    await writeFile(unrelated, "viewTransitionName:`sidebar-trigger`");

    assert.equal(patchAppHeaderNavigationButtonsRenderAsset(assetsDir), appShell);
    assert.match(
      await readFile(appShell, "utf8"),
      /children:\[O\]\}/,
    );
    assert.equal(await readFile(unrelated, "utf8"), "viewTransitionName:`sidebar-trigger`");
  } finally {
    await rm(assetsDir, { force: true, recursive: true });
  }
});

test("patchRefetchQueriesCancelRefetchSupport keeps refetchQueries from cancelling in-flight fetches by default", () => {
  const source =
    "refetchQueries(e,t={}){let n={...t,cancelRefetch:t.cancelRefetch??!0},r=h.batch(()=>this.#e.findAll(e).map(e=>e.fetch(void 0,n)));return Promise.all(r).then(l)}";
  const patched = patchRefetchQueriesCancelRefetchSupport(source);

  assert.match(patched, /cancelRefetch:t\.cancelRefetch\?\?!1/);
  assert.equal(patchRefetchQueriesCancelRefetchSupport(patched), patched);
});

test("patchRefetchQueriesCancelRefetchSupport handles formatted query client chunks", () => {
  const source = [
    "refetchQueries(filters, options = {}) {",
    "  const fetchOptions = {",
    "    ...options,",
    "    cancelRefetch: options.cancelRefetch ?? true",
    "  };",
    "  return Promise.all(promises).then(noop);",
    "}",
  ].join("\n");
  const patched = patchRefetchQueriesCancelRefetchSupport(source);

  assert.match(patched, /cancelRefetch: options\.cancelRefetch \?\? false/);
  assert.equal(patchRefetchQueriesCancelRefetchSupport(patched), patched);
});

test("patchRefetchQueriesCancelRefetchAsset patches every query client chunk", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const appMain = join(assetsDir, "app-test.js");
  const preload = join(assetsDir, "preload.js");
  await writeFile(
    appMain,
    "refetchQueries(e,t={}){let n={...t,cancelRefetch:t.cancelRefetch??!0},r=h.batch(()=>this.#e.findAll(e).map(e=>e.fetch(void 0,n)));return Promise.all(r).then(l)}",
  );
  await writeFile(
    preload,
    "refetchQueries(filters, options = {}) { const fetchOptions = { ...options, cancelRefetch: options.cancelRefetch ?? true }; }",
  );
  await writeFile(
    join(assetsDir, "other.js"),
    "cancelRefetch:t.cancelRefetch??!0",
  );

  assert.deepEqual(patchRefetchQueriesCancelRefetchAsset(assetsDir), [
    appMain,
    preload,
  ]);
  assert.match(
    await readFile(appMain, "utf8"),
    /cancelRefetch:t\.cancelRefetch\?\?!1/,
  );
  assert.match(
    await readFile(preload, "utf8"),
    /cancelRefetch: options\.cancelRefetch \?\? false/,
  );
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

test("patchSettingsAllSettingsSectionFiltersSupport keeps Connections visible in All settings", () => {
  const source =
    "var lr,ur;lr=[`profile`,`agent`,`personalization`,`mcp-settings`,`hooks-settings`,`local-environments`,`worktrees`,`data-controls`],ur=`agent`;function sr(){let r=Gt(),i=ye(),y=Ge.filter(e=>{switch(e.slug){case`connections`:return i&&!r;case`usage`:return p}})}";
  const patched = patchSettingsAllSettingsSectionFiltersSupport(source);

  assert.match(patched, /case`connections`:return i;case`usage`:/);
  assert.match(patched, /lr=\[[^\]]*`hooks-settings`,`connections`/);
  assert.equal(patchSettingsAllSettingsSectionFiltersSupport(patched), patched);
});

test("patchSettingsAllSettingsSectionFiltersAsset locates the settings grouping chunk", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const settings = join(assetsDir, "settings-page-test.js");
  const unrelated = join(assetsDir, "remote-connections-settings.js");
  try {
    await writeFile(
      unrelated,
      "case`connections`:return i&&!r;case`usage`:return p",
    );
    await writeFile(
      settings,
      "settings.hostDropdown.allSettings;groupSettingsSections:!0;var lr,ur;lr=[`profile`,`agent`,`personalization`,`mcp-settings`,`hooks-settings`,`local-environments`,`worktrees`,`data-controls`],ur=`agent`;Ge.filter(e=>{switch(e.slug){case`connections`:return i&&!r;case`usage`:return p}})",
    );

    assert.equal(patchSettingsAllSettingsSectionFiltersAsset(assetsDir), settings);
    const patched = await readFile(settings, "utf8");
    assert.match(patched, /case`connections`:return i;case`usage`:/);
    assert.match(patched, /lr=\[[^\]]*`hooks-settings`,`connections`/);
  } finally {
    await rm(assetsDir, { force: true, recursive: true });
  }
});

test("patchSettingsArchivedChatsRemoteDefaultSupport shows local archives for default remote", () => {
  const source =
    "function Pt(){let t=`remote:default`,s=[{id:`archived-thread`}],u=[];let o=t===`local`?s:[],E=ut({cloudTasks:u,localThreads:o})}";

  const patched = patchSettingsArchivedChatsRemoteDefaultSupport(source);

  assert.match(patched, /\(t===`local`\|\|t===`remote:default`\)\?s:\[\]/);
  assert.equal(patchSettingsArchivedChatsRemoteDefaultSupport(patched), patched);
});

test("patchSettingsArchivedChatsRemoteDefaultAsset locates the data controls chunk", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const dataControls = join(assetsDir, "data-controls-test.js");
  try {
    await writeFile(
      dataControls,
      "settings.dataControls.archivedChats.empty;queryKey:[`archived-threads`,t];function Pt(){let t=`remote:default`,s=[{id:`archived-thread`}],u=[];let o=t===`local`?s:[],E=ut({cloudTasks:u,localThreads:o})}",
    );

    assert.equal(
      patchSettingsArchivedChatsRemoteDefaultAsset(assetsDir),
      dataControls,
    );
    assert.match(
      await readFile(dataControls, "utf8"),
      /\(t===`local`\|\|t===`remote:default`\)\?s:\[\]/,
    );
  } finally {
    await rm(assetsDir, { force: true, recursive: true });
  }
});

test("patchStatsigTelemetryFlushDisableSupport drops disabled Statsig events instead of storing and flushing", () => {
  const source =
    "enqueue(e){if(!this._shouldLogEvent(e))return;let n=this._normalizeEvent(e);if(this._loggingEnabled===`disabled`){this._storeEventToStorage(n);return}this._initFlushCoordinator().addEvent(n)}start(){let t=(0,d._isServerEnv)();if(t&&this._options?.loggingEnabled!==`always`)return;let n=this._initFlushCoordinator();E[this._sdkKey]=this,n.startScheduledFlushCycle()}";

  const patched = patchStatsigTelemetryFlushDisableSupport(source);

  assert.match(patched, /if\(this\._loggingEnabled===`disabled`\)return;/);
  assert.doesNotMatch(patched, /returnthis/);
  assert.doesNotMatch(patched, /_storeEventToStorage\(n\)/);
  assert.match(
    patched,
    /start\(\)\{let t=\(0,d\._isServerEnv\)\(\);if\(this\._loggingEnabled===`disabled`\)return;/,
  );
  assert.equal(patchStatsigTelemetryFlushDisableSupport(patched), patched);
});

test("patchStatsigTelemetryFlushDisableSupport repairs stale returnthis assets", () => {
  const source =
    "enqueue(e){if(!this._shouldLogEvent(e))return;let n=this._normalizeEvent(e);if(this._loggingEnabled===`disabled`)returnthis._initFlushCoordinator().addEvent(n)}start(){let t=(0,d._isServerEnv)();if(this._loggingEnabled===`disabled`)return;let n=this._initFlushCoordinator();E[this._sdkKey]=this,n.startScheduledFlushCycle()}";

  const patched = patchStatsigTelemetryFlushDisableSupport(source);

  assert.doesNotMatch(patched, /returnthis/);
  assert.match(
    patched,
    /if\(this\._loggingEnabled===`disabled`\)return;this\._initFlushCoordinator\(\)/,
  );
});

test("patchStatsigTelemetryFlushDisableAsset patches the Statsig SDK chunk", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const sdk = join(assetsDir, "statsig-test.js");

  await writeFile(
    sdk,
    "enqueue(e){if(!this._shouldLogEvent(e))return;let n=this._normalizeEvent(e);if(this._loggingEnabled===`disabled`){this._storeEventToStorage(n);return}this._initFlushCoordinator().addEvent(n)}start(){let t=(0,d._isServerEnv)();if(t&&this._options?.loggingEnabled!==`always`)return;let n=this._initFlushCoordinator();E[this._sdkKey]=this,n.startScheduledFlushCycle()}",
  );
  await writeFile(join(assetsDir, "other.js"), "_storeEventToStorage(n)");

  assert.equal(patchStatsigTelemetryFlushDisableAsset(assetsDir), sdk);
  assert.doesNotMatch(await readFile(sdk, "utf8"), /_storeEventToStorage\(n\)/);
});

test("patchStatsigNoopClientOverrideSupport routes noop Statsig through browser overrides", () => {
  const source =
    "import{a as x}from './x.js';var qRe=i((e=>{function a(){let{client:e,renderVersion:a,isLoading:o}=(0,t.useContext)(i.default),s=(0,t.useMemo)(()=>(0,r.isNoopClient)(e)?(n.Log.warn(`Attempting to retrieve a StatsigClient but none was set.`),r.NoopEvaluationsClient):e,[e,a]);return s}}));";

  const patched = patchStatsigNoopClientOverrideSupport(source);

  assert.match(patched, /function codexWebStatsigNoopClient\(e\)/);
  assert.match(
    patched,
    /codexWebStatsigNoopClient\(r\.NoopEvaluationsClient\)/,
  );
  assert.match(patched, /getDynamicConfigOverride/);
  assert.match(patched, /getLayerOverride/);
  assert.match(patched, /getGateOverride/);
  assert.equal(patchStatsigNoopClientOverrideSupport(patched), patched);
});

test("patchStatsigNoopClientOverrideAsset patches the Statsig runtime chunk", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const runtime = join(assetsDir, "app-runtime-test.js");

  await writeFile(
    runtime,
    "var qRe=i((e=>{function a(){let{client:e,renderVersion:a,isLoading:o}=(0,t.useContext)(i.default),s=(0,t.useMemo)(()=>(0,r.isNoopClient)(e)?(n.Log.warn(`Attempting to retrieve a StatsigClient but none was set.`),r.NoopEvaluationsClient):e,[e,a]);return s}}));",
  );

  assert.equal(patchStatsigNoopClientOverrideAsset(assetsDir), runtime);
  assert.match(
    await readFile(runtime, "utf8"),
    /codexWebStatsigNoopClient\(r\.NoopEvaluationsClient\)/,
  );
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

test("patchDynamicToolsAutomationSupport adds automation_update and preserves onboarding gate", () => {
  const source =
    "var gr=100;function xr({featureOverrides:r,threadStartKind:m=`default`}){let C=r?.[s]===!0;return[{tools:[...m===`conversational_onboarding`?[Ie]:[],...C&&m!==`conversational_onboarding`?[...p,a]:[]]}]}";

  const patched = patchDynamicToolsAutomationSupport(source);

  assert.match(patched, /name:`automation_update`/);
  assert.match(
    patched,
    /Do not set model or reasoningEffort unless the user explicitly requests them/,
  );
  assert.match(patched, /omitted values use the Codex configured defaults/);
  assert.doesNotMatch(patched, /suggested_create|suggested_update/);
  assert.match(
    patched,
    /codexWebAutomationUpdateTool,\.\.\.C&&m!==`conversational_onboarding`\?\[\.\.\.p,a\]:\[\]/,
  );
  assert.equal(patchDynamicToolsAutomationSupport(patched), patched);
});

test("patchDynamicToolsAutomationSupport repairs ungated onboarding tools", () => {
  const source =
    "var gr=100;function xr({featureOverrides:r,threadStartKind:m=`default`}){let C=r?.[s]===!0;return[{tools:[...m===`conversational_onboarding`?[Ie]:[],...m!==`conversational_onboarding`?[...p,a]:[]]}]}";

  const patched = patchDynamicToolsAutomationSupport(source);

  assert.match(patched, /name:`automation_update`/);
  assert.match(
    patched,
    /codexWebAutomationUpdateTool,\.\.\.C&&m!==`conversational_onboarding`\?\[\.\.\.p,a\]:\[\]/,
  );
});

test("patchDynamicToolsAutomationAsset patches the app server dynamic tools chunk", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const dynamicTools = join(assetsDir, "app-server-dynamic-tools-test.js");

  await writeFile(
    join(assetsDir, "app-main-test.js"),
    'import{t as Ne}from"./automation-host-support-CMtWMs5w.js";const threadStartKind=`default`;',
  );
  await writeFile(
    dynamicTools,
    'import{t as Ne}from"./automation-host-support-CMtWMs5w.js";var gr=100;function xr({featureOverrides:r,threadStartKind:m=`default`}){let C=r?.[s]===!0;return[{tools:[...m===`conversational_onboarding`?[Ie]:[],...C&&m!==`conversational_onboarding`?[...p,a]:[]]}]}',
  );
  await writeFile(join(assetsDir, "other.js"), "const automation = true;");

  assert.equal(patchDynamicToolsAutomationAsset(assetsDir), dynamicTools);
  assert.match(
    await readFile(dynamicTools, "utf8"),
    /name:`automation_update`/,
  );
});

test("patchAutomationRemoteDefaultHostSupport lets default remote use automations", () => {
  const source =
    "case fe:{if(!Ab(n)){c=Ie(`Automations are only supported for local threads.`);break}let t=Me.safeParse(a.arguments);}";

  const patched = patchAutomationRemoteDefaultHostSupport(source);

  assert.match(
    patched,
    /if\(!Ab\(n\)&&n!==`remote:default`\)\{c=Ie\(`Automations are only supported for local threads\.`\);break\}/,
  );
  assert.equal(patchAutomationRemoteDefaultHostSupport(patched), patched);
});

test("patchAutomationRemoteDefaultHostAsset patches the automation host guard chunk", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));
  const appMain = join(assetsDir, "app-main-test.js");

  await writeFile(
    appMain,
    "case fe:{if(!Ab(n)){c=Ie(`Automations are only supported for local threads.`);break}let t=Me.safeParse(a.arguments);}",
  );

  const { patchAutomationRemoteDefaultHostAsset } =
    await import("../scripts/patch_webview_assets.mjs");

  assert.equal(patchAutomationRemoteDefaultHostAsset(assetsDir), appMain);
  assert.match(await readFile(appMain, "utf8"), /n!==`remote:default`/);
});

test("patchAutomationArgumentsNormalizationSupport normalizes common model args before validation", () => {
  const source =
    "var gr=100;case fe:{let t=Me.safeParse(a.arguments);if(!t.success){c=Ie(`${fe} received invalid arguments.`);break}run(t.data)}";

  const patched = patchAutomationArgumentsNormalizationSupport(source);

  assert.match(patched, /Me\.safeParse\(\(\(\)=>\{let e=a\.arguments;/);
  assert.match(patched, /typeof t\.cwds===`string`/);
  assert.match(patched, /t\.cwds=\[t\.cwds\]/);
  assert.match(patched, /t\.rrule\.startsWith\(`RRULE:`\)/);
  assert.equal(patchAutomationArgumentsNormalizationSupport(patched), patched);
});

test("patchAutomationArgumentsNormalizationSupport handles live app chunks without the old insertion point", () => {
  const source =
    "case fe:{if(!Ab(n)&&n!==`remote:default`){c=Ie(`Automations are only supported for local threads.`);break}let t=Me.safeParse(a.arguments);if(!t.success){c=Ie(`${fe} received invalid arguments.`);break}run(t.data)}";

  const patched = patchAutomationArgumentsNormalizationSupport(source);

  assert.match(patched, /Me\.safeParse\(\(\(\)=>\{let e=a\.arguments;/);
  assert.match(patched, /typeof t\.cwds===`string`/);
  assert.match(patched, /t\.cwds=\[t\.cwds\]/);
  assert.match(patched, /t\.rrule\.startsWith\(`RRULE:`\)/);
  assert.equal(patchAutomationArgumentsNormalizationSupport(patched), patched);
});

test("patchAutomationArgumentsNormalizationSupport fills common cron defaults for app schema", () => {
  const source =
    "case fe:{let t=Me.safeParse(a.arguments);if(!t.success){c=Ie(`${fe} received invalid arguments.`);break}run(t.data)}";

  const patched = patchAutomationArgumentsNormalizationSupport(source);

  assert.match(patched, /t\.kind==null&&\(t\.kind=`cron`\)/);
  assert.match(
    patched,
    /t\.executionEnvironment==null&&\(t\.executionEnvironment=`worktree`\)/,
  );
  assert.doesNotMatch(patched, /t\.status==null/);
  assert.doesNotMatch(patched, /t\.localEnvironmentConfigPath===void 0/);
  assert.doesNotMatch(patched, /t\.model===void 0/);
  assert.doesNotMatch(patched, /t\.reasoningEffort===void 0/);
});

test("patchAutomationArgumentsNormalizationSupport cleans common invalid model-shaped fields", () => {
  const source =
    "case fe:{let t=Me.safeParse(a.arguments);if(!t.success){c=Ie(`${fe} received invalid arguments.`);break}run(t.data)}";

  const patched = patchAutomationArgumentsNormalizationSupport(source);

  assert.match(
    patched,
    /t\.localEnvironmentConfigPath===``&&delete t\.localEnvironmentConfigPath/,
  );
  assert.match(patched, /t\.model===``&&delete t\.model/);
  assert.match(patched, /t\.reasoningEffort===``&&delete t\.reasoningEffort/);
  assert.match(
    patched,
    /t\.executionEnvironment===`local`&&\(t\.executionEnvironment=`worktree`\)/,
  );
  assert.match(
    patched,
    /t\.rrule\.split\(`\\n`\)\.find\(e=>e\.startsWith\(`RRULE:`\)\)/,
  );
});

test("patchAutomationArgumentsNormalizationSupport removes unsupported suggested setup guidance", () => {
  const source =
    "var wz=`For safety, automations created by the model cannot immediately run a worktree local environment setup script. Use suggested_create or suggested_update so the user can review and approve the setup-capable automation, or set localEnvironmentConfigPath to null.`;case fe:{let t=Me.safeParse(a.arguments);if(!t.success){c=Ie(`${fe} received invalid arguments.`);break}}";

  const patched = patchAutomationArgumentsNormalizationSupport(source);

  assert.doesNotMatch(patched, /suggested_create|suggested_update/);
  assert.match(patched, /Set localEnvironmentConfigPath to null\./);
});

test("patchAutomationDefaultModelSupport stops requiring cron model selection", () => {
  const source =
    "function _(e){let t=e.name.trim(),n=e.prompt.trim(),r=[];return t.length===0&&r.push(`name`),n.length===0&&r.push(`prompt`),e.kind===`heartbeat`?e.targetThreadId??r.push(`thread`):(e.cwds.length===0&&r.push(`cwd`),e.executionEnvironment??r.push(`executionEnvironment`),e.model??r.push(`model`)),u(e.scheduleConfig)||r.push(`schedule`),{trimmedName:t,trimmedPrompt:n,missingRequirements:r,canSave:r.length===0}}function w(e,i){let a=n({automation:e,models:i??[]});return{id:e.id,kind:e.kind,name:e.name,prompt:e.prompt,status:e.status,cwds:t(e)?[]:e.cwds,executionEnvironment:t(e)?null:r(e.executionEnvironment),localEnvironmentConfigPath:t(e)?null:e.localEnvironmentConfigPath,targetThreadId:t(e)?e.targetThreadId:null,model:t(e)?null:a.model,reasoningEffort:t(e)?null:a.reasoningEffort,rawRrule:e.rrule}}function T({seed:e,targetAutomation:a,models:c}){let d=a==null?null:n({automation:a,models:c??[]}),p=a?.kind??e.kind??`cron`;return{model:p===`heartbeat`?null:e.model??d?.model??h.model,reasoningEffort:p===`heartbeat`?null:e.reasoningEffort??d?.reasoningEffort??h.reasoningEffort,rawRrule:e.rrule}}function P({draft:e,modelSettings:t}){return e.kind===`heartbeat`?{...e,model:null,reasoningEffort:null}:t.isLoading||e.model!=null?e:{...e,model:t.model,reasoningEffort:t.reasoningEffort}}function F({draft:e,name:t,prompt:n,status:r,rrule:i}){if(e.id==null)throw Error(`Automation draft is incomplete`);if(e.kind===`heartbeat`){if(e.targetThreadId==null)throw Error(`Heartbeat automation draft is incomplete`);return{id:e.id,kind:`heartbeat`,name:t,prompt:n,status:r,targetThreadId:e.targetThreadId,model:null,reasoningEffort:null,rrule:i}}if(e.executionEnvironment==null||e.model==null)throw Error(`Cron automation draft is incomplete`);return{id:e.id,kind:`cron`,name:t,prompt:n,status:r,cwds:e.cwds,executionEnvironment:e.executionEnvironment,localEnvironmentConfigPath:e.localEnvironmentConfigPath,model:e.model,reasoningEffort:e.reasoningEffort,rrule:i}}";

  const patched = patchAutomationDefaultModelSupport(source);

  assert.doesNotMatch(patched, /model`\)/);
  assert.doesNotMatch(patched, /modelSettings|model:t\.model|reasoningEffort:t\.reasoningEffort/);
  assert.doesNotMatch(patched, /let a=n\(\{automation:e|let d=a==null\?null:n\(\{automation:a/);
  assert.doesNotMatch(patched, /e\.model==null\)throw Error\(`Cron automation draft is incomplete`\)/);
  assert.doesNotMatch(patched, /model:e\.model,reasoningEffort:e\.reasoningEffort|model:null,reasoningEffort:null/);
  assert.match(patched, /model:t\(e\)\?null:e\.model\?\?null/);
  assert.match(patched, /let d=a==null\?null:\{model:a\.model\?\?null,reasoningEffort:a\.reasoningEffort\?\?null\}/);
  assert.match(patched, /\.\.\.e\.model==null\?\{\}:\{model:e\.model\}/);
  assert.match(patched, /e\.executionEnvironment\?\?r\.push\(`executionEnvironment`\)/);
  assert.equal(patchAutomationDefaultModelSupport(patched), patched);
});

test("patchAutomationDefaultModelAsset skips browser builds without automation shared chunk", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));

  try {
    await writeFile(join(assetsDir, "preload.js"), "const browserBuild = true;");

    assert.deepEqual(patchAutomationDefaultModelAsset(assetsDir), []);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("patchAutomationModelPickerSupport shows default model without persisting it", () => {
  const source =
    "function Lt({selectedModel:n,reasoningEffort:r,align:i,className:a,onSelect:o}=e){let c=p(),{data:l}=E(),u,f;if(t[0]!==l?.models||t[1]!==r||t[2]!==n){u=l?.models.find(e=>e.model===n)??null;let e=d({model:u,reasoningEffort:r});f=T(e)?e:null,t[0]=l?.models,t[1]=r,t[2]=n,t[3]=u,t[4]=f}else u=t[3],f=t[4];let m=f,h=n==null||l?.models==null,v=n??``,y=l?.models,b;t[5]!==o||t[6]!==n?(b=e=>{n!=null&&o(n,e)},t[5]=o,t[6]=n,t[7]=b):b=t[7];let w;t[12]!==c||t[13]!==n||t[14]!==u?.displayName?(w=n!=null&&n.trim().length>0?(0,Y.jsx)(we,{model:n,displayName:u?.displayName??n,labelClassName:`text-token-foreground`}):(0,Y.jsx)(`span`,{className:`truncate text-token-foreground`,children:c.formatMessage({id:`settings.automations.model.loading`,defaultMessage:`Loading model`,description:`Fallback label while automation model options are loading`})}),t[12]=c,t[13]=n,t[14]=u?.displayName,t[15]=w):w=t[15];return (0,Y.jsx)(Te,{disabled:h,model:v,models:y,reasoningEffort:m,onSelectModel:o,onSelectReasoningEffort:b})}";

  const patched = patchAutomationModelPickerSupport(source);

  assert.match(patched, /model===\(n\?\?l\?\.defaultModel\?\.model\)/);
  assert.match(patched, /h=l\?\.models==null/);
  assert.match(patched, /v=n\?\?l\?\.defaultModel\?\.model\?\?``/);
  assert.match(patched, /v\.trim\(\)\.length>0&&o\(v,e\)/);
  assert.match(patched, /model:v,displayName:u\?\.displayName\?\?v/);
  assert.equal(patchAutomationModelPickerSupport(patched), patched);
});

test("patchAutomationModelPickerAsset skips locale chunks with the same loading text", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));

  try {
    const localeAsset = join(assetsDir, "en-US.js");
    const dialogAsset = join(assetsDir, "automation-dialog.js");
    await writeFile(
      localeAsset,
      "export default {'settings.automations.model.loading':'Loading model'};",
    );
    await writeFile(
      dialogAsset,
      "function Lt({selectedModel:n,reasoningEffort:r,align:i,className:a,onSelect:o}=e){let c=p(),{data:l}=E(),u,f;if(t[0]!==l?.models||t[1]!==r||t[2]!==n){u=l?.models.find(e=>e.model===n)??null;let e=d({model:u,reasoningEffort:r});f=T(e)?e:null,t[0]=l?.models,t[1]=r,t[2]=n,t[3]=u,t[4]=f}else u=t[3],f=t[4];let m=f,h=n==null||l?.models==null,v=n??``,y=l?.models,b;t[5]!==o||t[6]!==n?(b=e=>{n!=null&&o(n,e)},t[5]=o,t[6]=n,t[7]=b):b=t[7];let S;t[8]===c?S=t[9]:(S=c.formatMessage({id:`settings.automations.modelAndReasoning.ariaLabel`,defaultMessage:`Model and reasoning`,description:`Aria label for automation model and reasoning dropdown`}),t[8]=c,t[9]=S);let w;t[12]!==c||t[13]!==n||t[14]!==u?.displayName?(w=n!=null&&n.trim().length>0?(0,Y.jsx)(we,{model:n,displayName:u?.displayName??n,labelClassName:`text-token-foreground`}):(0,Y.jsx)(`span`,{className:`truncate text-token-foreground`,children:c.formatMessage({id:`settings.automations.model.loading`,defaultMessage:`Loading model`,description:`Fallback label while automation model options are loading`})}),t[12]=c,t[13]=n,t[14]=u?.displayName,t[15]=w):w=t[15];return (0,Y.jsx)(Te,{disabled:h,model:v,models:y,reasoningEffort:m,onSelectModel:o,onSelectReasoningEffort:b})}",
    );

    assert.deepEqual(patchAutomationModelPickerAsset(assetsDir), [dialogAsset]);

    const locale = await readFile(localeAsset, "utf8");
    const dialog = await readFile(dialogAsset, "utf8");
    assert.match(locale, /Loading model/);
    assert.match(dialog, /v=n\?\?l\?\.defaultModel\?\.model\?\?``/);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("patchAutomationToolContractSupport accepts minimal cron create and list view", () => {
  const source =
    "var eh=zt([`view`,`create`,`update`,`delete`,`suggested_create`,`suggested_update`]).transform(e=>{switch(e){case`view`:return`view`;case`create`:return`create`;case`update`:return`update`;case`delete`:return`delete`;case`suggested_create`:return`suggested-create`;case`suggested_update`:return`suggested-update`}}),oh=It({id:nh.optional(),kind:it.optional(),mode:eh,name:nh.optional(),prompt:nh.optional(),rrule:nh.optional(),cwds:ah.optional(),executionEnvironment:rh.optional(),model:nh.optional(),reasoningEffort:ct.optional(),status:th.optional()}).superRefine((e,t)=>{if(e.mode===`view`||e.mode===`delete`){e.id??t.addIssue({code:`custom`,message:`Missing id`,path:[`id`]});return}if((e.mode===`create`||e.mode===`suggested-create`)&&e.id!=null&&t.addIssue({code:`custom`,message:`Unexpected id`,path:[`id`]}),(e.mode===`update`||e.mode===`suggested-update`)&&e.id==null&&t.addIssue({code:`custom`,message:`Missing id`,path:[`id`]}),e.kind??t.addIssue({code:`custom`,message:`Missing kind`,path:[`kind`]}),e.name??t.addIssue({code:`custom`,message:`Missing name`,path:[`name`]}),e.prompt??t.addIssue({code:`custom`,message:`Missing prompt`,path:[`prompt`]}),e.rrule??t.addIssue({code:`custom`,message:`Missing rrule`,path:[`rrule`]}),e.status??t.addIssue({code:`custom`,message:`Missing status`,path:[`status`]}),e.kind===`heartbeat`){return}e.cwds??t.addIssue({code:`custom`,message:`Missing cwds`,path:[`cwds`]}),e.executionEnvironment??t.addIssue({code:`custom`,message:`Missing executionEnvironment`,path:[`executionEnvironment`]}),e.model??t.addIssue({code:`custom`,message:`Missing model`,path:[`model`]}),e.reasoningEffort??t.addIssue({code:`custom`,message:`Missing reasoningEffort`,path:[`reasoningEffort`]})}),uh={name:sh,description:`Use suggested_create or suggested_update.`,inputSchema:{type:`object`,properties:{id:{type:`string`,description:`Required for mode=view, mode=update, mode=delete, and mode=suggested_update. Omit for mode=create and mode=suggested_create.`},mode:{type:`string`,description:`One of view, create, update, delete, suggested_create, or suggested_update.`},model:{type:`string`,description:`Model to use for cron automations.`},reasoningEffort:{type:`string`,description:`Reasoning effort to use for cron automations.`}}}};function hh(e,t){return e.kind===`heartbeat`?{kind:`heartbeat`,name:e.name??``,prompt:e.prompt??``,targetThreadId:e.targetThreadId??t,model:null,reasoningEffort:null,rrule:e.rrule??``}:{kind:`cron`,name:e.name??``,prompt:e.prompt??``,cwds:e.cwds?.map(V)??[],executionEnvironment:e.executionEnvironment??`worktree`,localEnvironmentConfigPath:e.localEnvironmentConfigPath??null,model:e.model??null,reasoningEffort:e.reasoningEffort??null,rrule:e.rrule??``}}";

  const patched = patchAutomationToolContractSupport(source);

  assert.match(patched, /zt\(\[`view`,`create`,`update`,`delete`\]\)/);
  assert.doesNotMatch(patched, /Missing kind|Missing status|Missing executionEnvironment|Missing model|Missing reasoningEffort/);
  assert.doesNotMatch(patched, /e\.mode===`view`\|\|e\.mode===`delete`/);
  assert.doesNotMatch(patched, /suggested_create|suggested_update|suggested-create|suggested-update/);
  assert.match(patched, /Do not set model or reasoningEffort unless explicitly requested/);
  assert.doesNotMatch(patched, /model:e\.model\?\?null|reasoningEffort:e\.reasoningEffort\?\?null|model:null,reasoningEffort:null/);
  assert.match(patched, /\.\.\.e\.model===void 0\?\{\}:\{model:e\.model\}/);
});

test("patchAutomationToolContractAsset is idempotent after validation was already patched", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-assets-"));

  try {
    const assetPath = join(assetsDir, "thread-context-inputs.js");
    await writeFile(
      assetPath,
      "uh={inputSchema:{properties:{id:{description:`Automation id. Required for mode=view, mode=update, mode=delete. Omit for mode=create.`},mode:{description:`One of view, create, update, delete. Use view to show an existing automation, create/update/delete to mutate immediately, and create/update to present a proposal for the user to review.`},kind:{description:`Required for create, update, suggested_create, and suggested_update.`}}}}",
    );

    assert.deepEqual(patchAutomationToolContractAsset(assetsDir), [assetPath]);
    assert.deepEqual(patchAutomationToolContractAsset(assetsDir), [assetPath]);

    const patched = await readFile(assetPath, "utf8");
    assert.doesNotMatch(patched, /suggested_create|suggested_update/);
    assert.doesNotMatch(patched, /Required for mode=view/);
    assert.match(patched, /Use view to list automations/);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});
