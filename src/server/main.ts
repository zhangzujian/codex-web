#!/usr/bin/env node

import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs as parseCliArgs } from "node:util";
import { WebSocket, WebSocketServer } from "ws";
import Fastify, { type FastifyReply } from "fastify";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { installModuleAliasHook } from "./module";
import { glob } from "glob";
import {
  createCommandExecRemoteProcessConnection,
  createRemoteTerminalSessionFactory,
  createTerminalSocketHandler,
  type AppServerRpcClient,
  type TerminalSessionFactory,
} from "./terminal";
import { createCodexAppServerClient } from "./app-server-client";
import {
  createBrowserPanelRuntime,
  handleBrowserPanelRuntimeIpcMessage,
} from "./browser-panel-runtime";
import {
  canHandleNativeOpenFetchMessage,
  handleNativeOpenFetchMessage,
} from "./native-open";
import {
  canHandleRemoteDefaultFetchMessage,
  handleRemoteDefaultFetchMessage,
} from "./remote-default-fetch";
import {
  canHandleRemoteDefaultMcpMessage,
  handleRemoteDefaultMcpMessage,
} from "./remote-default-mcp";

type ServerOptions = {
  auth?: {
    token: string;
  };
  host: string;
  port: number;
  tls?: {
    certPath: string;
    keyPath: string;
  };
};

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
      type: "virtual-port-close";
      portId: string;
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

type WorkspaceDirectoryEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
};

type WorkspaceDirectoryEntries = {
  directoryPath: string;
  parentPath: string | null;
  entries: WorkspaceDirectoryEntry[];
};

function workspaceDirectoryEntryTypeRank(
  entry: WorkspaceDirectoryEntry,
): number {
  return entry.type === "directory" ? 0 : 1;
}

function workspaceDirectoryEntryHiddenRank(
  entry: WorkspaceDirectoryEntry,
): number {
  return entry.name.startsWith(".") ? 1 : 0;
}

function compareWorkspaceDirectoryEntries(
  left: WorkspaceDirectoryEntry,
  right: WorkspaceDirectoryEntry,
): number {
  return (
    workspaceDirectoryEntryTypeRank(left) -
      workspaceDirectoryEntryTypeRank(right) ||
    workspaceDirectoryEntryHiddenRank(left) -
      workspaceDirectoryEntryHiddenRank(right) ||
    left.name.localeCompare(right.name)
  );
}

type IpcMainBridgeState = {
  broadcastToRenderer?: (message: MainToRendererMessage) => void;
  handleRendererInvoke?: (
    channel: string,
    args: unknown[],
    sourceUrl?: string,
  ) => Promise<unknown>;
  handleRendererSend?: (
    channel: string,
    args: unknown[],
    sourceUrl?: string,
    ports?: unknown[],
  ) => void;
};

type VirtualMessagePort = {
  __codexVirtualPortId: string;
  close: () => void;
  emitMessage: (data: unknown) => void;
  on: (event: "message" | "close", listener: (event?: unknown) => void) => void;
  postMessage: (data: unknown) => void;
  start: () => void;
};

const BUNDLED_TERMINAL_FONTS = new Map([
  [
    "MesloLGS NF",
    [
      {
        fileName: "MesloLGS NF Regular.ttf",
        fontStyle: "normal",
        fontWeight: 400,
      },
      {
        fileName: "MesloLGS NF Bold.ttf",
        fontStyle: "normal",
        fontWeight: 700,
      },
      {
        fileName: "MesloLGS NF Italic.ttf",
        fontStyle: "italic",
        fontWeight: 400,
      },
      {
        fileName: "MesloLGS NF Bold Italic.ttf",
        fontStyle: "italic",
        fontWeight: 700,
      },
    ],
  ],
]);

function printUsage(): void {
  console.log(
    [
      "Usage:",
      "  server [--host <host>] [--port <port>] [--tls-cert <path> --tls-key <path>] [--auth-token <token>]",
      "",
      "Defaults:",
      "  --host 127.0.0.1",
      "  --port 8214",
      "",
      "Examples:",
      "  yarn server",
      "  yarn server --port 9000",
      "  CODEX_WEB_AUTH_TOKEN=your-token yarn server --host 0.0.0.0 --port 9443 --tls-cert certs/codex-web.crt --tls-key certs/codex-web.key",
    ].join("\n"),
  );
}

function parsePort(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }
  return parsed;
}

