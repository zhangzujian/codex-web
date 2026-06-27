import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkPatchedJavaScriptFilesSyntax } from "../scripts/patch_webview_assets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(repoRoot, "scratch/asar/webview/assets");
const require = createRequire(import.meta.url);

const PATCH_TARGETS = [
  {
    name: "thread delete menu and i18n",
    positive: [
      "Remove chat",
      "threadHeader.deleteThread",
      "threadHeader.deleteThreadConfirm.title",
      "threadHeader.deleteThreadConfirm.body",
      "移除对话",
    ],
  },
  {
    name: "terminal side panel uses native persistent panels",
    positive: ["codexWebRenderTerminalPanels", "data-codex-terminal"],
  },
  {
    name: "browser panel uses iframe shim instead of webview",
    positive: [
      "data-codex-web-browser-panel-frame",
      "codexWebCreateBrowserPanelFrame",
      "codexWebSetBrowserPanelFrameSrc",
    ],
  },
  {
    name: "refetchQueries keeps existing requests",
    positive: [/refetchQueries\s*\([^)]*\)\s*\{[\s\S]*?cancelRefetch:[^}]*\?\?(!1|false)/],
    negative: [/refetchQueries\s*\([^)]*\)\s*\{[\s\S]*?cancelRefetch:[^}]*\?\?(!0|true)/],
  },
  {
    name: "Statsig telemetry cannot send or store disabled events",
    positive: [
      "window.__ELECTRON_SHIM__.overrideAdapter",
      "preventAllNetworkTraffic:true",
      "disableLogging:true",
      "_loggingEnabled===`disabled`)return",
    ],
    negative: ["returnthis", /_loggingEnabled===`disabled`\)\{this\._storeEventToStorage/],
  },
  {
    name: "webview telemetry adapter is disabled",
    positive: [
      "window.__ELECTRON_SHIM__.overrideAdapter",
      "disableLogging:true",
      "preventAllNetworkTraffic:true",
    ],
  },
  {
    name: "turn streaming avoids stale memoized turn rendering",
    positive: [
      /[$A-Za-z_][\w$]*=function\(e\)\{[\s\S]{0,2400}?mcpTurn:[^,]+,turn:/,
      /o\?\?[$A-Za-z_][\w$]*\(a,s\?\?[$A-Za-z_][\w$]*,\{isBackgroundSubagentsEnabled:[^,]+,preserveServerUserMessages:[^}]+\}\)/,
    ],
  },
  {
    name: "automation tool contract supports remote default",
    positive: [
      "automation_update",
      "Create, update, view, or delete recurring automations",
      "remote:default",
      "executionEnvironment===`local`",
      "executionEnvironment=`worktree`",
      "kind:`cron`",
    ],
  },
  {
    name: "mobile sidebar uses visual viewport, screen width, and touch hints",
    positive: [
      "Math.min(window.innerWidth,window.visualViewport?.width??window.innerWidth,window.screen?.width??window.innerWidth)",
      "globalThis.navigator?.maxTouchPoints>0",
      "<=1440",
      "rightPanelAnimatedWidth",
    ],
  },
  {
    name: "mobile tab layout reserves sticky action space",
    positive: [
      "scrollPaddingInlineEnd:",
      "paddingInlineEnd:",
      "window.visualViewport?.width??window.innerWidth,window.screen?.width??window.innerWidth",
    ],
  },
  {
    name: "app header does not render desktop history navigation buttons",
    positive: [
      "viewTransitionName:`sidebar-trigger`",
      "sidebar_back",
      "sidebar_forward",
    ],
  },
];

