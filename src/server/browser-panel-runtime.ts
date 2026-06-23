const MESSAGE_FOR_VIEW_CHANNEL = "codex_desktop:message-for-view";

type MainToRendererMessage = {
  type: "ipc-main-event";
  channel: string;
  args: unknown[];
};

type BrowserPanelRuntimeOptions = {
  broadcastToRenderer: (message: MainToRendererMessage) => void;
};

type BrowserPanelSnapshot = {
  annotationEditorMode: "comment";
  canGoBack: boolean;
  canGoForward: boolean;
  commentModeDisabledReason: null;
  comments: unknown[];
  faviconUrl: string | null;
  interactionMode: "browse" | "comment";
  isAnnotationAddModifierPressed: boolean;
  isAudible: boolean;
  isCapturingUserMedia: boolean;
  isDesignModifierPressed: boolean;
  isLoading: boolean;
  isOriginalViewEnabled: boolean;
  isSuspended: boolean;
  isTweaksEditorOpen: boolean;
  tabType: "web";
  title: string;
  url: string;
  zoomPercent: number;
};

type BrowserPanelStateMessage = {
  type: "browser-sidebar-state";
  conversationId: string;
  browserTabId: string;
  snapshot: BrowserPanelSnapshot;
};

type BrowserPanelFindState = {
  activeMatchOrdinal: number;
  matches: number;
  query: string;
};

type BrowserPanelFindStateMessage = {
  type: "browser-sidebar-find-state";
  conversationId: string;
  browserTabId: string;
  state: BrowserPanelFindState;
};

type BrowserPanelScreenshotCopyFailedMessage = {
  type: "browser-sidebar-screenshot-copy-failed";
  conversationId: string;
  browserTabId: string;
};

export type BrowserPanelRuntime = {
  handleMessageFromView: (message: unknown) => boolean;
};

type BrowserTabState = {
  conversationId: string;
  findState: BrowserPanelFindState;
  history: string[];
  historyIndex: number;
  browserTabId: string;
  snapshot: BrowserPanelSnapshot;
};

const BROWSER_ZOOM_LEVELS = [
  25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 133, 150, 170, 200, 250, 300,
  400, 500,
];

