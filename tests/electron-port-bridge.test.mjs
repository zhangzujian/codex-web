import assert from "node:assert/strict";
import test from "node:test";

import { BrowserWindow, ipcMain } from "../src/server/electron/index.js";

function captureRendererMessages() {
  const messages = [];
  const bridge = globalThis.__codexElectronIpcBridge;
  bridge.broadcastToRenderer = (message) => {
    messages.push(message);
  };
  return messages;
}

test("webContents.postMessage forwards transferred virtual port IDs", () => {
  const messages = captureRendererMessages();

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

test("ipcMain worker handlers can send responses back to renderer listeners", async () => {
  const messages = captureRendererMessages();
  const request = {
    type: "worker-request",
    workerId: "git",
    request: { id: "git-worker-test", method: "availability", params: {} },
  };
  const response = {
    type: "worker-response",
    workerId: "git",
    response: {
      id: "git-worker-test",
      method: "availability",
      result: { type: "ok", value: { available: true } },
    },
  };

  const channel = "codex_desktop:worker:git:from-view";

  try {
    ipcMain.handle(channel, async (event, message) => {
      assert.deepEqual(message, request);
      event.sender.send("codex_desktop:worker:git:for-view", response);
    });

    await globalThis.__codexElectronIpcBridge.handleRendererInvoke(
      channel,
      [request],
      "http://localhost:5175/",
    );
  } finally {
    ipcMain.removeHandler(channel);
  }

  assert.deepEqual(messages, [
    {
      type: "ipc-main-event",
      channel: "codex_desktop:worker:git:for-view",
      args: [response],
    },
  ]);
});
