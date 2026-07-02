import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createCodexAppServerClient } from "../src/server/app-server-client.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const BOTTOM_PANEL_TOGGLE_NAME = /^(切换底部面板显示|Toggle bottom panel)$/;
const SIDE_PANEL_TOGGLE_TITLE = /^(显示\/隐藏侧边栏|Toggle side panel)$/;
const OPEN_BOTTOM_PANEL_TAB_TITLE =
  /^(打开底部面板标签页|Open bottom panel tab)$/;
const OPEN_SIDE_PANEL_TAB_TITLE =
  /^(打开侧边面板标签页|Open side panel tab)$/;

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

function loadPlaywrightOrSkip(t) {
  try {
    return loadPlaywright();
  } catch (error) {
    t.skip(error.message);
    return null;
  }
}

function attrSelector(name, value) {
  return `[${name}="${String(value).replaceAll('"', '\\"')}"]`;
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
  t.after(() => child.kill("SIGTERM"));

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

async function testServer(t, extraEnv = {}) {
  const token = process.env.CODEX_WEB_AUTH_TOKEN?.trim();
  const threadURL =
    process.env.CODEX_WEB_THREAD_URL ??
    `/thread/${encodeURIComponent(await createTerminalE2eThread())}`;
  if (token) {
    return {
      baseURL: process.env.CODEX_WEB_URL ?? "https://127.0.0.1:9443",
      threadURL,
      token,
    };
  }

  const generatedToken = `terminal-e2e-${Date.now()}-${Math.random()}`;
  return {
    baseURL: await startServer(t, generatedToken, extraEnv),
    threadURL,
    token: generatedToken,
  };
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

async function openCodexWebThread(page, baseURL, threadURL) {
  if ((await page.getByTitle(SIDE_PANEL_TOGGLE_TITLE).count()) > 0) {
    return;
  }

  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.electronBridge));
  await page.waitForTimeout(2_000);
  await page.goto(new URL(threadURL, baseURL).href, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTitle(SIDE_PANEL_TOGGLE_TITLE).last().waitFor();
}

async function createTerminalE2eThread() {
  const client = createCodexAppServerClient(process.env);
  try {
    const result = await client.rpc(
      "thread/start",
      {
        cwd: repoRoot,
        initialMessages: [],
        threadSource: "codex-web-terminal-e2e",
      },
      { timeoutMs: 30_000 },
    );
    assert.equal(typeof result?.thread?.id, "string");
    return result.thread.id;
  } finally {
    client.dispose();
  }
}

async function activeTerminalTabId(page, controller) {
  return await page.evaluate((controller) => {
    for (const tab of document.querySelectorAll(
      `[data-app-shell-tab-controller="${controller}"][data-tab-id^="terminal:"]`,
    )) {
      if (tab.querySelector('[role="tab"][aria-selected="true"]')) {
        return tab.getAttribute("data-tab-id");
      }
    }
    return null;
  }, controller);
}

async function terminalPanelText(page, controller, tabId) {
  return await terminalPanelLocator(page, controller, tabId).innerText();
}

function terminalPanelLocator(page, controller, tabId) {
  const tabSelector = attrSelector("data-tab-id", tabId);
  return page.locator(
    `[role="tabpanel"][data-app-shell-tab-panel-controller="${controller}"]${tabSelector}`,
  );
}

async function waitForPanelSize(page, focusArea, visible) {
  await page.waitForFunction(
    ({ focusArea, visible }) => {
      const element = document.querySelector(
        `[data-app-shell-focus-area="${focusArea}"]`,
      );
      if (!element) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const size = focusArea === "bottom-panel" ? rect.height : rect.width;
      return visible ? size > 10 : size <= 1;
    },
    { focusArea, visible },
  );
}

async function writeTerminalMarkerToPanel(page, controller, tabId, marker) {
  const panel = terminalPanelLocator(page, controller, tabId);
  const terminalInput = panel.locator("textarea.xterm-helper-textarea");
  await terminalInput.waitFor();
  await terminalInput.click();
  await page.keyboard.type(`echo ${marker}`);
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    ({ controller, marker, tabId }) => {
      const selector = `[role="tabpanel"][data-app-shell-tab-panel-controller="${controller}"][data-tab-id="${CSS.escape(tabId)}"]`;
      return document.querySelector(selector)?.innerText.includes(marker);
    },
    { controller, marker, tabId },
  );
}

