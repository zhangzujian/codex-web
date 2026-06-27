import assert from "node:assert/strict";
import os from "node:os";
import test from "node:test";

import {
  app,
  BrowserWindow,
  ipcMain,
  net,
} from "../src/server/electron/index.js";

function captureRendererMessages() {
  const messages = [];
  const bridge = globalThis.__codexElectronIpcBridge;
  bridge.broadcastToRenderer = (message) => {
    messages.push(message);
  };
  return messages;
}

test("app.whenReady does not synchronously mark the app ready", async () => {
  assert.equal(app.isReady(), false);
  const ready = app.whenReady();
  assert.equal(app.isReady(), false);
  await ready;
  assert.equal(app.isReady(), true);
});

test("BrowserWindow.fromId returns the live window for an id", () => {
  const window = new BrowserWindow();

  assert.equal(BrowserWindow.fromId(window.id)?.id, window.id);

  window.destroy();
  assert.equal(BrowserWindow.fromId(window.id), null);
});

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

test("renderer shared-object updates expose the default remote host", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();

  window.webContents.send("codex_desktop:message-for-view", {
    type: "shared-object-updated",
    key: "host_config",
    value: { id: "local", display_name: "Local", kind: "local" },
  });

  assert.deepEqual(messages[0].args[0], {
    type: "shared-object-updated",
    key: "host_config",
    value: { id: "remote:default", display_name: os.hostname(), kind: "ssh" },
  });

  window.webContents.send("codex_desktop:message-for-view", {
    type: "shared-object-updated",
    key: "remote_connections",
    value: [],
  });
  assert.deepEqual(messages[1].args[0].value, [
    {
      hostId: "remote:default",
      displayName: os.hostname(),
      source: "codex-managed",
      sshHost: os.hostname(),
      sshPort: null,
      sshAlias: null,
      identity: null,
      autoConnect: true,
    },
  ]);

  window.webContents.send("codex_desktop:message-for-view", {
    type: "shared-object-updated",
    key: "statsig_default_enable_features",
    value: {},
  });
  assert.deepEqual(messages[2].args[0].value, {
    remote_connections: true,
    remote_ssh_connections: true,
  });

  window.webContents.send("codex_desktop:message-for-view", {
    type: "shared-object-updated",
    key: "remote_wsl_connections",
    value: [{ hostId: "wsl:default" }],
  });
  assert.deepEqual(messages[3].args[0].value, []);

  window.webContents.send("codex_desktop:message-for-view", {
    type: "shared-object-updated",
    key: "local_remote_control_client_id",
    value: "client-1",
  });
  assert.equal(messages[4].args[0].value, null);
});

test("config reads expose browser remote connection features", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "remote:default",
      request: {
        jsonrpc: "2.0",
        id: "config-request",
        method: "config/read",
        params: { includeLayers: true },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "config-request",
      result: {
        config: {
          model: "gpt-5",
          features: {
            existing: true,
            remote_connections: false,
          },
        },
      },
    },
  });

  assert.deepEqual(messages[0].args[0].message.result.config.features, {
    existing: true,
    remote_connections: true,
    remote_ssh_connections: true,
  });
});

