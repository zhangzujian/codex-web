import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedBackendWebSocketRequest,
  shouldServeWebviewShellPath,
  shouldBlockFsRequestPath,
} from "../src/server/main.js";

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
