import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const assetsRoot = path.join(repoRoot, "scratch/asar/webview/assets");
const require = createRequire(import.meta.url);

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

async function authenticate(page, baseURL, token) {
  const authResponse = await page.request.post(
    new URL("/__auth/session", baseURL).href,
    { data: { token } },
  );
  assert.equal(
    authResponse.status(),
    200,
    await authResponse.text().catch(() => "authentication failed"),
  );
}

async function withPage(t, path = "/") {
  const token = process.env.CODEX_WEB_AUTH_TOKEN;
  if (!token) {
    t.skip("Set CODEX_WEB_AUTH_TOKEN for the running codex-web service.");
    return null;
  }

  const baseURL = process.env.CODEX_WEB_URL ?? "https://127.0.0.1:9443";
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
  });
  await authenticate(page, baseURL, token);
  await page.goto(new URL(path, baseURL).href, {
    waitUntil: "domcontentloaded",
  });
  t.after(() => browser.close());
  return { baseURL, page };
}

function assetName(pattern, includes = []) {
  const matches = fs
    .readdirSync(assetsRoot)
    .filter((name) => pattern.test(name))
    .filter((name) => {
      const source = fs.readFileSync(path.join(assetsRoot, name), "utf8");
      return includes.every((needle) => source.includes(needle));
    });
  assert.equal(matches.length, 1, `expected one asset for ${pattern}`);
  return matches[0];
}

function assetNamesWith(needle) {
  return fs
    .readdirSync(assetsRoot)
    .filter((name) => name.endsWith(".js"))
    .filter((name) =>
      fs.readFileSync(path.join(assetsRoot, name), "utf8").includes(needle),
    );
}

test(
  "webview shell exposes route, preload, and runtime compatibility before app assets",
  { timeout: 45_000 },
  async (t) => {
    const ctx = await withPage(t, "/thread/codex-web-e2e-route?e2e=1#dom");
    if (!ctx) return;

    await ctx.page.waitForFunction(
      () => window.__ELECTRON_SHIM__?.initialRoute,
    );
    const state = await ctx.page.evaluate(() => {
      const scripts = [...document.scripts].map((script) => ({
        inline: script.src.length === 0,
        src: script.getAttribute("src"),
        text: script.textContent ?? "",
        type: script.getAttribute("type"),
      }));
      const preloadIndex = scripts.findIndex((script) =>
        script.src?.endsWith("/assets/preload.js"),
      );
      const appIndex = scripts.findIndex(
        (script) =>
          script.type === "module" &&
          script.src?.startsWith("./assets/") &&
          !script.src.endsWith("/assets/preload.js"),
      );
      const shim = window.__ELECTRON_SHIM__;

      return {
        cspMetaCount: document.querySelectorAll(
          'meta[http-equiv="Content-Security-Policy" i]',
        ).length,
        ctrlWShimInstalled: window.__CODEX_WEB_TERMINAL_CTRL_W_SHIM__ === true,
        initialRoute: shim?.initialRoute,
        initialSidebarStateType: typeof shim?.initialSidebarState,
        manifestCrossorigin:
          document
            .querySelector('link[rel="manifest"]')
            ?.getAttribute("crossorigin") ?? null,
        overrideOff: shim?.overrideAdapter?.getGateOverride({
          name: "2929582856",
          value: true,
        })?.value,
        overrideOn: shim?.overrideAdapter?.getGateOverride({
          name: "3075919032",
          value: false,
        })?.value,
        preloadBeforeApp:
          preloadIndex >= 0 && appIndex >= 0 && preloadIndex < appIndex,
        websocketTokenType: typeof window.__CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__,
      };
    });

    assert.equal(state.initialRoute, "/local/codex-web-e2e-route");
    assert.equal(state.initialSidebarStateType, "boolean");
    assert.equal(state.cspMetaCount, 0);
    assert.ok(
      state.manifestCrossorigin == null ||
        state.manifestCrossorigin === "use-credentials",
    );
    assert.equal(state.preloadBeforeApp, true);
    assert.equal(state.ctrlWShimInstalled, true);
    assert.equal(state.websocketTokenType, "string");
    assert.equal(state.overrideOn, true);
    assert.equal(state.overrideOff, false);
  },
);