test("mcp responses present local projects and projectless threads as default remote", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "remote:default",
      request: {
        jsonrpc: "2.0",
        id: "roots-request",
        method: "workspace-root-options",
        params: { hostId: "local" },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "roots-request",
      result: {
        roots: ["/repo/alpha"],
        labels: { "/repo/alpha": "Alpha" },
      },
    },
  });

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "remote:default",
      request: {
        jsonrpc: "2.0",
        id: "threads-request",
        method: "thread/list",
        params: {},
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "threads-request",
      result: {
        threads: [
          {
            id: "projectless-thread",
            cwd: "~",
            workspaceKind: "projectless",
          },
        ],
      },
    },
  });

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "remote:default",
      request: {
        jsonrpc: "2.0",
        id: "remote-projects-request",
        method: "get-global-state",
        params: { key: "REMOTE_PROJECTS" },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "remote-projects-request",
      result: { value: [] },
    },
  });

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "local",
      request: {
        jsonrpc: "2.0",
        id: "assignments-request",
        method: "get-global-state",
        params: { key: "THREAD_PROJECT_ASSIGNMENTS" },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "assignments-request",
      result: { value: {} },
    },
  });

  assert.deepEqual(messages[0].args[0].message.result.roots, []);
  assert.deepEqual(messages[1].args[0].message.result.threads[0], {
    id: "projectless-thread",
    cwd: "~",
    hostId: "remote:default",
    workspaceKind: "workspace",
  });
  assert.deepEqual(messages[2].args[0].message.result.value, [
    {
      id: "/repo/alpha",
      hostId: "remote:default",
      label: "Alpha",
      path: "/repo/alpha",
      remotePath: "/repo/alpha",
    },
    {
      id: "~",
      hostId: "remote:default",
      label: "Remote",
      path: "~",
      remotePath: "~",
    },
  ]);
  assert.deepEqual(messages[3].args[0].message.result.value, {
    "projectless-thread": {
      projectKind: "remote",
      projectId: "~",
      hostId: "remote:default",
      path: "~",
    },
  });
});

test("projectless ids synthesize remote assignments before thread list is loaded", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "local",
      request: {
        jsonrpc: "2.0",
        id: "projectless-ids-request",
        method: "get-global-state",
        params: { key: "PROJECTLESS_THREAD_IDS" },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "projectless-ids-request",
      result: { value: ["projectless-before-thread-list"] },
    },
  });

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "local",
      request: {
        jsonrpc: "2.0",
        id: "assignments-before-thread-list-request",
        method: "get-global-state",
        params: { key: "THREAD_PROJECT_ASSIGNMENTS" },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "assignments-before-thread-list-request",
      result: { value: {} },
    },
  });

  assert.deepEqual(messages[0].args[0].message.result.value, []);
  assert.deepEqual(
    messages[1].args[0].message.result.value[
      "projectless-before-thread-list"
    ],
    {
      projectKind: "remote",
      projectId: "~",
      hostId: "remote:default",
      path: "~",
    },
  );
  assert.equal(
    Object.values(messages[1].args[0].message.result.value).every(
      (assignment) => assignment.hostId === "remote:default",
    ),
    true,
  );
});

test("generated projectless cwd threads are assigned to remote home", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "remote:default",
      request: {
        jsonrpc: "2.0",
        id: "generated-projectless-thread-request",
        method: "thread/list",
        params: {},
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "generated-projectless-thread-request",
      result: {
        data: [
          {
            conversationId: "generated-projectless-thread",
            cwd: "/home/user/Documents/Codex/2026-06-23-debug-win11",
          },
        ],
      },
    },
  });

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "local",
      request: {
        jsonrpc: "2.0",
        id: "generated-projectless-assignments-request",
        method: "get-global-state",
        params: { key: "THREAD_PROJECT_ASSIGNMENTS" },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "generated-projectless-assignments-request",
      result: { value: {} },
    },
  });

  assert.deepEqual(messages[0].args[0].message.result.data[0], {
    conversationId: "generated-projectless-thread",
    cwd: "/home/user/Documents/Codex/2026-06-23-debug-win11",
    hostId: "remote:default",
    workspaceKind: "workspace",
  });
  assert.deepEqual(
    messages[1].args[0].message.result.value["generated-projectless-thread"],
    {
      projectKind: "remote",
      projectId: "~",
      hostId: "remote:default",
      path: "~",
    },
  );
});