async function openTerminalInPanel(page, focusArea) {
  const panel = page.locator(`[data-app-shell-focus-area="${focusArea}"]`);
  const button = panel.getByRole("button", { name: /^(终端|Terminal)$/ });
  await button.waitFor();
  await button.last().click();
}

test(
  "terminal uses the configured browser terminal font",
  { timeout: 45_000 },
  async (t) => {
    const playwright = loadPlaywrightOrSkip(t);
    if (!playwright) {
      return;
    }
    const terminalFont = "MesloLGS NF";
    const { baseURL, threadURL, token } = await testServer(t, {
      CODEX_WEB_TERMINAL_FONT: terminalFont,
    });
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);
      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await openCodexWebThread(page, baseURL, threadURL);

      if (
        (await page.locator('[data-app-shell-tab-controller="bottom"]').count()) ===
        0
      ) {
        await page
          .getByRole("button", { name: BOTTOM_PANEL_TOGGLE_NAME })
          .last()
          .click();
      }
      if (
        (await page.locator('[data-app-shell-tab-controller="bottom"][data-tab-id^="terminal:"]').count()) ===
        0
      ) {
        await openTerminalInPanel(page, "bottom-panel");
      }
      const terminalTab = page
        .locator('[data-app-shell-tab-controller="bottom"][data-tab-id^="terminal:"]')
        .first();
      await terminalTab.locator('[role="tab"]').click();
      const tabId = await activeTerminalTabId(page, "bottom");
      assert.ok(tabId, "bottom terminal tab id should exist");
      const panel = terminalPanelLocator(page, "bottom", tabId);
      await panel.locator("textarea.xterm-helper-textarea").waitFor();

      const fontFamily = await panel
        .locator(".xterm-rows")
        .first()
        .evaluate((terminal) => getComputedStyle(terminal).fontFamily);
      assert.match(fontFamily, /MesloLGS NF/);
    } finally {
      await browser.close();
    }
  },
);