function loadPlaywright() {
  const packagePaths = [
    process.env.PLAYWRIGHT_PACKAGE_PATH,
    "playwright",
    path.join(
      repoRoot,
      "scratch/Codex.app/Contents/Resources/cua_node/lib/node_modules/playwright",
    ),
  ].filter(Boolean);

  for (const packagePath of packagePaths) {
    try {
      return require(packagePath);
    } catch (error) {
      if (
        error?.code !== "MODULE_NOT_FOUND" &&
        error?.code !== "ERR_MODULE_NOT_FOUND"
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    "Playwright is required. Set PLAYWRIGHT_PACKAGE_PATH or run ./scripts/prepare first.",
  );
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function startServer(t, token, extraEnv = {}) {
  const port = await getFreePort();
  const child = spawn(
    process.execPath,
    [
      "src/server/main.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--auth-token",
      token,
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        CODEX_CLI_PATH: process.env.CODEX_CLI_PATH ?? "codex",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(() => {
    child.kill("SIGTERM");
  });

  const output = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => output.push(chunk));
  child.stderr.on("data", (chunk) => output.push(chunk));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`server did not start\n${output.join("")}`));
    }, 20_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`server exited early (${code ?? signal})\n${output.join("")}`));
    });
    child.stdout.on("data", (chunk) => {
      if (chunk.includes("IPC bridge listening at")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  return `http://127.0.0.1:${port}`;
}

async function authenticate(page, baseURL, token) {
  const response = await page.request.post(new URL("/__auth/session", baseURL).href, {
    data: { token },
  });
  assert.equal(response.status(), 200, await response.text());
}

async function fetchServedAssetSources(page, assetNames) {
  return await page.evaluate(async (assetNames) => {
    const sources = [];
    for (const name of assetNames) {
      const response = await fetch(`/assets/${encodeURIComponent(name)}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${name}: HTTP ${response.status}`);
      }
      sources.push({ name, text: await response.text() });
    }
    return sources;
  }, assetNames);
}

function assertPatchTarget(target, combinedSource) {
  for (const marker of target.positive ?? []) {
    if (marker instanceof RegExp) {
      assert.match(combinedSource, marker, `${target.name}: missing ${marker}`);
    } else {
      assert.ok(
        combinedSource.includes(marker),
        `${target.name}: missing ${JSON.stringify(marker)}`,
      );
    }
  }
  for (const marker of target.negative ?? []) {
    if (marker instanceof RegExp) {
      assert.doesNotMatch(combinedSource, marker, `${target.name}: stale ${marker}`);
    } else {
      assert.ok(
        !combinedSource.includes(marker),
        `${target.name}: stale ${JSON.stringify(marker)}`,
      );
    }
  }
}

function assertSettingsAllSettingsAssetPatch(sources) {
  const settingsAsset = sources.find(({ text }) =>
    [
      "settings.hostDropdown.allSettings",
      "groupSettingsSections:!0",
      "Ge.filter",
      "case`connections`",
    ].every((marker) => text.includes(marker)),
  );

  assert.ok(settingsAsset, "served settings page asset should contain section grouping logic");
  assert.match(
    settingsAsset.text,
    /case`connections`:return [$A-Za-z_][\w$]*(?=;case`usage`:)/,
    `${settingsAsset.name}: Connections should stay visible in All settings`,
  );
  assert.doesNotMatch(
    settingsAsset.text,
    /case`connections`:return [$A-Za-z_][\w$]*&&![$A-Za-z_][\w$]*(?=;case`usage`:)/,
    `${settingsAsset.name}: stale All settings Connections guard`,
  );
  assert.match(
    settingsAsset.text,
    /[$A-Za-z_][\w$]*=\[(?=[^\]]*`profile`)(?=[^\]]*`agent`)(?=[^\]]*`mcp-settings`)(?=[^\]]*`hooks-settings`)(?=[^\]]*`data-controls`)(?=[^\]]*`connections`)[^\]]*\],[$A-Za-z_][\w$]*=`agent`/,
    `${settingsAsset.name}: Connections should pass host-specific settings filtering`,
  );
}

function assertSettingsArchivedChatsAssetPatch(sources) {
  const dataControlsAsset = sources.find(({ text }) =>
    [
      "settings.dataControls.archivedChats.empty",
      "queryKey:[`archived-threads`,",
      "localThreads:",
    ].every((marker) => text.includes(marker)),
  );

  assert.ok(dataControlsAsset, "served data controls asset should contain archived chats");
  assert.match(
    dataControlsAsset.text,
    /\([$A-Za-z_][\w$]*===`local`\|\|[$A-Za-z_][\w$]*===`remote:default`\)\?[$A-Za-z_][\w$]*:\[\]/,
    `${dataControlsAsset.name}: default remote should show local archived chats`,
  );
  assert.doesNotMatch(
    dataControlsAsset.text,
    /\blet\s+[$A-Za-z_][\w$]*=[$A-Za-z_][\w$]*===`local`\?[$A-Za-z_][\w$]*:\[\](?=,)/,
    `${dataControlsAsset.name}: stale local-only archived chats guard`,
  );
}