test("thread summaries without cwd are assigned to remote home", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "remote:default",
      request: {
        jsonrpc: "2.0",
        id: "summary-without-cwd-request",
        method: "thread/list",
        params: {},
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "summary-without-cwd-request",
      result: {
        data: [
          {
            conversationId: "summary-without-cwd",
            title: "No project",
            updatedAt: Date.now(),
          },
        ],
      },
    },
  });

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "local",
      request: {
        jsonrpc: "2.0",
        id: "summary-without-cwd-assignments-request",
        method: "get-global-state",
        params: { key: "THREAD_PROJECT_ASSIGNMENTS" },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "summary-without-cwd-assignments-request",
      result: { value: {} },
    },
  });

  assert.deepEqual(messages[0].args[0].message.result.data[0], {
    conversationId: "summary-without-cwd",
    title: "No project",
    updatedAt: messages[0].args[0].message.result.data[0].updatedAt,
    hostId: "remote:default",
    workspaceKind: "workspace",
  });
  assert.deepEqual(
    messages[1].args[0].message.result.value["summary-without-cwd"],
    {
      projectKind: "remote",
      projectId: "~",
      hostId: "remote:default",
      path: "~",
    },
  );
});

test("fetch responses present projectless conversations as remote workspace threads", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();

  window.webContents.send("codex_desktop:message-for-view", {
    type: "fetch-response",
    requestId: "threads-fetch",
    responseType: "success",
    status: 200,
    headers: {},
    bodyJsonString: JSON.stringify({
      data: [
        {
          id: "projectless-thread",
          cwd: null,
          workspaceKind: "projectless",
        },
      ],
      projectlessThreadIds: ["projectless-thread"],
    }),
  });

  const body = JSON.parse(messages[0].args[0].bodyJsonString);
  assert.deepEqual(body, {
    data: [
      {
        id: "projectless-thread",
        cwd: null,
        hostId: "remote:default",
        workspaceKind: "workspace",
      },
    ],
    projectlessThreadIds: [],
  });
});

test("send-cli fetch responses present projectless globals as remote assignments", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "fetch",
      requestId: "fetch-projectless-ids",
      method: "POST",
      url: "vscode://codex/send-cli-request-for-host",
      body: JSON.stringify({
        hostId: "local",
        method: "get-global-state",
        params: { key: "PROJECTLESS_THREAD_IDS" },
      }),
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "fetch-response",
    requestId: "fetch-projectless-ids",
    responseType: "success",
    status: 200,
    headers: {},
    bodyJsonString: JSON.stringify({
      value: ["fetch-projectless-thread"],
    }),
  });

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "fetch",
      requestId: "fetch-assignments",
      method: "POST",
      url: "vscode://codex/send-cli-request-for-host",
      body: JSON.stringify({
        hostId: "local",
        method: "get-global-state",
        params: { key: "THREAD_PROJECT_ASSIGNMENTS" },
      }),
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "fetch-response",
    requestId: "fetch-assignments",
    responseType: "success",
    status: 200,
    headers: {},
    bodyJsonString: JSON.stringify({
      value: {},
    }),
  });

  assert.deepEqual(JSON.parse(messages[0].args[0].bodyJsonString), {
    value: [],
  });
  assert.deepEqual(
    JSON.parse(messages[1].args[0].bodyJsonString).value[
      "fetch-projectless-thread"
    ],
    {
      projectKind: "remote",
      projectId: "~",
      hostId: "remote:default",
      path: "~",
    },
  );
});

