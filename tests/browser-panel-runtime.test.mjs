import assert from "node:assert/strict";
import test from "node:test";

import {
  createBrowserPanelRuntime,
  createBrowserPanelSnapshot,
  handleBrowserPanelRuntimeIpcMessage,
  normalizeBrowserPanelUrl,
} from "../src/server/browser-panel-runtime.js";

function lastPayload(broadcasts) {
  return broadcasts.at(-1)?.args?.[0];
}

function sendCommand(runtime, command, overrides = {}) {
  return runtime.handleMessageFromView({
    type: "browser-sidebar-command",
    conversationId: "conversation-1",
    browserTabId: "browser-tab-1",
    command,
    ...overrides,
  });
}

test("normalizeBrowserPanelUrl preserves absolute URLs and defaults empty values", () => {
  assert.equal(
    normalizeBrowserPanelUrl("https://example.com"),
    "https://example.com/",
  );
  assert.equal(
    normalizeBrowserPanelUrl("example.com/path"),
    "https://example.com/path",
  );
  assert.equal(normalizeBrowserPanelUrl(""), "about:blank");
  assert.equal(normalizeBrowserPanelUrl("%%"), "about:blank");
  assert.equal(normalizeBrowserPanelUrl("://"), "about:blank");
});

test("handleBrowserPanelRuntimeIpcMessage only consumes handled browser panel IPC", () => {
  const calls = [];
  const runtime = {
    handleMessageFromView(message) {
      calls.push(message);
      return message?.type === "browser-sidebar-command";
    },
  };
  const browserPanelMessage = {
    type: "browser-sidebar-command",
    command: { type: "navigate", url: "example.com" },
  };

  assert.equal(
    handleBrowserPanelRuntimeIpcMessage(
      runtime,
      "codex_desktop:message-from-view",
      [browserPanelMessage],
    ),
    true,
  );
  assert.deepEqual(calls, [browserPanelMessage]);
  assert.equal(
    handleBrowserPanelRuntimeIpcMessage(runtime, "other-channel", [
      browserPanelMessage,
    ]),
    false,
  );
  assert.deepEqual(calls, [browserPanelMessage]);
  assert.equal(
    handleBrowserPanelRuntimeIpcMessage(
      runtime,
      "codex_desktop:message-from-view",
      [{ type: "other-message" }],
    ),
    false,
  );
});

test("createBrowserPanelSnapshot creates a web tab snapshot for renderer browser state", () => {
  assert.deepEqual(createBrowserPanelSnapshot("https://example.com/"), {
    annotationEditorMode: "comment",
    canGoBack: false,
    canGoForward: false,
    commentModeDisabledReason: null,
    comments: [],
    faviconUrl: null,
    interactionMode: "browse",
    isAnnotationAddModifierPressed: false,
    isAudible: false,
    isCapturingUserMedia: false,
    isDesignModifierPressed: false,
    isLoading: false,
    isOriginalViewEnabled: false,
    isSuspended: false,
    isTweaksEditorOpen: false,
    tabType: "web",
    title: "example.com",
    url: "https://example.com/",
    zoomPercent: 100,
  });
});

test("createBrowserPanelSnapshot titles terminal tabs from the cwd project name", () => {
  assert.equal(
    createBrowserPanelSnapshot(
      "http://192.168.132.78:9000/__terminal?cwd=%2Fhome%2Fzhang%2Fcodex-web",
    ).title,
    "codex-web",
  );
  assert.equal(
    createBrowserPanelSnapshot("http://localhost:9000/__terminal").title,
    "Terminal",
  );
});

test("browser panel runtime broadcasts browser-sidebar-state for navigate commands", () => {
  const broadcasts = [];
  const runtime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) => broadcasts.push(message),
  });

  const handled = runtime.handleMessageFromView({
    type: "browser-sidebar-command",
    conversationId: "conversation-1",
    browserTabId: "browser-tab-1",
    command: {
      type: "navigate",
      hostId: "local",
      url: "example.com",
      source: "manual",
      initiator: "toggle_browser_command",
    },
  });

  assert.equal(handled, true);
  assert.equal(broadcasts.length, 1);
  assert.deepEqual(broadcasts[0], {
    type: "ipc-main-event",
    channel: "codex_desktop:message-for-view",
    args: [
      {
        type: "browser-sidebar-state",
        conversationId: "conversation-1",
        browserTabId: "browser-tab-1",
        snapshot: createBrowserPanelSnapshot("https://example.com/"),
      },
    ],
  });
});