export function parseServerArgs(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): ServerOptions {
  const parsed = parseCliArgs({
    args,
    allowPositionals: false,
    options: {
      help: {
        short: "h",
        type: "boolean",
      },
      host: {
        type: "string",
      },
      port: {
        type: "string",
      },
      "tls-cert": {
        type: "string",
      },
      "tls-key": {
        type: "string",
      },
      "auth-token": {
        type: "string",
      },
    },
    strict: true,
  });

  if (parsed.values.help) {
    printUsage();
    process.exit(0);
  }

  const tlsCert = parsed.values["tls-cert"];
  const tlsKey = parsed.values["tls-key"];
  if ((tlsCert && !tlsKey) || (!tlsCert && tlsKey)) {
    throw new Error("--tls-cert and --tls-key must be provided together");
  }

  const options: ServerOptions = {
    host: parsed.values.host ?? "127.0.0.1",
    port: parsed.values.port ? parsePort(parsed.values.port) : 8214,
  };
  const authToken = (
    parsed.values["auth-token"] ?? env.CODEX_WEB_AUTH_TOKEN
  )?.trim();
  if (authToken) {
    options.auth = {
      token: authToken,
    };
  }
  if (tlsCert && tlsKey) {
    options.tls = {
      certPath: tlsCert,
      keyPath: tlsKey,
    };
  }
  return options;
}

export async function createFastifyOptions(options: ServerOptions) {
  if (!options.tls) {
    return { logger: false };
  }

  const [cert, key] = await Promise.all([
    fs.readFile(options.tls.certPath, "utf8"),
    fs.readFile(options.tls.keyPath, "utf8"),
  ]);

  return {
    logger: false,
    https: {
      cert,
      key,
    },
  };
}