test("saved default remote projects are returned in direct global-state fetches", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;
  const listener = (event, message) => {
    const body = JSON.parse(message.body);
    assert.equal(body.value[0].hostId, "remote:default");
    event.reply("codex_desktop:message-for-view", {
      type: "fetch-response",
      requestId: message.requestId,
      responseType: "success",
      status: 200,
      headers: {},
      bodyJsonString: JSON.stringify({ success: true }),
    });
  };

  ipcMain.on("codex_desktop:message-from-view", listener);
  try {
    bridge.handleRendererSend("codex_desktop:message-from-view", [
      {
        type: "fetch",
        requestId: "save-remote-projects",
        method: "POST",
        url: "vscode://codex/set-global-state",
        body: JSON.stringify({
          key: "REMOTE_PROJECTS",
          value: [
            {
              id: "new-remote-project",
              hostId: "remote:default",
              remotePath: "/repo/new",
              label: "New",
            },
          ],
        }),
      },
    ]);
  } finally {
    ipcMain.off("codex_desktop:message-from-view", listener);
  }

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "fetch",
      requestId: "saved-remote-projects-request",
      method: "POST",
      url: "vscode://codex/get-global-state",
      body: JSON.stringify({ key: "REMOTE_PROJECTS" }),
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "fetch-response",
    requestId: "saved-remote-projects-request",
    responseType: "success",
    status: 200,
    headers: {},
    bodyJsonString: JSON.stringify({ value: [] }),
  });

  assert.equal(
    JSON.parse(messages[1].args[0].bodyJsonString).value.some(
      (project) =>
        project.id === "new-remote-project" &&
        project.hostId === "remote:default" &&
        project.remotePath === "/repo/new",
    ),
    true,
  );
});

test("default remote mcp requests are served through the local app server", () => {
  const messages = captureRendererMessages();
  const bridge = globalThis.__codexElectronIpcBridge;
  const window = new BrowserWindow();
  const listener = (event, message) => {
    assert.equal(message.hostId, "local");
    assert.equal(message.request.method, "thread/list");
    event.reply("codex_desktop:message-for-view", {
      type: "mcp-response",
      hostId: "local",
      message: {
        jsonrpc: "2.0",
        id: message.request.id,
        result: {
          data: [
            {
              conversationId: "proxied-thread",
              cwd: "/home/user/Documents/Codex/2026-06-23-proxied",
            },
          ],
        },
      },
    });
  };

  ipcMain.on("codex_desktop:message-from-view", listener);
  try {
    bridge.handleRendererSend("codex_desktop:message-from-view", [
      {
        type: "mcp-request",
        hostId: "remote:default",
        request: {
          jsonrpc: "2.0",
          id: "proxied-thread-list",
          method: "thread/list",
          params: {},
        },
      },
    ]);
  } finally {
    ipcMain.off("codex_desktop:message-from-view", listener);
  }

  assert.equal(messages[0].args[0].hostId, "remote:default");
  assert.deepEqual(messages[0].args[0].message.result.data[0], {
    conversationId: "proxied-thread",
    cwd: "/home/user/Documents/Codex/2026-06-23-proxied",
    hostId: "remote:default",
    workspaceKind: "workspace",
  });
});

test("default remote mcp responses are returned through the local app server", () => {
  captureRendererMessages();
  const bridge = globalThis.__codexElectronIpcBridge;
  const seen = [];
  const listener = (_event, message) => {
    seen.push(message);
  };

  ipcMain.on("codex_desktop:message-from-view", listener);
  try {
    bridge.handleRendererSend("codex_desktop:message-from-view", [
      {
        type: "mcp-response",
        hostId: "remote:default",
        response: {
          id: 0,
          result: {
            contentItems: [
              { type: "inputText", text: '{"automationId":"a1"}' },
            ],
            success: true,
          },
        },
      },
    ]);
  } finally {
    ipcMain.off("codex_desktop:message-from-view", listener);
  }

  assert.equal(seen.length, 1);
  assert.equal(seen[0].hostId, "local");
  assert.equal(seen[0].response.result.success, true);
});