test("browser panel runtime resolves omitted browserTabId to the renderer default tab", () => {
  const broadcasts = [];
  const runtime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) => broadcasts.push(message),
  });

  const handled = runtime.handleMessageFromView({
    type: "browser-sidebar-command",
    conversationId: "conversation-1",
    command: {
      type: "navigate",
      url: "example.com",
      source: "manual",
      initiator: "address_bar",
    },
  });

  assert.equal(handled, true);
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0].args[0].browserTabId, "conversation-1:legacy");
  assert.equal(broadcasts[0].args[0].snapshot.url, "https://example.com/");
});

test("browser panel runtime updates an existing tab when a webview host is created", () => {
  const broadcasts = [];
  const runtime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) => broadcasts.push(message),
  });

  runtime.handleMessageFromView({
    type: "browser-sidebar-command",
    conversationId: "conversation-1",
    browserTabId: "browser-tab-1",
    command: {
      type: "navigate",
      url: "https://example.com/first",
    },
  });
  broadcasts.length = 0;

  const handled = runtime.handleMessageFromView({
    type: "browser-sidebar-webview-host-created",
    conversationId: "conversation-1",
    browserTabId: "browser-tab-1",
    hostKind: "right-panel",
  });

  assert.equal(handled, true);
  assert.equal(broadcasts.length, 1);
  assert.equal(
    broadcasts[0].args[0].snapshot.url,
    "https://example.com/first",
  );
});

test("browser panel runtime removes closed tabs and ignores unrelated messages", () => {
  const broadcasts = [];
  const runtime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) => broadcasts.push(message),
  });

  runtime.handleMessageFromView({
    type: "browser-sidebar-command",
    conversationId: "conversation-1",
    browserTabId: "browser-tab-1",
    command: { type: "navigate", url: "https://example.com/" },
  });
  broadcasts.length = 0;

  assert.equal(
    runtime.handleMessageFromView({
      type: "browser-sidebar-command",
      conversationId: "conversation-1",
      browserTabId: "browser-tab-1",
      command: { type: "close-tab" },
    }),
    true,
  );
  assert.equal(
    runtime.handleMessageFromView({
      type: "browser-sidebar-webview-host-created",
      conversationId: "conversation-1",
      browserTabId: "browser-tab-1",
      hostKind: "right-panel",
    }),
    false,
  );
  assert.deepEqual(broadcasts, []);
  assert.equal(runtime.handleMessageFromView({ type: "other-message" }), false);
});

test("browser panel runtime maintains back and forward navigation history", () => {
  const broadcasts = [];
  const runtime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) => broadcasts.push(message),
  });

  assert.equal(
    sendCommand(runtime, { type: "navigate", url: "https://example.com/first" }),
    true,
  );
  assert.equal(
    sendCommand(runtime, { type: "navigate", url: "https://example.com/second" }),
    true,
  );
  assert.equal(lastPayload(broadcasts).snapshot.url, "https://example.com/second");
  assert.equal(lastPayload(broadcasts).snapshot.canGoBack, true);
  assert.equal(lastPayload(broadcasts).snapshot.canGoForward, false);

  assert.equal(sendCommand(runtime, { type: "go-back" }), true);
  assert.equal(lastPayload(broadcasts).snapshot.url, "https://example.com/first");
  assert.equal(lastPayload(broadcasts).snapshot.canGoBack, false);
  assert.equal(lastPayload(broadcasts).snapshot.canGoForward, true);

  assert.equal(sendCommand(runtime, { type: "go-forward" }), true);
  assert.equal(lastPayload(broadcasts).snapshot.url, "https://example.com/second");
  assert.equal(lastPayload(broadcasts).snapshot.canGoBack, true);
  assert.equal(lastPayload(broadcasts).snapshot.canGoForward, false);
});

