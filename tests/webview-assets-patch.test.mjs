import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  patchInvalidCssPropertyInitialValuesAsset,
  patchInvalidCssPropertyInitialValuesSupport,
  patchRefetchQueriesCancelRefetchAsset,
  patchRefetchQueriesCancelRefetchSupport,
  patchStatsigTelemetryDisableAsset,
  patchStatsigTelemetryFlushDisableAsset,
  patchStatsigTelemetryFlushDisableSupport,
  patchStatsigTelemetryDisableSupport,
  patchDynamicToolsAutomationAsset,
  patchDynamicToolsAutomationSupport,
  patchAutomationArgumentsNormalizationSupport,
  patchAutomationRemoteDefaultHostSupport,
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

  const { patchAutomationRemoteDefaultHostAsset } = await import(
    "../scripts/patch_webview_assets.mjs"
  );

  assert.equal(patchAutomationRemoteDefaultHostAsset(assetsDir), appMain);
  assert.match(
    await readFile(appMain, "utf8"),
    /n!==`remote:default`/,
  );
});

test("patchAutomationArgumentsNormalizationSupport normalizes common model args before validation", () => {
  const source =
    "var gr=100;case fe:{let t=Me.safeParse(a.arguments);if(!t.success){c=Ie(`${fe} received invalid arguments.`);break}run(t.data)}";

  const patched = patchAutomationArgumentsNormalizationSupport(source);

  assert.match(
    patched,
    /Me\.safeParse\(\(\(\)=>\{let e=a\.arguments;/,
  );
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
  assert.match(patched, /t\.status==null&&\(t\.status=`ACTIVE`\)/);
  assert.match(
    patched,
    /t\.executionEnvironment==null&&\(t\.executionEnvironment=`worktree`\)/,
  );
  assert.match(
    patched,
    /t\.localEnvironmentConfigPath===void 0&&\(t\.localEnvironmentConfigPath=null\)/,
  );
  assert.match(patched, /t\.model===void 0&&\(t\.model=null\)/);
  assert.match(patched, /t\.reasoningEffort===void 0&&\(t\.reasoningEffort=null\)/);
});

test("patchAutomationArgumentsNormalizationSupport cleans common invalid model-shaped fields", () => {
  const source =
    "case fe:{let t=Me.safeParse(a.arguments);if(!t.success){c=Ie(`${fe} received invalid arguments.`);break}run(t.data)}";

  const patched = patchAutomationArgumentsNormalizationSupport(source);

  assert.match(patched, /t\.localEnvironmentConfigPath===``&&\(t\.localEnvironmentConfigPath=null\)/);
  assert.match(patched, /t\.model===``&&\(t\.model=null\)/);
  assert.match(patched, /t\.reasoningEffort===``&&\(t\.reasoningEffort=null\)/);
  assert.match(
    patched,
    /t\.executionEnvironment===`local`&&\(t\.executionEnvironment=`worktree`\)/,
  );
  assert.match(
    patched,
    /t\.rrule\.split\(`\\n`\)\.find\(e=>e\.startsWith\(`RRULE:`\)\)/,
  );
});