function getIpcMainBridgeState(): IpcMainBridgeState {
  const globals = globalThis as typeof globalThis & {
    __codexElectronIpcBridge?: IpcMainBridgeState;
  };
  if (!globals.__codexElectronIpcBridge) {
    globals.__codexElectronIpcBridge = {};
  }
  return globals.__codexElectronIpcBridge;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendSocketMessage(
  socket: WebSocket,
  message: MainToRendererMessage,
): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function createVirtualMessagePort({
  onClose,
  portId,
  socket,
}: {
  onClose: () => void;
  portId: string;
  socket: WebSocket;
}): VirtualMessagePort {
  const listeners = {
    close: new Set<(event?: unknown) => void>(),
    message: new Set<(event?: unknown) => void>(),
  };
  let closed = false;

  const emit = (event: "message" | "close", payload?: unknown): void => {
    for (const listener of listeners[event]) {
      listener(payload);
    }
  };

  return {
    __codexVirtualPortId: portId,
    close(): void {
      if (closed) {
        return;
      }
      closed = true;
      onClose();
      sendSocketMessage(socket, {
        type: "virtual-port-close",
        portId,
      });
      emit("close");
    },
    emitMessage(data: unknown): void {
      if (closed) {
        return;
      }
      emit("message", { data });
    },
    on(event: "message" | "close", listener: (event?: unknown) => void): void {
      listeners[event].add(listener);
    },
    postMessage(data: unknown): void {
      if (closed) {
        return;
      }
      sendSocketMessage(socket, {
        type: "virtual-port-message",
        portId,
        data,
      });
    },
    start(): void {
      // Electron MessagePortMain requires start(); this bridge is always live.
    },
  };
}

export async function getWorkspaceDirectoryEntries(
  {
    directoryPath,
    directoriesOnly,
  }: {
    directoryPath: string | null;
    directoriesOnly: boolean;
  },
  appServerClient?: {
    rpc: (method: string, params: unknown) => Promise<unknown>;
  },
): Promise<WorkspaceDirectoryEntries> {
  const requestedPath = directoryPath?.trim() || os.homedir();
  const resolvedPath = path.resolve(requestedPath);
  if (appServerClient) {
    return getRemoteWorkspaceDirectoryEntries({
      appServerClient,
      directoriesOnly,
      resolvedPath,
    });
  }
  const stat = await fs.stat(resolvedPath);
  if (!stat.isDirectory()) {
    throw new Error(`Directory not found: ${requestedPath}`);
  }

  const entries = (await fs.readdir(resolvedPath, { withFileTypes: true }))
    .flatMap((entry): WorkspaceDirectoryEntry[] => {
      const type = entry.isDirectory() ? "directory" : "file";
      if (directoriesOnly && type !== "directory") {
        return [];
      }

      return [
        {
          name: entry.name,
          path: path.join(resolvedPath, entry.name),
          type,
        },
      ];
    })
    .sort(compareWorkspaceDirectoryEntries);

  const rootPath = path.parse(resolvedPath).root;
  const parentPath =
    resolvedPath === rootPath ? null : path.dirname(resolvedPath);

  return {
    directoryPath: resolvedPath,
    parentPath,
    entries,
  };
}

async function getRemoteWorkspaceDirectoryEntries({
  appServerClient,
  directoriesOnly,
  resolvedPath,
}: {
  appServerClient: {
    rpc: (method: string, params: unknown) => Promise<unknown>;
  };
  directoriesOnly: boolean;
  resolvedPath: string;
}): Promise<WorkspaceDirectoryEntries> {
  const response = await appServerClient.rpc("fs/readDirectory", {
    path: resolvedPath,
  });
  const entries = remoteFsReadDirectoryEntries(response)
    .flatMap((entry): WorkspaceDirectoryEntry[] => {
      const type = entry.isDirectory ? "directory" : "file";
      if (directoriesOnly && type !== "directory") {
        return [];
      }
      return [
        {
          name: entry.fileName,
          path: path.join(resolvedPath, entry.fileName),
          type,
        },
      ];
    })
    .sort(compareWorkspaceDirectoryEntries);
  const rootPath = path.parse(resolvedPath).root;
  return {
    directoryPath: resolvedPath,
    parentPath: resolvedPath === rootPath ? null : path.dirname(resolvedPath),
    entries,
  };
}

function remoteFsReadDirectoryEntries(
  response: unknown,
): Array<{ fileName: string; isDirectory: boolean }> {
  if (!isRecord(response) || !Array.isArray(response.entries)) {
    return [];
  }
  return response.entries.flatMap(
    (
      entry,
    ): Array<{
      fileName: string;
      isDirectory: boolean;
    }> => {
      if (!isRecord(entry) || typeof entry.fileName !== "string") {
        return [];
      }
      return [
        {
          fileName: entry.fileName,
          isDirectory: entry.isDirectory === true,
        },
      ];
    },
  );
}

function ensureElectronLikeProcessContext(): void {
  if (!process.env.CODEX_CLI_PATH && process.env.CODEX_UNIX_SOCKET) {
    const remoteProxyPath = path.resolve(
      __dirname,
      "../../scripts/codex_remote_proxy",
    );
    if (fsSync.existsSync(remoteProxyPath)) {
      process.env.CODEX_CLI_PATH = remoteProxyPath;
    }
  }

  const versions = process.versions as NodeJS.ProcessVersions & {
    electron?: string;
  };
  if (!versions.electron) {
    Object.defineProperty(versions, "electron", {
      value: "41.2.0",
      configurable: true,
      enumerable: true,
      writable: false,
    });
  }

  const processWithElectronFields = process as NodeJS.Process & {
    resourcesPath?: string;
    type?: string;
  };
  processWithElectronFields.resourcesPath ??= path.resolve(
    __dirname,
    "../../scratch/asar",
  );
  processWithElectronFields.type ??= "browser";

  const processWithLinkedBinding = process as NodeJS.Process & {
    _codexWebLinkedBindingShimInstalled?: boolean;
    _linkedBinding?: (name: string) => unknown;
  };
  if (!processWithLinkedBinding._codexWebLinkedBindingShimInstalled) {
    const originalLinkedBinding = processWithLinkedBinding._linkedBinding;
    processWithLinkedBinding._linkedBinding = function linkedBindingShim(
      this: NodeJS.Process,
      name: string,
    ): unknown {
      if (name === "electron_common_owl_features") {
        return {
          isOwlFeatureEnabled: () => false,
        };
      }

      if (typeof originalLinkedBinding !== "function") {
        throw new Error(`No linked binding available for ${name}`);
      }

      return originalLinkedBinding.call(this, name);
    };
    processWithLinkedBinding._codexWebLinkedBindingShimInstalled = true;
  }
}

export function createDefaultTerminalSessionFactory(
  appServerClient: AppServerRpcClient = createCodexAppServerClient(),
): TerminalSessionFactory {
  return createRemoteTerminalSessionFactory(
    createCommandExecRemoteProcessConnection(appServerClient),
  );
}

function resolveRemoteTerminalCwd(requestedCwd: string | undefined): string {
  return path.resolve(requestedCwd?.trim() || os.homedir());
}

async function startIpcBridgeServer(options: ServerOptions): Promise<void> {
  ensureElectronLikeProcessContext();
  const bridgeState = getIpcMainBridgeState();
  const app = Fastify(await createFastifyOptions(options));
  const websocketServer = new WebSocketServer({ noServer: true });
  const terminalWebsocketServer = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();
  const backendWebSocketToken = randomUUID();
  const appServerClient = createCodexAppServerClient();
  const terminalSessionFactory =
    createDefaultTerminalSessionFactory(appServerClient);
  const handleTerminalSocket = createTerminalSocketHandler(
    terminalSessionFactory,
    { resolveCwd: resolveRemoteTerminalCwd },
  );

  app.addHook("onClose", async () => {
    appServerClient.dispose();
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: Infinity,
    },
  });

  const uploadRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-web-uploads-"),
  );

  app.get("/__auth/login", async (request, reply) => {
    return reply.type("text/html").send(createAuthLoginHtml(request.url));
  });

  app.post("/__auth/session", async (request, reply) => {
    if (!options.auth) {
      return reply.code(404).send({ error: "Not Found" });
    }

    const body = request.body;
    const token =
      typeof body === "object" &&
      body !== null &&
      "token" in body &&
      typeof body.token === "string"
        ? body.token
        : "";

    if (!isSameSecret(token, options.auth.token)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    reply.header(
      "set-cookie",
      createAuthCookie({
        token: options.auth.token,
        secure: Boolean(options.tls),
      }),
    );
    return reply.send({ ok: true });
  });

  app.addHook("onRequest", async (request, reply) => {
    if (
      options.auth &&
      !isPublicAuthPath(request.url) &&
      !isAuthenticatedCookie({
        cookieHeader: request.headers.cookie,
        token: options.auth.token,
      })
    ) {
      if (
        request.method === "GET" &&
        singleHeaderValue(request.headers.accept)?.includes("text/html")
      ) {
        return reply.redirect(authLoginPath(request.url));
      }
      return reply.code(401).send({ error: "Unauthorized" });
    }

    if (shouldBlockFsRequestPath(request.url, request.headers)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
  });

  app.post("/__backend/upload", async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.code(400).send({ error: "expected multipart upload body" });
    }

    const files = await Array.fromAsync(
      (async function* () {
        for await (const part of request.files()) {
          const label = part.filename?.trim() || "upload";

          const uploadedPath = path.join(uploadRoot, randomUUID());

          await fs.writeFile(uploadedPath, await part.toBuffer());

          yield {
            label,
            path: uploadedPath,
            fsPath: uploadedPath,
          };
        }
      })(),
    );

    return reply.send({ files });
  });

  const bundledFontsRoot = path.resolve(__dirname, "../../assets/fonts");
  if (fsSync.existsSync(bundledFontsRoot)) {
    await app.register(fastifyStatic, {
      root: bundledFontsRoot,
      prefix: "/__codex-web/fonts/",
      decorateReply: false,
    });
  }

  await app.register(fastifyStatic, {
    root: "/",
    prefix: "/@fs/",
    decorateReply: false,
  });

  const webviewRoot = path.resolve(__dirname, "../../scratch/asar/webview");

  await app.register(fastifyStatic, {
    root: webviewRoot,
    prefix: "/",
  });

  app.get("/", async (_request, reply) => {
    return sendWebviewIndex(reply, webviewRoot, backendWebSocketToken);
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/@fs/")) {
      return reply.code(404).send({ error: "Not Found" });
    }

    if (request.method === "GET" && shouldServeWebviewShellPath(request.url)) {
      return sendWebviewIndex(reply, webviewRoot, backendWebSocketToken);
    }
    return reply.code(404).send({ error: "Not Found" });
  });

  app.server.on("upgrade", (request, socket, head) => {
    const requestUrl = request.url ?? "/";
    const host = request.headers.host ?? "localhost";
    const url = new URL(requestUrl, `http://${host}`);
    const isBackendWebSocket =
      url.pathname === "/__backend/terminal" ||
      url.pathname === "/__backend/ipc";
    if (
      isBackendWebSocket &&
      options.auth &&
      !isAuthenticatedCookie({
        cookieHeader: request.headers.cookie,
        token: options.auth.token,
      })
    ) {
      socket.destroy();
      return;
    }
    if (
      isBackendWebSocket &&
      !isAllowedBackendWebSocketRequest({
        host: request.headers.host,
        origin: request.headers.origin,
        requestUrl,
        token: backendWebSocketToken,
      })
    ) {
      socket.destroy();
      return;
    }

    if (url.pathname === "/__backend/terminal") {
      terminalWebsocketServer.handleUpgrade(
        request,
        socket,
        head,
        (upgradedSocket) => {
          terminalWebsocketServer.emit("connection", upgradedSocket, request);
        },
      );
      return;
    }

    if (url.pathname !== "/__backend/ipc") {
      socket.destroy();
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (upgradedSocket) => {
      websocketServer.emit("connection", upgradedSocket, request);
    });
  });

  bridgeState.broadcastToRenderer = (message: MainToRendererMessage): void => {
    const payload = JSON.stringify(message);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  };
  const browserPanelRuntime = createBrowserPanelRuntime({
    broadcastToRenderer: (message) =>
      bridgeState.broadcastToRenderer?.(message),
  });

  websocketServer.on("connection", (socket) => {
    sockets.add(socket);
    const virtualPorts = new Map<string, VirtualMessagePort>();

    const getVirtualPort = (portId: string): VirtualMessagePort => {
      let port = virtualPorts.get(portId);
      if (!port) {
        port = createVirtualMessagePort({
          portId,
          socket,
          onClose: () => {
            virtualPorts.delete(portId);
          },
        });
        virtualPorts.set(portId, port);
      }
      return port;
    };

    socket.on("close", () => {
      sockets.delete(socket);
      for (const port of virtualPorts.values()) {
        port.close();
      }
      virtualPorts.clear();
    });

    socket.on("message", (rawData) => {
      let message: RendererToMainMessage;
      try {
        message = JSON.parse(String(rawData)) as RendererToMainMessage;
      } catch (error) {
        console.error("[ipc-bridge] invalid JSON payload", error);
        return;
      }

      if (message.type === "virtual-port-message") {
        getVirtualPort(message.portId).emitMessage(message.data);
        return;
      }

      if (message.type === "virtual-port-close") {
        virtualPorts.get(message.portId)?.close();
        return;
      }

      if (message.type === "ipc-renderer-send") {
        const ports = message.portIds?.map(getVirtualPort) ?? [];
        if (
          message.channel === "codex_desktop:message-from-view" &&
          canHandleNativeOpenFetchMessage(message.args[0])
        ) {
          void handleNativeOpenFetchMessage(message.args[0], {
            respond: (payload) => bridgeState.broadcastToRenderer?.(payload),
          });
          return;
        }
        if (
          message.channel === "codex_desktop:message-from-view" &&
          canHandleRemoteDefaultFetchMessage(message.args[0])
        ) {
          void handleRemoteDefaultFetchMessage(message.args[0], {
            respond: (payload) => bridgeState.broadcastToRenderer?.(payload),
          });
          return;
        }
        if (
          message.channel === "codex_desktop:message-from-view" &&
          canHandleRemoteDefaultMcpMessage(message.args[0])
        ) {
          void handleRemoteDefaultMcpMessage(message.args[0], {
            respond: (payload) => bridgeState.broadcastToRenderer?.(payload),
          });
          return;
        }
        const handledByBrowserPanelRuntime =
          handleBrowserPanelRuntimeIpcMessage(
            browserPanelRuntime,
            message.channel,
            message.args,
          );
        if (handledByBrowserPanelRuntime) {
          return;
        }
        bridgeState.handleRendererSend?.(
          message.channel,
          message.args,
          message.sourceUrl,
          ports,
        );
        return;
      }

      if (message.type === "workspace-directory-entries-request") {
        const { requestId } = message;
        getWorkspaceDirectoryEntries(message, appServerClient)
          .then((result) => {
            const payload: MainToRendererMessage = {
              type: "workspace-directory-entries-result",
              requestId,
              ok: true,
              result,
            };
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify(payload));
            }
          })
          .catch((error) => {
            const payload: MainToRendererMessage = {
              type: "workspace-directory-entries-result",
              requestId,
              ok: false,
              errorMessage: errorMessage(error),
            };
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify(payload));
            }
          });
        return;
      }

      if (message.type === "ipc-renderer-invoke") {
        const { channel, requestId, args, sourceUrl } = message;
        if (
          channel === "codex_desktop:message-from-view" &&
          canHandleNativeOpenFetchMessage(args[0])
        ) {
          void handleNativeOpenFetchMessage(args[0], {
            respond: (payload) => bridgeState.broadcastToRenderer?.(payload),
          });
          sendSocketMessage(socket, {
            type: "ipc-renderer-invoke-result",
            requestId,
            ok: true,
            result: undefined,
          });
          return;
        }
        if (
          channel === "codex_desktop:message-from-view" &&
          canHandleRemoteDefaultFetchMessage(args[0])
        ) {
          void handleRemoteDefaultFetchMessage(args[0], {
            respond: (payload) => bridgeState.broadcastToRenderer?.(payload),
          });
          sendSocketMessage(socket, {
            type: "ipc-renderer-invoke-result",
            requestId,
            ok: true,
            result: undefined,
          });
          return;
        }
        if (
          channel === "codex_desktop:message-from-view" &&
          canHandleRemoteDefaultMcpMessage(args[0])
        ) {
          void handleRemoteDefaultMcpMessage(args[0], {
            respond: (payload) => bridgeState.broadcastToRenderer?.(payload),
          });
          sendSocketMessage(socket, {
            type: "ipc-renderer-invoke-result",
            requestId,
            ok: true,
            result: undefined,
          });
          return;
        }
        const handledByBrowserPanelRuntime =
          handleBrowserPanelRuntimeIpcMessage(
            browserPanelRuntime,
            channel,
            args,
          );
        if (handledByBrowserPanelRuntime) {
          sendSocketMessage(socket, {
            type: "ipc-renderer-invoke-result",
            requestId,
            ok: true,
            result: undefined,
          });
          return;
        }
        Promise.resolve(
          bridgeState.handleRendererInvoke?.(channel, args, sourceUrl) ??
            Promise.reject(
              new Error(
                `[ipc-bridge] no ipcMain.handle for channel ${channel}`,
              ),
            ),
        )
          .then((result) => {
            const payload: MainToRendererMessage = {
              type: "ipc-renderer-invoke-result",
              requestId,
              ok: true,
              result,
            };
            sendSocketMessage(socket, payload);
          })
          .catch((error) => {
            const payload: MainToRendererMessage = {
              type: "ipc-renderer-invoke-result",
              requestId,
              ok: false,
              errorMessage: errorMessage(error),
            };
            sendSocketMessage(socket, payload);
          });
      }
    });
  });

  terminalWebsocketServer.on("connection", (socket) => {
    handleTerminalSocket(socket);
  });

  await app.listen({ host: options.host, port: options.port });
  const socketProtocol = options.tls ? "wss" : "ws";
  console.log(
    `IPC bridge listening at ${socketProtocol}://${options.host}:${options.port}`,
  );

  ensureElectronLikeProcessContext();
  installModuleAliasHook();

  const matches = await glob("../../scratch/asar/.vite/build/main-*.js", {
    nodir: true,
    cwd: __dirname,
  });

  if (matches.length === 0) {
    throw new Error("no main bundle found");
  }

  if (matches.length > 1) {
    throw new Error("multiple main bundles found");
  }

  const module = require(matches[0]!);
  module.runMainAppStartup();
}

