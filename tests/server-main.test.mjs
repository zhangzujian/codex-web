import assert from "node:assert/strict";
import test from "node:test";

import {
  createTerminalHtml,
  isAllowedBackendWebSocketRequest,
  shouldServeWebviewShellPath,
  shouldBlockFsRequestPath,
} from "../src/server/main.js";
import * as serverMain from "../src/server/main.js";

test("isAllowedBackendWebSocketRequest accepts same-origin upgrades with the expected token", () => {
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "127.0.0.1:8214",
      origin: "http://127.0.0.1:8214",
      requestUrl: "/__backend/ipc?token=secret",
      token: "secret",
    }),
    true,
  );
});

test("isAllowedBackendWebSocketRequest rejects cross-origin browser websocket upgrades", () => {
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "127.0.0.1:8214",
      origin: "https://example.com",
      requestUrl: "/__backend/ipc?token=secret",
      token: "secret",
    }),
    false,
  );
});

test("isAllowedBackendWebSocketRequest rejects websocket upgrades without Origin", () => {
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "127.0.0.1:8214",
      requestUrl: "/__backend/ipc?token=secret",
      token: "secret",
    }),
    false,
  );
});

test("isAllowedBackendWebSocketRequest rejects missing or incorrect tokens", () => {
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "127.0.0.1:8214",
      origin: "http://127.0.0.1:8214",
      requestUrl: "/__backend/terminal",
      token: "secret",
    }),
    false,
  );
  assert.equal(
    isAllowedBackendWebSocketRequest({
      host: "127.0.0.1:8214",
      origin: "http://127.0.0.1:8214",
      requestUrl: "/__backend/terminal?token=wrong",
      token: "secret",
    }),
    false,
  );
});

test("shouldBlockFsRequestPath blocks active same-origin file documents", () => {
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/poc.html"), true);
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/poc%2Ehtml"), true);
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/script.js"), true);
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/image.svg"), true);
  assert.equal(
    shouldBlockFsRequestPath("/@fs/tmp/image.svg", {
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
    }),
    true,
  );
  assert.equal(
    shouldBlockFsRequestPath("/@fs/tmp/script.js", {
      "sec-fetch-dest": "script",
    }),
    true,
  );
});

test("shouldBlockFsRequestPath allows passive local file assets", () => {
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/image.png"), false);
  assert.equal(shouldBlockFsRequestPath("/@fs/tmp/report.txt"), false);
  assert.equal(
    shouldBlockFsRequestPath("/@fs/tmp/image.svg", {
      "sec-fetch-dest": "image",
    }),
    false,
  );
});

test("shouldServeWebviewShellPath allows known app shell browser routes", () => {
  assert.equal(shouldServeWebviewShellPath("/"), true);
  assert.equal(shouldServeWebviewShellPath("/thread/thread-1"), true);
  assert.equal(shouldServeWebviewShellPath("/share/receive?text=hello"), true);
});

test("shouldServeWebviewShellPath rejects unknown fallback routes", () => {
  assert.equal(shouldServeWebviewShellPath("/unexpected"), false);
  assert.equal(shouldServeWebviewShellPath("/@fs/tmp/poc.html"), false);
});

test("webview shell installs Statsig overrides before module scripts run", () => {
  assert.equal(typeof serverMain.injectWebviewRuntimeScripts, "function");

  const html = `<!doctype html>
<html>
  <head>
    <script type="module" src="./assets/preload.js"></script>
    <script type="module" crossorigin src="./assets/index.js"></script>
  </head>
</html>`;

  const injected = serverMain.injectWebviewRuntimeScripts(html, "secret");
  const overrideIndex = injected.indexOf("window.__ELECTRON_SHIM__");
  const automationsGateIndex = injected.indexOf("3075919032");
  const layerOverrideIndex = injected.indexOf("getLayerOverride");
  const localeSourceIndex = injected.indexOf("locale_source");
  const tokenIndex = injected.indexOf("__CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__");
  const preloadIndex = injected.indexOf("./assets/preload.js");
  const appIndex = injected.indexOf("./assets/index.js");

  assert.notEqual(overrideIndex, -1);
  assert.notEqual(automationsGateIndex, -1);
  assert.notEqual(layerOverrideIndex, -1);
  assert.notEqual(localeSourceIndex, -1);
  assert.notEqual(tokenIndex, -1);
  assert.ok(overrideIndex < preloadIndex);
  assert.ok(overrideIndex < appIndex);
});

test("terminal html carries the requested locale for terminal i18n", () => {
  const html = createTerminalHtml({
    backendWebSocketToken: "secret",
    cwd: "/tmp/work",
    locale: "zh-CN",
    stylesheetHrefs: ["/assets/terminal-page.css"],
  });

  assert.match(html, /<html lang="zh-CN"/);
  assert.match(html, /<title>终端<\/title>/);
  assert.match(html, /data-terminal-locale="zh-CN"/);
});
