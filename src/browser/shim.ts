import {
  mapBrowserPathToInitialRoute,
  mapMemoryPathToBrowserPath,
} from "./routes";
import {
  handleLocalFilePickerMessage,
  isLocalFilePickerMessage,
  uploadFiles,
} from "./files";
import { installBrowserFileDropUploadBridge } from "./drop-upload.mts";
import { installSentryIpcFetchNoop } from "./sentry-ipc-fetch.mts";
import {
  installWorkspaceRootDialog,
  openSelectWorkspaceRootDialog,
  type WorkspaceDirectoryEntries,
} from "./workspace-root-dialog";
import {
  handleSyncIpc,
  hostConfigForRoute,
  isReadConfigForHostFetchMessage,
  normalizeReadConfigForHostFetchResponse,
  normalizeSharedObjectUpdateForRoute,
} from "./sync-ipc.mts";
import { createStatsigOverrideAdapter } from "./statsig-overrides.mts";
import { getPathForFile } from "./web-utils.mts";
import { exposedMainWorldValue } from "./context-bridge.mts";
import {
  initialSidebarStateForRoute,
  isMobileSidebarViewport,
} from "./mobile-viewport.mts";

type IpcListener = (event: unknown, ...args: unknown[]) => void;

type RendererToMainMessage =
  | {
      type: "ipc-renderer-invoke";
      requestId: string;
      channel: string;
      args: unknown[];
      sourceUrl: string;
    }
  | {
      type: "ipc-renderer-send";
      channel: string;
      args: unknown[];
      sourceUrl: string;
      portIds?: string[];
    }
  | {
      type: "virtual-port-message";
      portId: string;
      data: unknown;
    }
  | {
      type: "workspace-directory-entries-request";
      requestId: string;
      directoryPath: string | null;
      directoriesOnly: boolean;
    };

type MainToRendererMessage =
  | {
      type: "ipc-main-event";
      channel: string;
      args: unknown[];
      portIds?: string[];
    }
  | {
      type: "ipc-renderer-invoke-result";
      requestId: string;
      ok: true;
      result: unknown;
    }
  | {
      type: "ipc-renderer-invoke-result";
      requestId: string;
      ok: false;
      errorMessage: string;
    }
  | {
      type: "workspace-directory-entries-result";
      requestId: string;
      ok: true;
      result: WorkspaceDirectoryEntries;
    }
  | {
      type: "workspace-directory-entries-result";
      requestId: string;
      ok: false;
      errorMessage: string;
    }
  | {
      type: "virtual-port-message";
      portId: string;
      data: unknown;
    }
  | {
      type: "virtual-port-close";
      portId: string;
    };

const RECONNECT_DELAY_MS = 1_000;

type MemoryNavigationChange = {
  action: "POP" | "PUSH" | "REPLACE";
  delta: number;
  location: {
    hash: string;
    key: string;
    pathname: string;
    search: string;
    state: unknown;
  };
};

type ElectronShimState = {
  initialRoute?: string;
  initialSidebarState?: boolean;
  closeSidebar?: () => void;
  onMemoryNavigationChanged?: (navigation: MemoryNavigationChange) => void;
  overrideAdapter?: ReturnType<typeof createStatsigOverrideAdapter>;
};

declare global {
  interface Window {
    __CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__?: string;
    __ELECTRON_SHIM__?: ElectronShimState;
  }
}

declare const __CODEX_APP_VERSION__: string;

let requestCounter = 0;
let socket: WebSocket | null = null;
let reconnectTimeoutId: number | null = null;
const outboundQueue: RendererToMainMessage[] = [];
const pendingInvokes = new Map<
  string,
  {
    reject: (reason?: unknown) => void;
    resolve: (value: unknown) => void;
  }
>();
const pendingDirectoryEntries = new Map<
  string,
  {
    reject: (reason?: unknown) => void;
    resolve: (value: WorkspaceDirectoryEntries) => void;
  }
>();
const readConfigForHostRequestIds = new Set<string>();
const rendererListeners = new Map<string, Set<IpcListener>>();
const virtualPorts = new Map<string, MessagePort>();
let currentMemoryPath = "/";