export function isAllowedBackendWebSocketRequest({
  host,
  origin,
  requestUrl,
  token,
}: {
  host?: string | string[];
  origin?: string | string[];
  requestUrl: string;
  token: string;
}): boolean {
  const originValue = singleHeaderValue(origin);
  if (originValue == null) {
    return false;
  }

  const hostValue = singleHeaderValue(host);
  if (hostValue == null) {
    return false;
  }

  try {
    const originHost = new URL(originValue).host.toLowerCase();
    const request = new URL(requestUrl, `http://${hostValue}`);
    return (
      originHost === hostValue.toLowerCase() &&
      request.searchParams.get("token") === token
    );
  } catch {
    return false;
  }
}

const ACTIVE_FS_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".js",
  ".mjs",
  ".svg",
  ".xml",
  ".xhtml",
]);

const ACTIVE_FS_FETCH_DESTINATIONS = new Set([
  "document",
  "embed",
  "frame",
  "iframe",
  "object",
  "script",
  "serviceworker",
  "sharedworker",
  "worker",
  "xslt",
]);

const PASSIVE_FS_FETCH_DESTINATIONS = new Set([
  "audio",
  "font",
  "image",
  "manifest",
  "style",
  "track",
  "video",
]);

export function shouldBlockFsRequestPath(
  requestPath: string,
  headers: Record<string, string | string[] | undefined> = {},
): boolean {
  let pathname: string;
  try {
    pathname = new URL(requestPath, "http://localhost").pathname;
  } catch {
    pathname = requestPath;
  }
  if (!pathname.startsWith("/@fs/")) {
    return false;
  }
  let decodedPathname = pathname;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    // Fall back to the raw path for malformed escape sequences.
  }
  if (!ACTIVE_FS_EXTENSIONS.has(path.extname(decodedPathname).toLowerCase())) {
    return false;
  }

  const fetchDestination = singleHeaderValue(headers["sec-fetch-dest"])
    ?.toLowerCase()
    .trim();
  if (fetchDestination && PASSIVE_FS_FETCH_DESTINATIONS.has(fetchDestination)) {
    return false;
  }
  if (fetchDestination && ACTIVE_FS_FETCH_DESTINATIONS.has(fetchDestination)) {
    return true;
  }

  return true;
}