test("browser panel runtime updates zoom state for toolbar commands", () => {
  const broadcasts = [];
  const runtime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) => broadcasts.push(message),
  });

  sendCommand(runtime, { type: "navigate", url: "https://example.com/" });

  assert.equal(
    sendCommand(runtime, { type: "set-zoom-percent", zoomPercent: 125 }),
    true,
  );
  assert.equal(lastPayload(broadcasts).snapshot.zoomPercent, 125);

  assert.equal(sendCommand(runtime, { type: "step-zoom", delta: 1 }), true);
  assert.equal(lastPayload(broadcasts).snapshot.zoomPercent, 133);

  assert.equal(sendCommand(runtime, { type: "reset-zoom" }), true);
  assert.equal(lastPayload(broadcasts).snapshot.zoomPercent, 100);
});

test("browser panel runtime updates interaction state for annotation commands", () => {
  const broadcasts = [];
  const runtime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) => broadcasts.push(message),
  });

  sendCommand(runtime, { type: "navigate", url: "https://example.com/" });
  broadcasts.length = 0;

  assert.equal(
    sendCommand(runtime, {
      type: "set-interaction-mode",
      interactionMode: "comment",
    }),
    true,
  );
  assert.equal(lastPayload(broadcasts).snapshot.interactionMode, "comment");
  assert.equal(lastPayload(broadcasts).snapshot.annotationEditorMode, "comment");

  assert.equal(
    sendCommand(runtime, {
      type: "set-design-modifier-pressed",
      pressed: true,
    }),
    true,
  );
  assert.equal(lastPayload(broadcasts).snapshot.isDesignModifierPressed, true);

  assert.equal(
    sendCommand(runtime, {
      type: "set-original-view-enabled",
      enabled: true,
    }),
    true,
  );
  assert.equal(lastPayload(broadcasts).snapshot.isOriginalViewEnabled, true);
});

test("browser panel runtime consumes native-only commands as web no-ops", () => {
  const broadcasts = [];
  const runtime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) => broadcasts.push(message),
  });

  sendCommand(runtime, { type: "navigate", url: "https://example.com/" });
  broadcasts.length = 0;

  for (const command of [
    { type: "focus-address" },
    { type: "refresh-cursor" },
    { type: "scroll", scroll: { x: 0, y: 100 } },
    { type: "print" },
    { type: "reset" },
    { type: "select-comment", commentId: "comment-1" },
    { type: "clear-comments" },
    { type: "discard-pending-annotations" },
    { type: "add-annotations-to-composer" },
  ]) {
    assert.equal(sendCommand(runtime, command), true, command.type);
  }

  assert.deepEqual(broadcasts, []);
});

test("browser panel runtime broadcasts find state for find commands", () => {
  const broadcasts = [];
  const runtime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) => broadcasts.push(message),
  });

  sendCommand(runtime, { type: "navigate", url: "https://example.com/" });
  broadcasts.length = 0;

  assert.equal(sendCommand(runtime, { type: "open-find" }), true);
  assert.deepEqual(lastPayload(broadcasts), {
    type: "browser-sidebar-find-state",
    conversationId: "conversation-1",
    browserTabId: "browser-tab-1",
    state: { activeMatchOrdinal: 0, matches: 0, query: "" },
  });

  assert.equal(
    sendCommand(runtime, { type: "set-find-query", query: "Example" }),
    true,
  );
  assert.deepEqual(lastPayload(broadcasts).state, {
    activeMatchOrdinal: 0,
    matches: 0,
    query: "Example",
  });

  assert.equal(sendCommand(runtime, { type: "find-next" }), true);
  assert.equal(sendCommand(runtime, { type: "find-previous" }), true);
  assert.equal(sendCommand(runtime, { type: "close-find" }), true);
  assert.deepEqual(lastPayload(broadcasts).state, {
    activeMatchOrdinal: 0,
    matches: 0,
    query: "",
  });
});

test("browser panel runtime reports screenshot copy failure without native webview capture", () => {
  const broadcasts = [];
  const runtime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) => broadcasts.push(message),
  });

  sendCommand(runtime, { type: "navigate", url: "https://example.com/" });
  broadcasts.length = 0;

  assert.equal(sendCommand(runtime, { type: "capture-screenshot" }), true);
  assert.deepEqual(lastPayload(broadcasts), {
    type: "browser-sidebar-screenshot-copy-failed",
    conversationId: "conversation-1",
    browserTabId: "browser-tab-1",
  });
});