export function createBrowserPanelRuntime({
  broadcastToRenderer,
}: BrowserPanelRuntimeOptions): BrowserPanelRuntime {
  const tabs = new Map<string, BrowserTabState>();

  const broadcast = (
    payload:
      | BrowserPanelFindStateMessage
      | BrowserPanelScreenshotCopyFailedMessage
      | BrowserPanelStateMessage,
  ): void => {
    broadcastToRenderer({
      type: "ipc-main-event",
      channel: MESSAGE_FOR_VIEW_CHANNEL,
      args: [payload],
    });
  };

  const broadcastState = (tab: BrowserTabState): void => {
    broadcast({
      type: "browser-sidebar-state",
      conversationId: tab.conversationId,
      browserTabId: tab.browserTabId,
      snapshot: tab.snapshot,
    });
  };

  const broadcastFindState = (tab: BrowserTabState): void => {
    broadcast({
      type: "browser-sidebar-find-state",
      conversationId: tab.conversationId,
      browserTabId: tab.browserTabId,
      state: tab.findState,
    });
  };

  return {
    handleMessageFromView(message: unknown): boolean {
      if (!isRecord(message)) {
        return false;
      }

      if (message.type === "browser-sidebar-webview-host-created") {
        const tabRef = resolveBrowserTabRef(
          message.conversationId,
          message.browserTabId,
        );
        if (tabRef == null) {
          return false;
        }
        const tab = tabs.get(tabRef.key);
        if (!tab) {
          return false;
        }
        broadcastState(tab);
        return true;
      }

      if (message.type !== "browser-sidebar-command") {
        return false;
      }

      const tabRef = resolveBrowserTabRef(
        message.conversationId,
        message.browserTabId,
      );
      if (tabRef == null || !isRecord(message.command)) {
        return false;
      }

      if (message.command.type === "navigate") {
        const url =
          typeof message.command.url === "string" ? message.command.url : "";
        const previousTab = tabs.get(tabRef.key);
        const tab = navigateBrowserTab({
          browserTabId: tabRef.browserTabId,
          conversationId: tabRef.conversationId,
          previousTab,
          rawUrl: url,
        });
        tabs.set(tabRef.key, tab);
        broadcastState(tab);
        return true;
      }

      if (
        message.command.type === "reload" ||
        message.command.type === "stop"
      ) {
        const tab = tabs.get(tabRef.key);
        if (!tab) {
          return false;
        }
        broadcastState(tab);
        return true;
      }

      if (
        message.command.type === "close-tab" ||
        message.command.type === "transfer-conversation"
      ) {
        tabs.delete(tabRef.key);
        return true;
      }

      if (message.command.type === "go-back") {
        const tab = tabs.get(tabRef.key);
        if (!tab) {
          return false;
        }
        if (tab.historyIndex > 0) {
          tab.historyIndex -= 1;
          syncSnapshotFromHistory(tab);
        }
        broadcastState(tab);
        return true;
      }

      if (message.command.type === "go-forward") {
        const tab = tabs.get(tabRef.key);
        if (!tab) {
          return false;
        }
        if (tab.historyIndex < tab.history.length - 1) {
          tab.historyIndex += 1;
          syncSnapshotFromHistory(tab);
        }
        broadcastState(tab);
        return true;
      }

      if (message.command.type === "set-zoom-percent") {
        const tab = tabs.get(tabRef.key);
        if (!tab || typeof message.command.zoomPercent !== "number") {
          return false;
        }
        updateZoom(tab, message.command.zoomPercent);
        broadcastState(tab);
        return true;
      }

      if (message.command.type === "step-zoom") {
        const tab = tabs.get(tabRef.key);
        if (!tab || typeof message.command.delta !== "number") {
          return false;
        }
        updateZoom(
          tab,
          stepZoomPercent(tab.snapshot.zoomPercent, message.command.delta),
        );
        broadcastState(tab);
        return true;
      }

      if (message.command.type === "reset-zoom") {
        const tab = tabs.get(tabRef.key);
        if (!tab) {
          return false;
        }
        updateZoom(tab, 100);
        broadcastState(tab);
        return true;
      }

      if (message.command.type === "set-interaction-mode") {
        const tab = tabs.get(tabRef.key);
        const interactionMode = message.command.interactionMode;
        if (
          !tab ||
          (interactionMode !== "browse" && interactionMode !== "comment")
        ) {
          return false;
        }
        tab.snapshot = {
          ...tab.snapshot,
          annotationEditorMode: "comment",
          interactionMode,
        };
        broadcastState(tab);
        return true;
      }

      if (message.command.type === "set-design-modifier-pressed") {
        const tab = tabs.get(tabRef.key);
        if (!tab || typeof message.command.pressed !== "boolean") {
          return false;
        }
        tab.snapshot = {
          ...tab.snapshot,
          isDesignModifierPressed: message.command.pressed,
        };
        broadcastState(tab);
        return true;
      }

      if (message.command.type === "set-original-view-enabled") {
        const tab = tabs.get(tabRef.key);
        if (!tab || typeof message.command.enabled !== "boolean") {
          return false;
        }
        tab.snapshot = {
          ...tab.snapshot,
          isOriginalViewEnabled: message.command.enabled,
        };
        broadcastState(tab);
        return true;
      }

      if (isNativeOnlyNoopCommand(message.command.type)) {
        return tabs.has(tabRef.key);
      }

      if (message.command.type === "open-find") {
        const tab = tabs.get(tabRef.key);
        if (!tab) {
          return false;
        }
        broadcastFindState(tab);
        return true;
      }

      if (message.command.type === "set-find-query") {
        const tab = tabs.get(tabRef.key);
        if (!tab || typeof message.command.query !== "string") {
          return false;
        }
        tab.findState = createFindState(message.command.query);
        broadcastFindState(tab);
        return true;
      }

      if (
        message.command.type === "find-next" ||
        message.command.type === "find-previous"
      ) {
        const tab = tabs.get(tabRef.key);
        if (!tab) {
          return false;
        }
        broadcastFindState(tab);
        return true;
      }

      if (message.command.type === "close-find") {
        const tab = tabs.get(tabRef.key);
        if (!tab) {
          return false;
        }
        tab.findState = createFindState("");
        broadcastFindState(tab);
        return true;
      }

      if (message.command.type === "capture-screenshot") {
        const tab = tabs.get(tabRef.key);
        broadcast({
          type: "browser-sidebar-screenshot-copy-failed",
          conversationId: tab?.conversationId ?? tabRef.conversationId,
          browserTabId: tab?.browserTabId ?? tabRef.browserTabId,
        });
        return true;
      }

      return false;
    },
  };
}

export function handleBrowserPanelRuntimeIpcMessage(
  browserPanelRuntime: BrowserPanelRuntime,
  channel: string,
  args: unknown[],
): boolean {
  if (channel !== "codex_desktop:message-from-view") {
    return false;
  }
  return browserPanelRuntime.handleMessageFromView(args[0]);
}