test(
  "runtime DOM shims hide sidebar history controls and keep terminal Ctrl+W local",
  { timeout: 45_000 },
  async (t) => {
    const ctx = await withPage(t);
    if (!ctx) return;

    const result = await ctx.page.evaluate(async () => {
      const trigger = document.createElement("button");
      const controls = document.createElement("div");
      trigger.style.cssText = "view-transition-name: sidebar-trigger";
      document.body.append(trigger, controls);
      for (let i = 0; i < 20; i += 1) {
        if (controls.hasAttribute("data-codex-web-hidden-sidebar-history")) {
          break;
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      let globalKeydownCalls = 0;
      window.addEventListener("keydown", () => {
        globalKeydownCalls += 1;
      });

      const terminal = document.createElement("div");
      terminal.setAttribute("data-codex-terminal", "true");
      const input = document.createElement("textarea");
      terminal.append(input);
      document.body.append(terminal);

      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "KeyW",
        ctrlKey: true,
        key: "w",
      });
      input.dispatchEvent(event);

      return {
        controlsDisplay: controls.style.display,
        controlsHidden: controls.hidden,
        controlsMarker: controls.getAttribute(
          "data-codex-web-hidden-sidebar-history",
        ),
        defaultPrevented: event.defaultPrevented,
        globalKeydownCalls,
      };
    });

    assert.equal(result.controlsHidden, true);
    assert.equal(result.controlsDisplay, "none");
    assert.equal(result.controlsMarker, "true");
    assert.equal(result.defaultPrevented, true);
    assert.equal(result.globalKeydownCalls, 0);
  },
);

test(
  "preload exposes sanitized Electron bridge values in the browser runtime",
  { timeout: 45_000 },
  async (t) => {
    const ctx = await withPage(t, "/settings");
    if (!ctx) return;

    await ctx.page.waitForFunction(() => window.electronBridge);
    const state = await ctx.page.evaluate(async () => {
      const bridge = window.electronBridge;
      const sentryIpcResponse = await fetch("sentry-ipc://codex-web/e2e");
      const sentryOptions = bridge.getSentryInitOptions();
      const hostConfig = bridge.getSharedObjectSnapshotValue("host_config");
      const remoteConnections = bridge.getSharedObjectSnapshotValue(
        "remote_ssh_connections",
      );
      const featureFlags = bridge.getSharedObjectSnapshotValue(
        "statsig_default_enable_features",
      );

      return {
        appSessionId: bridge.getAppSessionId(),
        buildFlavor: bridge.getBuildFlavor(),
        codexWindowType: window.codexWindowType,
        hasGetPathForFile: typeof bridge.getPathForFile === "function",
        hasSendMessageFromView:
          typeof bridge.sendMessageFromView === "function",
        hasShowApplicationMenu: "showApplicationMenu" in bridge,
        hostConfig,
        remoteConnections,
        sentryIpcStatus: sentryIpcResponse.status,
        sentryOptions,
        systemTheme: bridge.getSystemThemeVariant(),
        usesOwlAppShell: bridge.usesOwlAppShell(),
        featureFlags,
      };
    });

    assert.equal(state.codexWindowType, "electron");
    assert.equal(state.hasShowApplicationMenu, false);
    assert.equal(state.hasGetPathForFile, true);
    assert.equal(state.hasSendMessageFromView, true);
    assert.equal(state.buildFlavor, "prod");
    assert.equal(state.usesOwlAppShell, false);
    assert.equal(state.sentryIpcStatus, 204);
    assert.equal(state.sentryOptions.enabled, false);
    assert.equal(state.sentryOptions.codexAppSessionId, state.appSessionId);
    assert.match(state.appSessionId, /^[0-9a-f-]{36}$/);
    assert.match(state.systemTheme, /^(dark|light)$/);
    assert.deepEqual(state.hostConfig, {
      display_name: "Local",
      id: "local",
      kind: "local",
    });
    assert.deepEqual(state.remoteConnections, [
      {
        autoConnect: true,
        displayName: "Remote",
        hostId: "remote:default",
        identity: null,
        source: "codex-web",
        sshAlias: null,
        sshHost: "remote",
        sshPort: null,
      },
    ]);
    assert.equal(state.featureFlags.remote_connections, true);
    assert.equal(state.featureFlags.remote_ssh_connections, true);
  },
);