async function assertRemoteDefaultRuntime(page, expectedSshHost) {
  const runtime = await page.evaluate(() => ({
    injectedSshHost: window.__CODEX_WEB_REMOTE_SSH_HOST__,
    hostConfig: window.electronBridge?.getSharedObjectSnapshotValue("host_config"),
    remoteConnections:
      window.electronBridge?.getSharedObjectSnapshotValue("remote_connections"),
    remoteSshConnections:
      window.electronBridge?.getSharedObjectSnapshotValue(
        "remote_ssh_connections",
      ),
  }));

  assert.equal(runtime.injectedSshHost, expectedSshHost);
  assert.deepEqual(runtime.hostConfig, {
    display_name: "Remote",
    id: "remote:default",
    kind: "ssh",
  });
  for (const connections of [
    runtime.remoteConnections,
    runtime.remoteSshConnections,
  ]) {
    assert.equal(connections?.length, 1);
    assert.equal(connections[0].hostId, "remote:default");
    assert.equal(connections[0].displayName, "Remote");
    assert.equal(connections[0].sshHost, "remote");
    assert.equal(connections[0].autoConnect, true);
  }
}

async function assertSettingsConnectionsRuntime(page) {
  const runtime = await page.evaluate(() => ({
    hostConfig: window.electronBridge?.getSharedObjectSnapshotValue("host_config"),
    initialRoute: window.__ELECTRON_SHIM__?.initialRoute,
    pathname: window.location.pathname,
  }));

  assert.equal(runtime.pathname, "/settings/connections");
  assert.equal(runtime.initialRoute, "/settings/connections");
  assert.deepEqual(runtime.hostConfig, {
    display_name: "Local",
    id: "local",
    kind: "local",
  });
}

function assertAppHeaderNavigationButtonsRenderPatch(sources) {
  const appShellAsset = sources.find(({ text }) =>
    [
      "viewTransitionName:`sidebar-trigger`",
      "sidebar_back",
      "sidebar_forward",
    ].every((marker) => text.includes(marker)),
  );
  assert.ok(appShellAsset, "served app shell asset should contain header controls");

  assert.match(
    appShellAsset.text,
    /viewTransitionName:`sidebar-trigger`[\s\S]{0,3600}?className:`flex items-center gap-1`,children:\[[$A-Za-z_][\w$]*\]\}/,
    `${appShellAsset.name}: header should render sidebar trigger only`,
  );
  assert.doesNotMatch(
    appShellAsset.text,
    /viewTransitionName:`sidebar-trigger`[\s\S]{0,3600}?className:`flex items-center gap-1`,children:\[[$A-Za-z_][\w$]*,[$A-Za-z_][\w$]*\]\}/,
    `${appShellAsset.name}: stale header history button group render`,
  );
}

function assertStatsigNoopClientOverridePatch(sources) {
  const statsigAsset = sources.find(({ text }) =>
    text.includes("Attempting to retrieve a StatsigClient but none was set."),
  );
  assert.ok(statsigAsset, "served Statsig asset should contain noop client fallback");

  assert.match(
    statsigAsset.text,
    /function codexWebStatsigNoopClient\(e\)/,
    `${statsigAsset.name}: noop Statsig client wrapper should be present`,
  );
  assert.match(
    statsigAsset.text,
    /codexWebStatsigNoopClient\([$A-Za-z_][\w$]*\.NoopEvaluationsClient\)/,
    `${statsigAsset.name}: noop Statsig client should route through browser overrides`,
  );
  assert.doesNotMatch(
    statsigAsset.text,
    /\(.*?\.Log\.warn\(`Attempting to retrieve a StatsigClient but none was set\.`\),\s*[$A-Za-z_][\w$]*\.NoopEvaluationsClient\s*\)/,
    `${statsigAsset.name}: stale noop Statsig fallback`,
  );
}