export function shouldServeWebviewShellPath(requestPath: string): boolean {
  let pathname: string;
  let search: string;
  try {
    const url = new URL(requestPath, "http://localhost");
    pathname = url.pathname;
    search = url.search;
  } catch {
    pathname = requestPath;
    search = "";
  }

  if (pathname === "/") {
    return true;
  }
  if (pathname === "/share/receive") {
    return search.length > 0;
  }
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return true;
  }
  return /^\/thread\/[^/]+$/.test(pathname);
}

const AUTH_COOKIE_NAME = "codex_web_session";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function createAuthCookie({
  now = Date.now(),
  secure,
  token,
}: {
  now?: number;
  secure: boolean;
  token: string;
}): string {
  const expiresAt = now + AUTH_COOKIE_MAX_AGE_SECONDS * 1000;
  const payload = `${expiresAt}.${randomBytes(16).toString("base64url")}`;
  const value = `${payload}.${authSignature(token, payload)}`;
  return [
    `${AUTH_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${AUTH_COOKIE_MAX_AGE_SECONDS}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function isAuthenticatedCookie({
  cookieHeader,
  now = Date.now(),
  token,
}: {
  cookieHeader: string | string[] | undefined;
  now?: number;
  token: string;
}): boolean {
  const cookie = parseCookieHeader(singleHeaderValue(cookieHeader));
  const value = cookie.get(AUTH_COOKIE_NAME);
  if (!value) {
    return false;
  }

  const parts = value.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [expiresAtRaw, nonce, signature] = parts as [string, string, string];
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now) {
    return false;
  }

  return isSameSecret(
    signature,
    authSignature(token, `${expiresAtRaw}.${nonce}`),
  );
}

function authSignature(token: string, payload: string): string {
  return createHmac("sha256", token).update(payload).digest("base64url");
}

function isSameSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parseCookieHeader(cookieHeader: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of cookieHeader?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1));
  }
  return cookies;
}

function isPublicAuthPath(requestPath: string): boolean {
  try {
    const { pathname } = new URL(requestPath, "http://localhost");
    return pathname === "/__auth/login" || pathname === "/__auth/session";
  } catch {
    return false;
  }
}

function authLoginPath(requestPath: string): string {
  return `/__auth/login?next=${encodeURIComponent(requestPath)}`;
}

export function createAuthLoginHtml(requestPath: string): string {
  const next = safeAuthNextPath(
    new URL(requestPath, "http://localhost").searchParams.get("next"),
  );
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>codex-web login</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0c0d0e; color: #f8fafc; font: 16px system-ui, sans-serif; }
      form { width: min(320px, calc(100vw - 32px)); display: grid; gap: 12px; }
      input, button { box-sizing: border-box; width: 100%; border-radius: 6px; border: 1px solid rgb(255 255 255 / 0.18); padding: 10px 12px; font: inherit; }
      input { background: #15171a; color: inherit; }
      button { background: #f8fafc; color: #0c0d0e; cursor: pointer; }
      p { min-height: 20px; margin: 0; color: #ffb4a8; font-size: 14px; }
    </style>
  </head>
  <body>
    <form data-login-form>
      <input name="token" type="password" autocomplete="current-password" autofocus placeholder="Token" />
      <button type="submit">Sign in</button>
      <p data-error></p>
    </form>
    <script>
      const form = document.querySelector("[data-login-form]");
      const error = document.querySelector("[data-error]");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.textContent = "";
        const response = await fetch("/__auth/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: new FormData(form).get("token") }),
        });
        if (response.ok) {
          location.href = ${JSON.stringify(next)};
        } else {
          error.textContent = "Invalid token";
        }
      });
    </script>
  </body>
</html>`;
}

function safeAuthNextPath(next: string | null): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/";
  }
  return next;
}