export function emitRendererEvent(
  channel: string,
  args: unknown[],
  portIds: string[] = [],
): void {
  const normalizedArgs = normalizeRendererEventArgs(channel, args);
  const listeners = rendererListeners.get(channel);
  if (!listeners || listeners.size === 0) {
    return;
  }
  const event = {
    ports: portIds.flatMap((portId) => {
      const port = virtualPorts.get(portId);
      return port ? [port] : [];
    }),
    sender: null,
  };
  for (const listener of listeners) {
    listener(event, ...normalizedArgs);
  }
}

function normalizeRendererEventArgs(
  channel: string,
  args: unknown[],
): unknown[] {
  if (channel !== "codex_desktop:message-for-view" || args.length === 0) {
    return args;
  }
  const message = normalizeRendererMessageForView(
    normalizeSharedObjectUpdateForRoute(args[0], currentMemoryPath),
  );
  return [message, ...args.slice(1)];
}

function normalizeRendererMessageForView(message: unknown): unknown {
  if (!isRecord(message) || typeof message.requestId !== "string") {
    return message;
  }
  if (!readConfigForHostRequestIds.has(message.requestId)) {
    return message;
  }
  if (message.type === "fetch-response") {
    readConfigForHostRequestIds.delete(message.requestId);
    return normalizeReadConfigForHostFetchResponse(message);
  }
  return message;
}

function handleIncomingMessage(message: MainToRendererMessage): void {
  if (message.type === "virtual-port-message") {
    virtualPorts.get(message.portId)?.postMessage(message.data);
    return;
  }

  if (message.type === "virtual-port-close") {
    const port = virtualPorts.get(message.portId);
    if (!port) {
      return;
    }
    virtualPorts.delete(message.portId);
    port.close();
    return;
  }

  if (message.type === "ipc-main-event") {
    emitRendererEvent(message.channel, message.args, message.portIds);
    return;
  }

  if (message.type === "ipc-renderer-invoke-result") {
    const pending = pendingInvokes.get(message.requestId);
    if (!pending) {
      return;
    }
    pendingInvokes.delete(message.requestId);
    if (message.ok) {
      pending.resolve(message.result);
      return;
    }
    pending.reject(new Error(message.errorMessage));
    return;
  }

  if (message.type === "workspace-directory-entries-result") {
    const pending = pendingDirectoryEntries.get(message.requestId);
    if (!pending) {
      return;
    }
    pendingDirectoryEntries.delete(message.requestId);
    if (message.ok) {
      pending.resolve(message.result);
      return;
    }
    pending.reject(new Error(message.errorMessage));
  }
}

function flushOutboundQueue(): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  for (const message of outboundQueue.splice(0)) {
    socket.send(JSON.stringify(message));
  }
}

function rejectPendingRequests(error: Error): void {
  for (const [requestId, pending] of pendingInvokes) {
    pendingInvokes.delete(requestId);
    pending.reject(error);
  }
  for (const [requestId, pending] of pendingDirectoryEntries) {
    pendingDirectoryEntries.delete(requestId);
    pending.reject(error);
  }
  readConfigForHostRequestIds.clear();
}

function scheduleReconnect(): void {
  if (reconnectTimeoutId !== null) {
    return;
  }
  reconnectTimeoutId = window.setTimeout(() => {
    reconnectTimeoutId = null;
    ensureSocket();
  }, RECONNECT_DELAY_MS);
}

function ensureSocket(): void {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  const socketUrl = new URL(
    `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/__backend/ipc`,
  );
  const token = window.__CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__;
  if (token) {
    socketUrl.searchParams.set("token", token);
  }
  socket = new WebSocket(socketUrl);
  socket.addEventListener("open", () => {
    flushOutboundQueue();
  });
  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as MainToRendererMessage;
      handleIncomingMessage(message);
    } catch (error) {
      console.error(
        "[electron-stub] failed to parse IPC bridge message",
        error,
      );
    }
  });
  socket.addEventListener("close", () => {
    rejectPendingRequests(new Error("IPC bridge socket closed"));
    scheduleReconnect();
  });
  socket.addEventListener("error", () => {
    rejectPendingRequests(new Error("IPC bridge socket error"));
    scheduleReconnect();
  });
}

