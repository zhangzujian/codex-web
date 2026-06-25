import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function attrSelector(name, value) {
  return `[${name}="${String(value).replaceAll('"', '\\"')}"]`;
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

async function openCodexWebThread(page, baseURL) {
  if ((await page.getByTitle("显示/隐藏侧边栏").count()) > 0) {
    return;
  }

  const threadURL = process.env.CODEX_WEB_THREAD_URL;
  if (threadURL) {
    await page.goto(new URL(threadURL, baseURL).href, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTitle("显示/隐藏侧边栏").last().waitFor();
    return;
  }

  await page.getByRole("button", { name: "展开项目" }).last().click().catch(
    () => {},
  );
  const threadRow = page.locator("[data-app-action-sidebar-thread-row]").first();
  await threadRow.waitFor().catch(() => {
    throw new Error(
      "No sidebar thread rows found. Set CODEX_WEB_THREAD_URL to a /thread/... URL for this e2e test.",
    );
  });
  await threadRow.click();
  await page.getByTitle("显示/隐藏侧边栏").last().waitFor();
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
  "bottom terminal tabs preserve their session text when switching back",
  { timeout: 45_000 },
  async (t) => {
    const token = process.env.CODEX_WEB_AUTH_TOKEN;
    if (!token) {
      t.skip("Set CODEX_WEB_AUTH_TOKEN for the running codex-web service.");
      return;
    }

    const baseURL = process.env.CODEX_WEB_URL ?? "https://127.0.0.1:9443";
    const marker = `CODEX_WEB_TERMINAL_TAB_${Date.now()}`;
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);

      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      const terminalInput = page.locator("textarea.xterm-helper-textarea");
      if ((await terminalInput.count()) === 0) {
        await page
          .getByRole("button", { name: "切换底部面板显示" })
          .last()
          .click();
      }
      await terminalInput.waitFor();

      const firstTabId = await activeTerminalTabId(page, "bottom");
      assert.ok(firstTabId, "first terminal tab id should exist");

      await writeTerminalMarkerToPanel(page, "bottom", firstTabId, marker);

      await page.getByTitle("打开底部面板标签页").click();
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

      const firstPanelText = await terminalPanelText(page, "bottom", firstTabId);
      assert.match(
        firstPanelText,
        new RegExp(marker),
        "switching back to the first terminal should keep prior command text/output",
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
    const token = process.env.CODEX_WEB_AUTH_TOKEN;
    if (!token) {
      t.skip("Set CODEX_WEB_AUTH_TOKEN for the running codex-web service.");
      return;
    }

    const baseURL = process.env.CODEX_WEB_URL ?? "https://127.0.0.1:9443";
    const marker = `CODEX_WEB_RIGHT_TERMINAL_TAB_${Date.now()}`;
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);

      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await openCodexWebThread(page, baseURL);

      if (
        (await page.locator('[data-app-shell-tab-controller="right"]').count()) ===
        0
      ) {
        await page.getByTitle("显示/隐藏侧边栏").last().click();
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
      await page.getByTitle("打开侧边面板标签页").click();
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

      const firstPanelText = await terminalPanelText(page, "right", firstTabId);
      assert.match(
        firstPanelText,
        new RegExp(marker),
        "switching back to the first sidebar terminal should keep prior command text/output",
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
    const token = process.env.CODEX_WEB_AUTH_TOKEN;
    if (!token) {
      t.skip("Set CODEX_WEB_AUTH_TOKEN for the running codex-web service.");
      return;
    }

    const baseURL = process.env.CODEX_WEB_URL ?? "https://127.0.0.1:9443";
    const marker = `CODEX_WEB_BOTTOM_HIDE_${Date.now()}`;
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);
      await page.goto(baseURL, { waitUntil: "domcontentloaded" });

      if (
        (await page.locator('[data-app-shell-tab-controller="bottom"]').count()) ===
        0
      ) {
        await page.getByRole("button", { name: "切换底部面板显示" }).last().click();
      }
      await page
        .locator('[data-app-shell-tab-controller="bottom"][data-tab-id^="terminal:"]')
        .first()
        .waitFor();

      const tabId = await activeTerminalTabId(page, "bottom");
      assert.ok(tabId, "bottom terminal tab id should exist");
      await writeTerminalMarkerToPanel(page, "bottom", tabId, marker);

      await page.getByRole("button", { name: "切换底部面板显示" }).last().click();
      await waitForPanelSize(page, "bottom-panel", false);
      await page.getByRole("button", { name: "切换底部面板显示" }).last().click();
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
    const token = process.env.CODEX_WEB_AUTH_TOKEN;
    if (!token) {
      t.skip("Set CODEX_WEB_AUTH_TOKEN for the running codex-web service.");
      return;
    }

    const baseURL = process.env.CODEX_WEB_URL ?? "https://127.0.0.1:9443";
    const marker = `CODEX_WEB_RIGHT_HIDE_${Date.now()}`;
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);
      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await openCodexWebThread(page, baseURL);

      if (
        (await page.locator('[data-app-shell-tab-controller="right"]').count()) ===
        0
      ) {
        await page.getByTitle("显示/隐藏侧边栏").last().click();
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

      await page.getByTitle("显示/隐藏侧边栏").last().click();
      await waitForPanelSize(page, "right-panel", false);
      await page.getByTitle("显示/隐藏侧边栏").last().click();
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
    const token = process.env.CODEX_WEB_AUTH_TOKEN;
    if (!token) {
      t.skip("Set CODEX_WEB_AUTH_TOKEN for the running codex-web service.");
      return;
    }

    const baseURL = process.env.CODEX_WEB_URL ?? "https://127.0.0.1:9443";
    const bottomMarker = `CODEX_WEB_BOTH_BOTTOM_HIDE_${Date.now()}`;
    const rightMarker = `CODEX_WEB_BOTH_RIGHT_HIDE_${Date.now()}`;
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);
      await page.goto(baseURL, { waitUntil: "domcontentloaded" });
      await openCodexWebThread(page, baseURL);

      if (
        (await page.locator('[data-app-shell-tab-controller="bottom"]').count()) ===
        0
      ) {
        await page.getByRole("button", { name: "切换底部面板显示" }).last().click();
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
        await page.getByTitle("显示/隐藏侧边栏").last().click();
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

      await page.getByRole("button", { name: "切换底部面板显示" }).last().click();
      await waitForPanelSize(page, "bottom-panel", false);
      await page.getByTitle("显示/隐藏侧边栏").last().click();
      await waitForPanelSize(page, "right-panel", false);

      await page.getByRole("button", { name: "切换底部面板显示" }).last().click();
      await waitForPanelSize(page, "bottom-panel", true);
      await page.getByTitle("显示/隐藏侧边栏").last().click();
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