function singleHeaderValue(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0]! : null;
  }
  return value ?? null;
}

async function main(args: string[]) {
  const options = parseServerArgs(args);

  await startIpcBridgeServer(options);
}

if (require.main === module) {
  void main(process.argv.slice(2));
}

async function sendWebviewIndex(
  reply: FastifyReply,
  webviewRoot: string,
  backendWebSocketToken: string,
): Promise<unknown> {
  const indexHtml = await fs.readFile(
    path.join(webviewRoot, "index.html"),
    "utf8",
  );
  return reply
    .type("text/html")
    .send(injectWebviewRuntimeScripts(indexHtml, backendWebSocketToken));
}

export function injectWebviewRuntimeScripts(
  html: string,
  backendWebSocketToken: string,
): string {
  const terminalFont = process.env.CODEX_WEB_TERMINAL_FONT?.trim() || null;
  const fontFace = terminalFontFaceStyle(terminalFont);
  const scripts = `<script>${terminalCtrlWBootstrapScript()}</script><script>${statsigOverrideBootstrapScript()}</script><script>window.__CODEX_WEB_BACKEND_WEBSOCKET_TOKEN__=${JSON.stringify(backendWebSocketToken)};window.__CODEX_WEB_TERMINAL_FONT__=${JSON.stringify(terminalFont)};</script>`;
  const preload =
    '<base href="/" /><script type="module" src="./assets/preload.js"></script>';
  const shellHtml = removeContentSecurityPolicyMeta(html)
    .replace(
      '<link rel="manifest" href="/manifest.json" />',
      '<link rel="manifest" href="/manifest.json" crossorigin="use-credentials" />',
    )
    .replace(/<base\b[^>]*>\s*/i, "")
    .replace(
      /<script\s+type="module"\s+src="\.\/assets\/preload\.js"><\/script>\s*/i,
      "",
    );
  return shellHtml.includes("<head>")
    ? shellHtml.replace("<head>", `<head>${fontFace}${scripts}${preload}`)
    : `${fontFace}${scripts}${preload}${shellHtml}`;
}