function enqueueMessage(message: RendererToMainMessage): void {
  outboundQueue.push(message);
  ensureSocket();
  flushOutboundQueue();
}

function nextRequestId(): string {
  requestCounter += 1;
  return `ipc_bridge_${requestCounter}`;
}

function nextVirtualPortId(): string {
  requestCounter += 1;
  return `virtual_port_${requestCounter}_${crypto.randomUUID()}`;
}

function sourceUrl(): string {
  return window.location.href;
}

function registerVirtualPort(port: MessagePort): string {
  const portId = nextVirtualPortId();
  virtualPorts.set(portId, port);
  port.addEventListener("message", (event) => {
    enqueueMessage({
      type: "virtual-port-message",
      portId,
      data: event.data,
    });
  });
  port.addEventListener("messageerror", () => {
    virtualPorts.delete(portId);
    enqueueMessage({
      type: "virtual-port-close",
      portId,
    });
  });
  port.start();
  return portId;
}

function invokeMain(channel: string, args: unknown[]): Promise<unknown> {
  const requestId = nextRequestId();
  return new Promise((resolve, reject) => {
    pendingInvokes.set(requestId, { resolve, reject });
    enqueueMessage({
      type: "ipc-renderer-invoke",
      requestId,
      channel,
      args,
      sourceUrl: sourceUrl(),
    });
  });
}

function addIpcListener(channel: string, listener: IpcListener): void {
  const listeners = rendererListeners.get(channel) ?? new Set<IpcListener>();
  listeners.add(listener);
  rendererListeners.set(channel, listeners);
}