test(
  "preload keeps shared objects and browser history synced with memory navigation",
  { timeout: 45_000 },
  async (t) => {
    const ctx = await withPage(t, "/settings");
    if (!ctx) return;

    await ctx.page.waitForFunction(() => window.electronBridge);
    const state = await ctx.page.evaluate(async () => {
      const updates = [];
      window.addEventListener("message", (event) => {
        if (event.data?.type === "shared-object-updated") {
          updates.push(event.data);
        }
      });

      window.__ELECTRON_SHIM__.onMemoryNavigationChanged({
        action: "PUSH",
        delta: 1,
        location: {
          hash: "",
          key: "local-route",
          pathname: "/local/preload-e2e-thread",
          search: "",
          state: null,
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const threadPath = window.location.pathname;
      const threadHost =
        window.electronBridge.getSharedObjectSnapshotValue("host_config");

      window.__ELECTRON_SHIM__.onMemoryNavigationChanged({
        action: "PUSH",
        delta: 1,
        location: {
          hash: "",
          key: "settings-route",
          pathname: "/settings",
          search: "",
          state: null,
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      return {
        finalHost:
          window.electronBridge.getSharedObjectSnapshotValue("host_config"),
        finalPath: window.location.pathname,
        threadHost,
        threadPath,
        updates,
      };
    });

    assert.equal(state.threadPath, "/thread/preload-e2e-thread");
    assert.deepEqual(state.threadHost, {
      display_name: "Remote",
      id: "remote:default",
      kind: "ssh",
    });
    assert.equal(state.finalPath, "/settings");
    assert.deepEqual(state.finalHost, {
      display_name: "Local",
      id: "local",
      kind: "local",
    });
    assert.deepEqual(
      state.updates.map((update) => update.value),
      [state.threadHost, state.finalHost],
    );
  },
);

test(
  "browser panel bundle creates iframe-compatible hosts and syncs snapshot URLs",
  { timeout: 45_000 },
  async (t) => {
    const ctx = await withPage(t);
    if (!ctx) return;

    const browserManager = assetName(/^browser-sidebar-manager-.+\.js$/);
    const result = await ctx.page.evaluate(
      async (assetUrl) => {
        const { t: manager } = await import(assetUrl);
        const events = [];
        const host = manager.getWebview(
          "codex-web-e2e-browser-panel",
          "https://example.com/first",
          { hostKind: "right-panel" },
        );
        const frame = host.webview;
        frame.addEventListener("did-attach", () => events.push("did-attach"));
        frame.addEventListener("did-stop-loading", () =>
          events.push("did-stop-loading"),
        );

        await frame.loadURL("https://example.com/second");
        await new Promise((resolve) => setTimeout(resolve, 0));
        manager.setSnapshot("codex-web-e2e-browser-panel", {
          tabType: "web",
          url: "https://example.com/snapshot",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        return {
          canGoBack: frame.canGoBack(),
          canGoForward: frame.canGoForward(),
          getURL: frame.getURL(),
          isLoading: frame.isLoading(),
          loading: frame.getAttribute("loading"),
          marker: frame.getAttribute("data-codex-web-browser-panel-frame"),
          referrerPolicy: frame.getAttribute("referrerpolicy"),
          src: frame.getAttribute("src"),
          tagName: frame.tagName,
          webviewCount: document.querySelectorAll("webview").length,
          events,
        };
      },
      new URL(`/assets/${browserManager}`, ctx.baseURL).href,
    );

    assert.equal(result.tagName, "IFRAME");
    assert.equal(result.marker, "true");
    assert.equal(result.referrerPolicy, "no-referrer-when-downgrade");
    assert.equal(result.loading, "eager");
    assert.equal(result.isLoading, false);
    assert.equal(result.canGoBack, false);
    assert.equal(result.canGoForward, false);
    assert.equal(result.getURL, "https://example.com/snapshot");
    assert.equal(result.src, "https://example.com/snapshot");
    assert.equal(result.events.includes("did-attach"), true);
    assert.equal(result.events.includes("did-stop-loading"), true);
    assert.equal(result.webviewCount, 0);
  },
);

test(
  "filesystem media bundle maps local files to /@fs instead of app://fs",
  { timeout: 45_000 },
  async (t) => {
    const ctx = await withPage(t);
    if (!ctx) return;

    const filesystemMedia = assetName(/^filesystem-media-src-.+\.js$/);
    const result = await ctx.page.evaluate(
      async (assetUrl) => {
        const media = await import(assetUrl);
        return {
          relative: media.n("/tmp/codex image#1?.png"),
          absolute: media.t("/tmp/codex image#1?.png"),
        };
      },
      new URL(`/assets/${filesystemMedia}`, ctx.baseURL).href,
    );

    assert.equal(result.relative.startsWith("/@fs/"), true);
    assert.equal(
      result.absolute.startsWith("http://localhost:8214/@fs/"),
      true,
    );
    assert.equal(result.absolute.includes("app://fs"), false);
    assert.match(result.absolute, /%23/);
    assert.match(result.absolute, /%3F/);
  },
);

test(
  "served upstream assets include every codex-web patch marker",
  { timeout: 45_000 },
  async (t) => {
    const ctx = await withPage(t);
    if (!ctx) return;

    const names = [
      assetName(/^browser-sidebar-manager-.+\.js$/),
      assetName(/^filesystem-media-src-.+\.js$/),
      assetName(/^app-main-.+\.js$/, ["preventAllNetworkTraffic"]),
      assetName(/^app-server-dynamic-tools-.+\.js$/, ["automation_update"]),
      assetName(/^automation-dialog-.+\.js$/, [
        "settings.automations.model.loading",
      ]),
      assetName(/^app-shell-.+\.js$/, ["codexWebRenderTerminalPanels"]),
      assetName(/^thread-page-bottom-panel-state-.+\.js$/, [
        "window.__CODEX_WEB_TERMINAL_FONT__",
      ]),
      ...assetNamesWith("cancelRefetch:"),
    ];

    const sources = await ctx.page.evaluate(async (assetNames) => {
      const entries = await Promise.all(
        assetNames.map(async (name) => [
          name,
          await fetch(`/assets/${name}`, { credentials: "include" }).then(
            (res) => res.text(),
          ),
        ]),
      );
      return Object.fromEntries(entries);
    }, names);

    const joined = Object.values(sources).join("\n");
    assert.match(joined, /data-codex-web-browser-panel-frame/);
    assert.doesNotMatch(joined, /document\.createElement\(`webview`\)/);
    assert.match(joined, /http:\/\/localhost:8214\/@fs/);
    assert.match(joined, /preventAllNetworkTraffic:true/);
    assert.match(joined, /disableLogging:true/);
    assert.match(
      joined,
      /cancelRefetch:[\w$.]+\.cancelRefetch\?\?!1|cancelRefetch:\s*[\w$.]+\.cancelRefetch\s*\?\?\s*false/,
    );
    assert.match(joined, /name:`automation_update`/);
    assert.doesNotMatch(joined, /suggested_create|suggested_update/);
    assert.match(joined, /n!==`remote:default`/);
    assert.match(joined, /executionEnvironment===`local`/);
    assert.match(joined, /defaultModel\?\.model/);
    assert.match(joined, /codexWebRenderTerminalPanels/);
    assert.match(joined, /window\.__CODEX_WEB_TERMINAL_FONT__/);
    assert.match(joined, /if\(Z\(t,`w`\)\)return/);
  },
);