function terminalFontFaceStyle(fontName: string | null): string {
  const faces = fontName ? BUNDLED_TERMINAL_FONTS.get(fontName) : null;
  if (!fontName || !faces) {
    return "";
  }
  return `<style>${faces
    .map(
      ({ fileName, fontStyle, fontWeight }) =>
        `@font-face{font-family: ${JSON.stringify(fontName)};src: local(${JSON.stringify(fontName)}), url("/__codex-web/fonts/${encodeURIComponent(fileName)}") format("truetype");font-weight: ${fontWeight};font-style: ${fontStyle};font-display: swap;}`,
    )
    .join("")}</style>`;
}

function removeContentSecurityPolicyMeta(html: string): string {
  return html.replace(
    /<meta\b(?=[^>]*http-equiv=["']?Content-Security-Policy["']?)[^>]*>\s*/gi,
    "",
  );
}

function terminalCtrlWBootstrapScript(): string {
  return `(() => {
  if (window.__CODEX_WEB_TERMINAL_CTRL_W_SHIM__ || typeof EventTarget !== "function") {
    return;
  }
  window.__CODEX_WEB_TERMINAL_CTRL_W_SHIM__ = true;
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  const keydownListenerWrappers = new WeakMap();
  const isGlobalKeyTarget = (target) =>
    target === window ||
    target === document ||
    target === document.body ||
    target === document.documentElement;
  const isTerminalCtrlW = (event) => {
    const target = event?.target instanceof Element ? event.target : null;
    const key = typeof event?.key === "string" ? event.key.toLowerCase() : "";
    return (
      event?.ctrlKey === true &&
      event.metaKey !== true &&
      event.altKey !== true &&
      event.shiftKey !== true &&
      (key === "w" || event.code === "KeyW") &&
      target?.closest?.("[data-codex-terminal]") != null
    );
  };
  const invokeListener = (listener, thisArg, event) =>
    typeof listener === "function"
      ? listener.call(thisArg, event)
      : listener.handleEvent.call(listener, event);
  const preventTerminalCtrlWBrowserDefault = (event) => {
    if (isTerminalCtrlW(event)) {
      event.preventDefault?.();
    }
  };
  originalAddEventListener.call(
    window,
    "keydown",
    preventTerminalCtrlWBrowserDefault,
    true,
  );
  originalAddEventListener.call(
    document,
    "keydown",
    preventTerminalCtrlWBrowserDefault,
    true,
  );
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (
      type !== "keydown" ||
      (typeof listener !== "function" &&
        typeof listener?.handleEvent !== "function")
    ) {
      return originalAddEventListener.call(this, type, listener, options);
    }
    let wrapped = keydownListenerWrappers.get(listener);
    if (wrapped == null) {
      wrapped = function (event) {
        if (isTerminalCtrlW(event) && isGlobalKeyTarget(this)) {
          event.preventDefault?.();
          return;
        }
        return invokeListener(listener, this, event);
      };
      keydownListenerWrappers.set(listener, wrapped);
    }
    return originalAddEventListener.call(this, type, wrapped, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    const wrapped =
      type === "keydown" && listener != null
        ? keydownListenerWrappers.get(listener)
        : null;
    return originalRemoveEventListener.call(
      this,
      type,
      wrapped ?? listener,
      options,
    );
  };
})();`;
}

function statsigOverrideBootstrapScript(): string {
  return `(() => {
  const shim = (window.__ELECTRON_SHIM__ ??= {});
  const originalFetch = window.fetch?.bind(window);
  if (typeof originalFetch === "function" && typeof Response === "function") {
    window.fetch = (input, init) => {
      const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url ?? "";
      return url.startsWith("sentry-ipc:")
        ? Promise.resolve(new Response(null, { status: 204 }))
        : originalFetch(input, init);
    };
  }
  shim.overrideAdapter = {
    getGateOverride(evaluation) {
      if (evaluation?.name === "3075919032") {
        return { ...evaluation, value: true };
      }
      if (evaluation?.name === "4114442250" || evaluation?.name === "1042620455") {
        return { ...evaluation, value: true };
      }
      if (evaluation?.name === "2929582856") {
        return { ...evaluation, value: false };
      }
      return null;
    },
    getDynamicConfigOverride(config) {
      if (config?.name !== "72216192") {
        return null;
      }
      const originalValue =
        config.value && typeof config.value === "object" ? config.value : {};
      const value = {
        ...originalValue,
        enable_i18n: true,
        locale_source: originalValue.locale_source ?? "IDE",
      };
      return {
        ...config,
        value,
        get(key, fallback) {
          const configValue = value[key];
          return configValue == null ? (fallback ?? null) : configValue;
        },
      };
    },
    getLayerOverride(layer) {
      if (layer?.name !== "72216192") {
        return null;
      }
      const originalValue =
        layer.__value && typeof layer.__value === "object" ? layer.__value : {};
      const value = {
        ...originalValue,
        enable_i18n: true,
        locale_source: originalValue.locale_source ?? "IDE",
      };
      return {
        ...layer,
        __value: value,
        get(key, fallback) {
          const configValue = value[key];
          return configValue == null ? (fallback ?? null) : configValue;
        },
      };
    },
  };
})();`;
}