test("default remote thread prewarm requests are served through the local app server", () => {
  const messages = captureRendererMessages();
  const bridge = globalThis.__codexElectronIpcBridge;
  const listener = (event, message) => {
    assert.equal(message.type, "thread-prewarm-start");
    assert.equal(message.hostId, "local");
    assert.equal(message.request.method, "thread/start");
    assert.equal(message.request.params.hostId, "local");
    event.reply("codex_desktop:message-for-view", {
      type: "mcp-response",
      hostId: "local",
      message: {
        jsonrpc: "2.0",
        id: message.request.id,
        result: {
          thread: {
            id: "prewarmed-thread",
            hostId: "local",
            cwd: "/repo/alpha",
            title: "Prewarmed thread",
          },
        },
      },
    });
  };

  ipcMain.on("codex_desktop:message-from-view", listener);
  try {
    bridge.handleRendererSend("codex_desktop:message-from-view", [
      {
        type: "thread-prewarm-start",
        hostId: "remote:default",
        request: {
          jsonrpc: "2.0",
          id: "prewarm-thread-start",
          method: "thread/start",
          params: { hostId: "remote:default", cwd: "/repo/alpha" },
        },
      },
    ]);
  } finally {
    ipcMain.off("codex_desktop:message-from-view", listener);
  }

  assert.equal(messages[0].args[0].hostId, "remote:default");
  assert.deepEqual(messages[0].args[0].message.result.thread, {
    id: "prewarmed-thread",
    hostId: "remote:default",
    cwd: "/repo/alpha",
    title: "Prewarmed thread",
  });
});

test("local thread start responses stay on the local host", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "thread-prewarm-start",
      hostId: "local",
      request: {
        jsonrpc: "2.0",
        id: "local-thread-start",
        method: "thread/start",
        params: { hostId: "local", cwd: "/repo/local" },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "local-thread-start",
      result: {
        thread: {
          id: "local-thread",
          hostId: "local",
          cwd: "/repo/local",
          title: "Local thread",
        },
      },
    },
  });

  assert.equal(messages[0].args[0].hostId, "local");
  assert.equal(messages[0].args[0].message.result.thread.hostId, "local");
});

test("local thread notifications stay on the local host", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "thread-prewarm-start",
      hostId: "local",
      request: {
        jsonrpc: "2.0",
        id: "local-notification-thread-start",
        method: "thread/start",
        params: { hostId: "local", cwd: "/tmp/projectless" },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "local-notification-thread-start",
      result: {
        thread: {
          id: "local-notification-thread",
          hostId: "local",
          cwd: "/tmp/projectless",
          title: "Local notification thread",
        },
      },
    },
  });
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-notification",
    hostId: "local",
    method: "turn/completed",
    params: {
      threadId: "local-notification-thread",
      turn: { id: "turn-1", status: "completed" },
    },
  });

  assert.equal(messages[1].args[0].hostId, "local");
  assert.equal(
    messages[1].args[0].params.threadId,
    "local-notification-thread",
  );
});

test("default remote ipc fetch requests are served through the local app server", () => {
  const messages = captureRendererMessages();
  const bridge = globalThis.__codexElectronIpcBridge;
  const window = new BrowserWindow();
  const listener = (event, message) => {
    assert.equal(message.type, "fetch");
    const body = JSON.parse(message.body);
    assert.equal(body.method, "fs-read-directory");
    assert.equal(body.params.hostId, "local");
    event.reply("codex_desktop:message-for-view", {
      type: "fetch-response",
      requestId: message.requestId,
      responseType: "success",
      status: 200,
      headers: {},
      bodyJsonString: JSON.stringify({
        hostId: "local",
        entries: [],
      }),
    });
  };

  ipcMain.on("codex_desktop:message-from-view", listener);
  try {
    bridge.handleRendererSend("codex_desktop:message-from-view", [
      {
        type: "fetch",
        requestId: "remote-default-ipc-request",
        method: "POST",
        url: "vscode://codex/ipc-request",
        body: JSON.stringify({
          method: "fs-read-directory",
          params: { hostId: "remote:default", path: "/repo" },
        }),
      },
    ]);
  } finally {
    ipcMain.off("codex_desktop:message-from-view", listener);
  }

  assert.deepEqual(JSON.parse(messages[0].args[0].bodyJsonString), {
    hostId: "remote:default",
    entries: [],
  });
});