test(
  "bottom terminal tabs preserve their session text when switching back",
  { timeout: 45_000 },
  async (t) => {
    const playwright = loadPlaywrightOrSkip(t);
    if (!playwright) {
      return;
    }
    const { baseURL, threadURL, token } = await testServer(t);
    const marker = `CODEX_WEB_TERMINAL_TAB_${Date.now()}`;
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);

      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await openCodexWebThread(page, baseURL, threadURL);
      const terminalInput = page.locator("textarea.xterm-helper-textarea");
      if ((await terminalInput.count()) === 0) {
        await page
          .getByRole("button", { name: BOTTOM_PANEL_TOGGLE_NAME })
          .last()
          .click();
      }
      await terminalInput.waitFor();

      const firstTabId = await activeTerminalTabId(page, "bottom");
      assert.ok(firstTabId, "first terminal tab id should exist");

      await writeTerminalMarkerToPanel(page, "bottom", firstTabId, marker);

      await page.getByTitle(OPEN_BOTTOM_PANEL_TAB_TITLE).click();
      await page.getByRole("menuitem", { name: /^(终端|Terminal)$/ }).click();
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            '[data-app-shell-tab-controller="bottom"][data-tab-id^="terminal:"]',
          ).length >= 2,
      );

      const firstTabSelector = attrSelector("data-tab-id", firstTabId);
      await page
        .locator(
          `[data-app-shell-tab-controller="bottom"]${firstTabSelector} [role="tab"]`,
        )
        .click();

      await page.waitForFunction(
        ({ marker, tabId }) => {
          const selector = `[role="tabpanel"][data-app-shell-tab-panel-controller="bottom"][data-tab-id="${CSS.escape(tabId)}"]`;
          return document.querySelector(selector)?.innerText.includes(marker);
        },
        { marker, tabId: firstTabId },
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  "sidebar terminal tabs preserve their session text when switching back",
  { timeout: 60_000 },
  async (t) => {
    const playwright = loadPlaywrightOrSkip(t);
    if (!playwright) {
      return;
    }
    const { baseURL, threadURL, token } = await testServer(t);
    const marker = `CODEX_WEB_RIGHT_TERMINAL_TAB_${Date.now()}`;
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);

      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await openCodexWebThread(page, baseURL, threadURL);

      if (
        (await page.locator('[data-app-shell-tab-controller="right"]').count()) ===
        0
      ) {
        await page.getByTitle(SIDE_PANEL_TOGGLE_TITLE).last().click();
      }

      const terminalInput = page.locator("textarea.xterm-helper-textarea");
      if ((await terminalInput.count()) === 0) {
        await page.getByRole("button", { name: /^(终端|Terminal)$/ }).last().click();
      }
      await terminalInput.waitFor();

      const firstTabId = await activeTerminalTabId(page, "right");
      assert.ok(firstTabId, "first sidebar terminal tab id should exist");

      await writeTerminalMarkerToPanel(page, "right", firstTabId, marker);

      const terminalCount = await page.evaluate(
        () =>
          document.querySelectorAll(
            '[data-app-shell-tab-controller="right"][data-tab-id^="terminal:"]',
          ).length,
      );
      await page.getByTitle(OPEN_SIDE_PANEL_TAB_TITLE).click();
      await page.getByRole("menuitem", { name: /^(终端|Terminal)$/ }).click();
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll(
            '[data-app-shell-tab-controller="right"][data-tab-id^="terminal:"]',
          ).length > count,
        terminalCount,
      );

      const firstTabSelector = attrSelector("data-tab-id", firstTabId);
      await page
        .locator(
          `[data-app-shell-tab-controller="right"]${firstTabSelector} [role="tab"]`,
        )
        .click();

      await page.waitForFunction(
        ({ marker, tabId }) => {
          const selector = `[role="tabpanel"][data-app-shell-tab-panel-controller="right"][data-tab-id="${CSS.escape(tabId)}"]`;
          return document.querySelector(selector)?.innerText.includes(marker);
        },
        { marker, tabId: firstTabId },
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  "bottom terminal keeps its session text after hiding and showing the bottom panel",
  { timeout: 60_000 },
  async (t) => {
    const playwright = loadPlaywrightOrSkip(t);
    if (!playwright) {
      return;
    }
    const { baseURL, threadURL, token } = await testServer(t);
    const marker = `CODEX_WEB_BOTTOM_HIDE_${Date.now()}`;
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);
      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await openCodexWebThread(page, baseURL, threadURL);

      if (
        (await page.locator('[data-app-shell-tab-controller="bottom"]').count()) ===
        0
      ) {
        await page
          .getByRole("button", { name: BOTTOM_PANEL_TOGGLE_NAME })
          .last()
          .click();
      }
      await page
        .locator('[data-app-shell-tab-controller="bottom"][data-tab-id^="terminal:"]')
        .first()
        .waitFor();

      const tabId = await activeTerminalTabId(page, "bottom");
      assert.ok(tabId, "bottom terminal tab id should exist");
      await writeTerminalMarkerToPanel(page, "bottom", tabId, marker);

      await page
        .getByRole("button", { name: BOTTOM_PANEL_TOGGLE_NAME })
        .last()
        .click();
      await waitForPanelSize(page, "bottom-panel", false);
      await page
        .getByRole("button", { name: BOTTOM_PANEL_TOGGLE_NAME })
        .last()
        .click();
      await waitForPanelSize(page, "bottom-panel", true);
      await page
        .locator(`[data-app-shell-tab-controller="bottom"]${attrSelector("data-tab-id", tabId)}`)
        .waitFor();

      assert.match(
        await terminalPanelText(page, "bottom", tabId),
        new RegExp(marker),
        "showing the bottom panel again should keep prior terminal output",
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  "sidebar terminal keeps its session text after hiding and showing the sidebar",
  { timeout: 60_000 },
  async (t) => {
    const playwright = loadPlaywrightOrSkip(t);
    if (!playwright) {
      return;
    }
    const { baseURL, threadURL, token } = await testServer(t);
    const marker = `CODEX_WEB_RIGHT_HIDE_${Date.now()}`;
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);
      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await openCodexWebThread(page, baseURL, threadURL);

      if (
        (await page.locator('[data-app-shell-tab-controller="right"]').count()) ===
        0
      ) {
        await page.getByTitle(SIDE_PANEL_TOGGLE_TITLE).last().click();
      }
      const terminalInput = page.locator("textarea.xterm-helper-textarea");
      if ((await terminalInput.count()) === 0) {
        await page.getByRole("button", { name: /^(终端|Terminal)$/ }).last().click();
      }
      await page
        .locator('[data-app-shell-tab-controller="right"][data-tab-id^="terminal:"]')
        .first()
        .waitFor();

      const tabId = await activeTerminalTabId(page, "right");
      assert.ok(tabId, "sidebar terminal tab id should exist");
      await writeTerminalMarkerToPanel(page, "right", tabId, marker);

      await page.getByTitle(SIDE_PANEL_TOGGLE_TITLE).last().click();
      await waitForPanelSize(page, "right-panel", false);
      await page.getByTitle(SIDE_PANEL_TOGGLE_TITLE).last().click();
      await waitForPanelSize(page, "right-panel", true);
      await page
        .locator(`[data-app-shell-tab-controller="right"]${attrSelector("data-tab-id", tabId)}`)
        .waitFor();

      assert.match(
        await terminalPanelText(page, "right", tabId),
        new RegExp(marker),
        "showing the sidebar again should keep prior terminal output",
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  "sidebar terminal keeps its session text after hiding both panels and reopening bottom first",
  { timeout: 90_000 },
  async (t) => {
    const playwright = loadPlaywrightOrSkip(t);
    if (!playwright) {
      return;
    }
    const { baseURL, threadURL, token } = await testServer(t);
    const bottomMarker = `CODEX_WEB_BOTH_BOTTOM_HIDE_${Date.now()}`;
    const rightMarker = `CODEX_WEB_BOTH_RIGHT_HIDE_${Date.now()}`;
    const { chromium } = playwright;
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);
      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await openCodexWebThread(page, baseURL, threadURL);

      if (
        (await page.locator('[data-app-shell-tab-controller="bottom"]').count()) ===
        0
      ) {
        await page
          .getByRole("button", { name: BOTTOM_PANEL_TOGGLE_NAME })
          .last()
          .click();
      }
      if (
        (await page.locator('[data-app-shell-tab-controller="bottom"][data-tab-id^="terminal:"]').count()) ===
        0
      ) {
        await openTerminalInPanel(page, "bottom-panel");
      }
      if (
        (await page.locator('[data-app-shell-tab-controller="right"]').count()) ===
        0
      ) {
        await page.getByTitle(SIDE_PANEL_TOGGLE_TITLE).last().click();
      }
      if (
        (await page.locator('[data-app-shell-tab-controller="right"][data-tab-id^="terminal:"]').count()) ===
        0
      ) {
        await openTerminalInPanel(page, "right-panel");
      }

      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            '[data-app-shell-tab-controller="bottom"][data-tab-id^="terminal:"]',
          ).length > 0 &&
          document.querySelectorAll(
            '[data-app-shell-tab-controller="right"][data-tab-id^="terminal:"]',
          ).length > 0,
      );

      const bottomTabId = await activeTerminalTabId(page, "bottom");
      const rightTabId = await activeTerminalTabId(page, "right");
      assert.ok(bottomTabId, "bottom terminal tab id should exist");
      assert.ok(rightTabId, "right terminal tab id should exist");

      await writeTerminalMarkerToPanel(page, "bottom", bottomTabId, bottomMarker);
      await writeTerminalMarkerToPanel(page, "right", rightTabId, rightMarker);

      await page
        .getByRole("button", { name: BOTTOM_PANEL_TOGGLE_NAME })
        .last()
        .click();
      await waitForPanelSize(page, "bottom-panel", false);
      await page.getByTitle(SIDE_PANEL_TOGGLE_TITLE).last().click();
      await waitForPanelSize(page, "right-panel", false);

      await page
        .getByRole("button", { name: BOTTOM_PANEL_TOGGLE_NAME })
        .last()
        .click();
      await waitForPanelSize(page, "bottom-panel", true);
      await page.getByTitle(SIDE_PANEL_TOGGLE_TITLE).last().click();
      await waitForPanelSize(page, "right-panel", true);

      assert.match(
        await terminalPanelText(page, "right", rightTabId),
        new RegExp(rightMarker),
        "showing the sidebar after reopening the bottom panel should keep prior terminal output",
      );
    } finally {
      await browser.close();
    }
  },
);