export function createBrowserPanelSnapshot(
  rawUrl: string,
): BrowserPanelSnapshot {
  const url = normalizeBrowserPanelUrl(rawUrl);
  return {
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
    title: titleFromUrl(url),
    url,
    zoomPercent: 100,
  };
}

export function normalizeBrowserPanelUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return "about:blank";
  }

  if (trimmed === "about:blank") {
    return trimmed;
  }

  try {
    return new URL(trimmed).href;
  } catch {
    try {
      return new URL(`https://${trimmed}`).href;
    } catch {
      return "about:blank";
    }
  }
}

function navigateBrowserTab({
  browserTabId,
  conversationId,
  previousTab,
  rawUrl,
}: {
  browserTabId: string;
  conversationId: string;
  previousTab: BrowserTabState | undefined;
  rawUrl: string;
}): BrowserTabState {
  const url = normalizeBrowserPanelUrl(rawUrl);
  const history =
    previousTab == null
      ? [url]
      : previousTab.history.slice(0, previousTab.historyIndex + 1);
  if (history.at(-1) !== url) {
    history.push(url);
  }
  const historyIndex = history.length - 1;
  const snapshot = createBrowserPanelSnapshot(url);
  if (previousTab != null) {
    snapshot.zoomPercent = previousTab.snapshot.zoomPercent;
  }
  snapshot.canGoBack = historyIndex > 0;
  snapshot.canGoForward = historyIndex < history.length - 1;
  return {
    browserTabId,
    conversationId,
    findState: previousTab?.findState ?? createFindState(""),
    history,
    historyIndex,
    snapshot,
  };
}

function syncSnapshotFromHistory(tab: BrowserTabState): void {
  const previousZoom = tab.snapshot.zoomPercent;
  const snapshot = createBrowserPanelSnapshot(
    tab.history[tab.historyIndex] ?? "about:blank",
  );
  snapshot.zoomPercent = previousZoom;
  snapshot.canGoBack = tab.historyIndex > 0;
  snapshot.canGoForward = tab.historyIndex < tab.history.length - 1;
  tab.snapshot = snapshot;
}

function updateZoom(tab: BrowserTabState, zoomPercent: number): void {
  tab.snapshot = {
    ...tab.snapshot,
    zoomPercent: normalizeZoomPercent(zoomPercent),
  };
}

function normalizeZoomPercent(zoomPercent: number): number {
  const finiteZoom = Number.isFinite(zoomPercent) ? zoomPercent : 100;
  return Math.min(500, Math.max(25, Math.round(finiteZoom)));
}

function stepZoomPercent(currentZoomPercent: number, delta: number): number {
  const direction = delta >= 0 ? 1 : -1;
  const currentIndex = BROWSER_ZOOM_LEVELS.findIndex(
    (zoomPercent) => zoomPercent >= currentZoomPercent,
  );
  const index =
    currentIndex === -1
      ? BROWSER_ZOOM_LEVELS.length - 1
      : currentIndex;
  const nextIndex = Math.min(
    BROWSER_ZOOM_LEVELS.length - 1,
    Math.max(0, index + direction),
  );
  return BROWSER_ZOOM_LEVELS[nextIndex] ?? 100;
}

function createFindState(query: string): BrowserPanelFindState {
  return {
    activeMatchOrdinal: 0,
    matches: 0,
    query,
  };
}

function isNativeOnlyNoopCommand(commandType: unknown): boolean {
  return (
    commandType === "focus-address" ||
    commandType === "refresh-cursor" ||
    commandType === "scroll" ||
    commandType === "print" ||
    commandType === "reset" ||
    commandType === "select-comment" ||
    commandType === "clear-comments" ||
    commandType === "discard-pending-annotations" ||
    commandType === "add-annotations-to-composer"
  );
}

function titleFromUrl(url: string): string {
  if (url === "about:blank") {
    return "New tab";
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.href;
  } catch {
    return url;
  }
}

function resolveBrowserTabRef(
  conversationId: unknown,
  browserTabId: unknown,
): { browserTabId: string; conversationId: string; key: string } | null {
  if (typeof conversationId !== "string") {
    return null;
  }
  const resolvedBrowserTabId =
    typeof browserTabId === "string"
      ? browserTabId
      : defaultBrowserTabId(conversationId);
  return {
    browserTabId: resolvedBrowserTabId,
    conversationId,
    key: `${conversationId}\0${resolvedBrowserTabId}`,
  };
}

function defaultBrowserTabId(conversationId: string): string {
  return `${conversationId}:legacy`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