test("default remote codex fetch params are served through the local app server", () => {
  const messages = captureRendererMessages();
  const bridge = globalThis.__codexElectronIpcBridge;
  const window = new BrowserWindow();
  const listener = (event, message) => {
    assert.equal(message.type, "fetch");
    const body = JSON.parse(message.body);
    assert.equal(body.params.hostId, "local");
    event.reply("codex_desktop:message-for-view", {
      type: "fetch-response",
      requestId: message.requestId,
      responseType: "success",
      status: 200,
      headers: {},
      bodyJsonString: JSON.stringify({ hostId: "local", codexHome: "/home" }),
    });
  };

  ipcMain.on("codex_desktop:message-from-view", listener);
  try {
    bridge.handleRendererSend("codex_desktop:message-from-view", [
      {
        type: "fetch",
        requestId: "remote-default-codex-home",
        method: "POST",
        url: "vscode://codex/codex-home",
        body: JSON.stringify({
          params: { hostId: "remote:default" },
        }),
      },
    ]);
  } finally {
    ipcMain.off("codex_desktop:message-from-view", listener);
  }

  assert.deepEqual(JSON.parse(messages[0].args[0].bodyJsonString), {
    hostId: "remote:default",
    codexHome: "/home",
  });
});

test("default remote start-conversation fetch localizes nested host ids", () => {
  const messages = captureRendererMessages();
  const bridge = globalThis.__codexElectronIpcBridge;
  const window = new BrowserWindow();
  const listener = (event, message) => {
    const body = JSON.parse(message.body);
    assert.equal(body.hostId, "local");
    assert.equal(body.projectAssignment.hostId, "local");
    assert.equal(body.preparePrimaryRuntimeForFirstTurn, false);
    event.reply("codex_desktop:message-for-view", {
      type: "fetch-response",
      requestId: message.requestId,
      responseType: "success",
      status: 200,
      headers: {},
      bodyJsonString: JSON.stringify("thread-created"),
    });
  };

  ipcMain.on("codex_desktop:message-from-view", listener);
  try {
    bridge.handleRendererSend("codex_desktop:message-from-view", [
      {
        type: "fetch",
        requestId: "remote-default-start-conversation",
        method: "POST",
        url: "vscode://codex/start-conversation",
        body: JSON.stringify({
          hostId: "remote:default",
          input: [{ type: "text", text: "hello", text_elements: [] }],
          projectAssignment: {
            projectKind: "remote",
            projectId: "/repo",
            path: "/repo",
            hostId: "remote:default",
          },
          preparePrimaryRuntimeForFirstTurn: true,
        }),
      },
    ]);
  } finally {
    ipcMain.off("codex_desktop:message-from-view", listener);
  }

  assert.equal(JSON.parse(messages[0].args[0].bodyJsonString), "thread-created");
});

test("developer instructions guard Codex automations away from OS schedulers", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "fetch",
      requestId: "developer-instructions",
      method: "POST",
      url: "vscode://codex/developer-instructions",
      body: JSON.stringify({
        hostId: "local",
        params: { cwd: "/repo" },
      }),
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "fetch-response",
    requestId: "developer-instructions",
    responseType: "success",
    status: 200,
    headers: {},
    bodyJsonString: JSON.stringify({
      instructions: "Existing instructions.",
    }),
  });

  const body = JSON.parse(messages[0].args[0].bodyJsonString);
  assert.match(body.instructions, /Existing instructions\./);
  assert.match(body.instructions, /Codex Automations are app-level automations/);
  assert.match(
    body.instructions,
    /Do not implement Codex Automations by editing OS crontab/,
  );
});

test("app-server notifications present local host payloads as default remote", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();

  window.webContents.send("codex_desktop:message-for-view", {
    type: "codex-app-server-conversation-state",
    hostId: "local",
    conversation: {
      id: "notification-thread",
      hostId: "local",
      cwd: "/repo/alpha",
      title: "Notification thread",
    },
  });

  assert.equal(messages[0].args[0].hostId, "remote:default");
  assert.deepEqual(messages[0].args[0].conversation, {
    id: "notification-thread",
    hostId: "remote:default",
    cwd: "/repo/alpha",
    title: "Notification thread",
  });
});

