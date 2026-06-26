import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

async function startServer(t, token) {
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
      env: { ...process.env, CODEX_CLI_PATH: process.env.CODEX_CLI_PATH ?? "codex" },
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

test(
  "served webview assets satisfy every asset patch target",
  { timeout: 90_000 },
  async (t) => {
    const assetNames = fs
      .readdirSync(assetsDir)
      .filter((name) => name.endsWith(".js"))
      .sort();
    assert.ok(assetNames.length > 0, "prepared webview assets should exist");

    const token = `asset-patch-e2e-${Date.now()}`;
    const baseURL = await startServer(t, token);
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

      const sources = await fetchServedAssetSources(page, assetNames);
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
