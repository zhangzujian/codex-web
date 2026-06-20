import assert from "node:assert/strict";
import test from "node:test";

import { BrowserWindow } from "../src/server/electron/index.js";

test("webContents.postMessage forwards transferred virtual port IDs", () => {
  const messages = [];
  globalThis.__codexElectronIpcBridge = {
    broadcastToRenderer(message) {
      messages.push(message);
    },
  };

  const window = new BrowserWindow();
  const port = {
    __codexVirtualPortId: "virtual_port_test",
    close() {},
    on() {},
    postMessage() {},
    start() {},
  };

  window.webContents.postMessage(
    "codex_desktop:mcp-app-sandbox-host-message",
    { type: "init" },
    [port],
  );

  assert.deepEqual(messages, [
    {
      type: "ipc-main-event",
      channel: "codex_desktop:mcp-app-sandbox-host-message",
      args: [{ type: "init" }],
      portIds: ["virtual_port_test"],
    },
  ]);
});