test("local pinned hydration keeps pinned summaries as default remote threads", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "local",
      request: {
        jsonrpc: "2.0",
        id: "local-pinned-hydration-request",
        method: "hydrate-pinned-threads",
        params: { hostId: "local", threadIds: ["pinned-thread"] },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "local-pinned-hydration-request",
      result: {
        threads: [
          {
            conversationId: "pinned-thread",
            hostId: "local",
            cwd: "/repo/alpha",
            title: "Pinned thread",
          },
        ],
      },
    },
  });

  assert.deepEqual(messages[0].args[0].message.result, {
    threads: [
      {
        conversationId: "pinned-thread",
        hostId: "remote:default",
        cwd: "/repo/alpha",
        title: "Pinned thread",
      },
    ],
  });
});

test("non-list mcp responses still normalize embedded thread payloads", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "local",
      request: {
        jsonrpc: "2.0",
        id: "hydration-request",
        method: "hydrate-background-threads",
        params: {},
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "hydration-request",
      result: {
        threads: [
          {
            conversationId: "hydrated-thread",
            hostId: "local",
            cwd: "/repo/alpha",
            title: "Hydrated thread",
          },
        ],
      },
    },
  });

  assert.deepEqual(messages[0].args[0].message.result.threads[0], {
    conversationId: "hydrated-thread",
    hostId: "remote:default",
    cwd: "/repo/alpha",
    title: "Hydrated thread",
  });
});

test("single-thread local mcp responses are routed as default remote", () => {
  const messages = captureRendererMessages();
  const window = new BrowserWindow();
  const bridge = globalThis.__codexElectronIpcBridge;

  bridge.handleRendererSend("codex_desktop:message-from-view", [
    {
      type: "mcp-request",
      hostId: "local",
      request: {
        jsonrpc: "2.0",
        id: "read-thread-request",
        method: "thread/read",
        params: { conversationId: "read-thread" },
      },
    },
  ]);
  window.webContents.send("codex_desktop:message-for-view", {
    type: "mcp-response",
    hostId: "local",
    message: {
      jsonrpc: "2.0",
      id: "read-thread-request",
      result: {
        thread: {
          id: "read-thread",
          hostId: "local",
          cwd: "/repo/alpha",
          title: "Read thread",
        },
      },
    },
  });

  assert.equal(messages[0].args[0].hostId, "remote:default");
  assert.deepEqual(messages[0].args[0].message.result.thread, {
    id: "read-thread",
    hostId: "remote:default",
    cwd: "/repo/alpha",
    title: "Read thread",
  });
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

test("git worker requests run default remote host operations through local app-server", async () => {
  const request = {
    type: "worker-request",
    workerId: "git",
    request: {
      id: "git-worker-host-config-test",
      method: "availability",
      params: {
        hostConfig: {
          id: "remote:default",
          display_name: "idp-dev",
          kind: "ssh",
        },
        operationSource: "local_conversation_thread",
      },
    },
  };

  const channel = "codex_desktop:worker:git:from-view";

  try {
    ipcMain.handle(channel, async (event, message) => {
      assert.deepEqual(message.request.params.hostConfig, {
        id: "local",
        display_name: "Local",
        kind: "local",
      });
      event.sender.send("codex_desktop:worker:git:for-view", {
        type: "worker-response",
        workerId: "git",
        response: {
          id: "git-worker-host-config-test",
          method: "availability",
          result: { type: "ok", value: { available: true } },
        },
      });
    });

    await globalThis.__codexElectronIpcBridge.handleRendererInvoke(
      channel,
      [request],
      "http://localhost:5175/",
    );
  } finally {
    ipcMain.removeHandler(channel);
  }
});

test("net.fetch ignores Sentry IPC transport URLs", async () => {
  const response = await net.fetch("sentry-ipc://scope/sentry_key");

  assert.equal(response.status, 204);
});
