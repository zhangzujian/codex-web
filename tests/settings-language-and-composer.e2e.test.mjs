import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

function readCodexWebAuthToken() {
  const token = process.env.CODEX_WEB_AUTH_TOKEN?.trim();
  if (token) {
    return token;
  }

  try {
    const environment = execFileSync(
      "systemctl",
      ["--user", "show", "codex-web.service", "-p", "Environment", "--value"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return /(?:^|\s)CODEX_WEB_AUTH_TOKEN=([^\s]+)/.exec(environment)?.[1] ?? "";
  } catch {
    return "";
  }
}

async function waitForAppPage(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor();
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
}

async function clearLocaleOverride(page) {
  await page.evaluate(() => {
    localStorage.removeItem("codex-web:setting:localeOverride");
  });
}

async function firstVisibleLocator(locators) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      if (await item.isVisible().catch(() => false)) {
        return item;
      }
    }
  }
  return null;
}

async function clickFirstVisible(locators) {
  const locator = await firstVisibleLocator(locators);
  if (locator == null) {
    return false;
  }
  await locator.click();
  return true;
}

async function openSettingsFromCurrentPage(page) {
  const settingsLocators = () => [
    page.getByRole("button", { name: /Open settings|打开设置|開啟設定/i }),
    page.getByRole("link", { name: /^(Settings|设置|設定)$/i }),
    page.getByRole("button", { name: /^(Settings|设置|設定)$/i }),
    page.getByTitle(/^(Settings|设置|設定)$/i),
    page.locator('a[href="/settings"], a[href^="/settings?"]'),
    page.locator(
      'button[aria-label="Settings"], button[aria-label="设置"], button[aria-label="設定"]',
    ),
  ];

  if (!(await clickFirstVisible(settingsLocators()))) {
    await clickFirstVisible([
      page.getByTitle(/显示\/隐藏侧边栏|Show\/hide sidebar|Toggle sidebar/i),
      page.getByRole("button", {
        name: /显示\/隐藏侧边栏|Show\/hide sidebar|Toggle sidebar/i,
      }),
    ]);
    await page.waitForTimeout(250);
    assert.equal(
      await clickFirstVisible(settingsLocators()),
      true,
      "settings button or link should be visible on the loaded app page",
    );
  }

  if (!new URL(page.url()).pathname.startsWith("/settings")) {
    await page.getByRole("menuitem", { name: /^(Settings|设置|設定)/i }).click();
  }

  await page.getByText(/^(Language|语言|語言)$/).first().waitFor();
}

async function clickLanguageSelector(page) {
  const languageLabel = page.getByText(/^(Language|语言|語言)$/).first();
  await languageLabel.waitFor();
  const row = languageLabel.locator("xpath=ancestor::*[.//button][1]");
  const button = row.getByRole("button").last();
  const currentValue = (await button.innerText()).trim();
  assert.ok(currentValue.length > 0, "language selector should show current value");
  await button.click();
  return currentValue;
}

async function localeInfo(page) {
  return await page.evaluate(async () => {
    return await new Promise((resolve, reject) => {
      const requestId = `settings-language-e2e-${Date.now()}`;
      const timeout = setTimeout(
        () => reject(new Error("locale-info response timed out")),
        5_000,
      );
      window.addEventListener(
        "message",
        (event) => {
          if (event.data?.requestId !== requestId) {
            return;
          }
          clearTimeout(timeout);
          resolve(JSON.parse(event.data.bodyJsonString));
        },
        { once: true },
      );
      window.electronBridge.sendMessageFromView({
        type: "fetch",
        requestId,
        method: "POST",
        url: "vscode://codex/locale-info",
      });
    });
  });
}

async function selectComposerCustomPermissions(page, t) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((button) =>
      /Custom|Ask for approval|Full access|Approve for me|自定义|自訂|要求批准|完整存取權/.test(
        button.innerText,
      ),
    ),
  );
  const permissionsTrigger = await firstVisibleLocator([
    page.getByRole("button", { name: /Change permissions|更改权限|變更權限/i }),
    page.getByRole("button", {
      name: /^(Custom|Ask for approval|Full access|Approve for me|自定义|自訂|要求批准|完整存取權)/i,
    }),
    page.getByTitle(/Change permissions|更改权限|變更權限/i),
  ]);
  assert.ok(permissionsTrigger, "composer permissions trigger should be visible");
  assert.equal(
    await permissionsTrigger.isEnabled(),
    true,
    "composer permissions trigger should be clickable",
  );
  assert.equal(
    await permissionsTrigger.evaluate((button) =>
      button.outerHTML.includes("loading-shimmer"),
    ),
    false,
    "composer permissions trigger label should not look like it is loading",
  );

  await permissionsTrigger.click();
  const customOption = page
    .getByRole("menuitem", {
      name: /Custom \(config\.toml\)|自定义|自訂|自定义 \(config\.toml\)|自訂 \(config\.toml\)/i,
    })
    .last();
  if ((await customOption.count()) === 0) {
    t.skip("This running Codex config does not expose a custom permissions option.");
    return null;
  }

  await customOption.waitFor();
  return page.getByRole("button", { name: /Custom|自定义|自訂/i }).first();
}

test(
  "settings UI can set the app language to Chinese",
  { timeout: 60_000 },
  async (t) => {
    const token = readCodexWebAuthToken();
    if (!token) {
      t.skip("Set CODEX_WEB_AUTH_TOKEN or the codex-web user service environment.");
      return;
    }

    const baseURL = process.env.CODEX_WEB_URL ?? "https://127.0.0.1:9443";
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        locale: "en-US",
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);

      await waitForAppPage(page, baseURL);
      await clearLocaleOverride(page);
      await openSettingsFromCurrentPage(page);

      const currentValue = await clickLanguageSelector(page);
      assert.match(
        currentValue,
        /Auto detect|English|Chinese|中文|自动检测|自動偵測/i,
        "language selector should expose the current setting value",
      );

      await page.getByPlaceholder(/Search languages|搜索语言|搜尋語言/i).fill(
        "Chinese (China)",
      );
      await page
        .getByRole("menuitem", { name: /Chinese \(China\)|中文（中国）/i })
        .click();

      await page.waitForFunction(
        () => localStorage.getItem("codex-web:setting:localeOverride") === '"zh-CN"',
      );
      await page.getByText(/^语言$/).first().waitFor();
      assert.deepEqual(await localeInfo(page), {
        ideLocale: "zh-CN",
        systemLocale: "zh-CN",
      });
    } finally {
      await browser.close();
    }
  },
);

test(
  "composer custom permissions option can be selected and remains clickable",
  { timeout: 60_000 },
  async (t) => {
    const token = readCodexWebAuthToken();
    if (!token) {
      t.skip("Set CODEX_WEB_AUTH_TOKEN or the codex-web user service environment.");
      return;
    }

    const baseURL = process.env.CODEX_WEB_URL ?? "https://127.0.0.1:9443";
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        ignoreHTTPSErrors: true,
        locale: "en-US",
        viewport: { width: 1440, height: 1000 },
      });
      await authenticate(page, baseURL, token);

      await waitForAppPage(page, baseURL);
      await clearLocaleOverride(page);
      const customTrigger = await selectComposerCustomPermissions(page, t);
      if (customTrigger == null) {
        return;
      }

      assert.equal(await customTrigger.isEnabled(), true);
    } finally {
      await browser.close();
    }
  },
);