function shouldCloseSidebarForMemoryPath(path: string): boolean {
  return (
    path === "/" ||
    path.startsWith("/local/") ||
    path === "/skills" ||
    path === "/automations"
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnhandledAddWorkspaceRootOptionMessage(value: unknown): value is {
  root?: unknown;
  type: "electron-add-new-workspace-root-option";
} {
  return (
    isRecord(value) &&
    value.type === "electron-add-new-workspace-root-option" &&
    typeof value.root !== "string"
  );
}

function isOpenInBrowserMessage(value: unknown): value is {
  type: "open-in-browser";
  url: string;
} {
  return (
    isRecord(value) &&
    value.type === "open-in-browser" &&
    typeof value.url === "string"
  );
}

function requestWorkspaceDirectoryEntries(
  directoryPath: string | null,
): Promise<WorkspaceDirectoryEntries> {
  const requestId = nextRequestId();
  return new Promise((resolve, reject) => {
    pendingDirectoryEntries.set(requestId, { resolve, reject });
    enqueueMessage({
      type: "workspace-directory-entries-request",
      requestId,
      directoryPath,
      directoriesOnly: true,
    });
  });
}

const themeMediaQuery = matchMedia("(prefers-color-scheme: dark)");
const electronShim = (window.__ELECTRON_SHIM__ ??= {});

electronShim.overrideAdapter = createStatsigOverrideAdapter();

const initialRoute = mapBrowserPathToInitialRoute(
  window.location.pathname,
  window.location.search,
);
currentMemoryPath = initialRoute.memoryPath;
const initialSidebarState = initialSidebarStateForRoute(
  window,
  initialRoute.memoryPath,
);
electronShim.initialRoute = initialRoute.memoryPath;

if (initialRoute.browserPath) {
  window.history.pushState(undefined, "", initialRoute.browserPath);
}

electronShim.initialSidebarState = initialSidebarState;
electronShim.onMemoryNavigationChanged = (navigation) => {
  const path = navigation.location.pathname;
  currentMemoryPath = path;
  emitRouteScopedHostConfigUpdate();
  if (
    navigation.action !== "POP" &&
    isMobileSidebarViewport(window) &&
    shouldCloseSidebarForMemoryPath(path)
  ) {
    electronShim.closeSidebar?.();
  }

  const browserPath = mapMemoryPathToBrowserPath(path);
  if (browserPath == null) {
    return;
  }

  if (browserPath.titleChange) {
    document.title = browserPath.titleChange;
  }

  if (window.location.pathname === browserPath.path) {
    window.history.replaceState(undefined, "", browserPath.path);
    return;
  }

  window.history.pushState(undefined, "", browserPath.path);
};

function emitRouteScopedHostConfigUpdate(): void {
  emitRendererEvent("codex_desktop:message-for-view", [
    {
      type: "shared-object-updated",
      key: "host_config",
      value: hostConfigForRoute(currentMemoryPath),
    },
  ]);
}

const buildFlavor: "prod" | "dev" | "agent" | string = "prod";

function randomUuidFallback(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function installCryptoRandomUuidFallback(): void {
  if (typeof crypto.randomUUID === "function") {
    return;
  }

  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: randomUuidFallback,
  });
}

installCryptoRandomUuidFallback();
installSentryIpcFetchNoop(window);
installBrowserFileDropUploadBridge({ getPathForFile, uploadFiles });

export const ipcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (channel === "codex_desktop:message-from-view" && args.length === 1) {
      if (isReadConfigForHostFetchMessage(args[0])) {
        readConfigForHostRequestIds.add(args[0].requestId);
      }

      if (isOpenInBrowserMessage(args[0])) {
        window.open(args[0].url, "_blank", "noopener,noreferrer");
      }

      if (isLocalFilePickerMessage(args[0])) {
        return handleLocalFilePickerMessage(args[0]);
      }

      if (isUnhandledAddWorkspaceRootOptionMessage(args[0])) {
        return openSelectWorkspaceRootDialog({
          listDirectory: requestWorkspaceDirectoryEntries,
        }).then((root) => {
          if (!root) {
            return undefined;
          }

          return invokeMain(channel, [{ ...args[0], root }]);
        });
      }
    }

    return invokeMain(channel, args);
  },
  on(channel: string, listener: IpcListener): unknown {
    addIpcListener(channel, listener);
    return this;
  },
  once(channel: string, listener: IpcListener): unknown {
    const wrapped: IpcListener = (event, ...args) => {
      this.removeListener(channel, wrapped);
      listener(event, ...args);
    };
    addIpcListener(channel, wrapped);
    return this;
  },
  addListener(channel: string, listener: IpcListener): unknown {
    addIpcListener(channel, listener);
    return this;
  },
  removeListener(channel: string, listener: IpcListener): unknown {
    rendererListeners.get(channel)?.delete(listener);
    return this;
  },
  off(channel: string, listener: IpcListener): unknown {
    return this.removeListener(channel, listener);
  },
  send(channel: string, ...args: unknown[]): void {
    enqueueMessage({
      type: "ipc-renderer-send",
      channel,
      args,
      sourceUrl: sourceUrl(),
    });
  },
  postMessage(
    channel: string,
    message: unknown,
    transfer?: Transferable[],
  ): void {
    const ports =
      transfer?.filter(
        (value): value is MessagePort =>
          typeof MessagePort !== "undefined" && value instanceof MessagePort,
      ) ?? [];
    const portIds = ports.map(registerVirtualPort);

    enqueueMessage({
      type: "ipc-renderer-send",
      channel,
      args: [message],
      sourceUrl: sourceUrl(),
      ...(portIds.length > 0 ? { portIds } : {}),
    });
  },
  sendSync(channel: string, ..._args: unknown[]): unknown {
    return handleSyncIpc(channel, {
      appVersion: __CODEX_APP_VERSION__,
      buildFlavor,
      getCurrentRoute: () => currentMemoryPath,
      getSystemThemeVariant: () => (themeMediaQuery.matches ? "dark" : "light"),
    });
  },
};

ensureSocket();

export const contextBridge = {
  exposeInMainWorld(_key: string, _api: unknown): void {
    Reflect.set(window, _key, exposedMainWorldValue(_key, _api));
  },
};

export const webUtils = {
  getPathForFile(file: File): string | null {
    return getPathForFile(file);
  },
};