async function assertNonRemoteRuntimeShims(page, expectedTerminalFont) {
  const runtime = await page.evaluate(() => ({
    appSessionId: window.electronBridge?.getAppSessionId(),
    backendToken: window.__CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__,
    buildFlavor: window.electronBridge?.getBuildFlavor(),
    codexWindowType: window.codexWindowType,
    hasApplicationMenuBridge:
      "showApplicationMenu" in (window.electronBridge ?? {}),
    intelMacBuild: window.electronBridge?.isIntelMacBuild(),
    owlAppShell: window.electronBridge?.usesOwlAppShell(),
    sentry: window.electronBridge?.getSentryInitOptions(),
    statsigGate:
      window.__ELECTRON_SHIM__?.overrideAdapter?.getGateOverride({
        name: "3075919032",
        value: false,
      }),
    systemTheme: window.electronBridge?.getSystemThemeVariant(),
    terminalFont: window.__CODEX_WEB_TERMINAL_FONT__,
  }));

  assert.equal(runtime.codexWindowType, "electron");
  assert.equal(runtime.terminalFont, expectedTerminalFont);
  assert.equal(typeof runtime.backendToken, "string");
  assert.ok(runtime.backendToken.length > 0);
  assert.equal(runtime.sentry.enabled, false);
  assert.equal(runtime.sentry.appVersion, "26.623.31921");
  assert.equal(runtime.appSessionId, runtime.sentry.codexAppSessionId);
  assert.equal(typeof runtime.buildFlavor, "string");
  assert.equal(runtime.owlAppShell, false);
  assert.equal(runtime.intelMacBuild, false);
  assert.match(runtime.systemTheme, /^(dark|light)$/);
  assert.deepEqual(runtime.statsigGate, {
    name: "3075919032",
    value: true,
  });
  assert.equal(runtime.hasApplicationMenuBridge, false);
}

test(
  "served webview assets and runtime shims satisfy every patch target",
  { timeout: 90_000 },
  async (t) => {
    const assetNames = fs
      .readdirSync(assetsDir)
      .filter((name) => name.endsWith(".js"))
      .sort();
    assert.ok(assetNames.length > 0, "prepared webview JavaScript assets should exist");
    checkPatchedJavaScriptFilesSyntax(
      assetNames.map((name) => path.join(assetsDir, name)),
    );

    const token = `asset-patch-e2e-${Date.now()}`;
    const remoteSshHost = `e2e-remote-${Date.now()}.example`;
    const terminalFont = "MesloLGS NF";
    const baseURL = await startServer(t, token, {
      CODEX_WEB_REMOTE_SSH_HOST: remoteSshHost,
      CODEX_WEB_TERMINAL_FONT: terminalFont,
    });
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await authenticate(page, baseURL, token);
      const rootResponse = await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      assert.equal(rootResponse?.status(), 200);
      assert.ok(
        await page.evaluate(() => Boolean(window.__CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__)),
        "root app shell should inject the web backend runtime",
      );
      await assertRemoteDefaultRuntime(page, remoteSshHost);
      await assertNonRemoteRuntimeShims(page, terminalFont);

      const settingsResponse = await page.goto(
        new URL("/settings/connections", baseURL).href,
        { waitUntil: "domcontentloaded" },
      );
      assert.equal(settingsResponse?.status(), 200);
      await assertSettingsConnectionsRuntime(page);

      const sources = await fetchServedAssetSources(page, assetNames);
      assertSettingsAllSettingsAssetPatch(sources);
      assertSettingsArchivedChatsAssetPatch(sources);
      assertAppHeaderNavigationButtonsRenderPatch(sources);
      assertStatsigNoopClientOverridePatch(sources);
      const combinedSource = sources
        .map(({ name, text }) => `\n/* ${name} */\n${text}`)
        .join("\n");
      for (const target of PATCH_TARGETS) {
        assertPatchTarget(target, combinedSource);
      }
    } finally {
      await browser.close();
    }
  },
);
