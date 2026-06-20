#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs as parseCliArgs } from "node:util";
import { WebSocket, WebSocketServer } from "ws";
import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { installModuleAliasHook } from "./module";
import { glob } from "glob";
import {
  createNodePtyTerminalSessionFactory,
  createTerminalSocketHandler,
  defaultTerminalCwd,
  terminalStylesheetHrefs,
} from "./terminal";

type ServerOptions = {
  host: string;
  port: number;
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

function printUsage(): void {
  console.log(
    [
      "Usage:",
      "  server [--host <host>] [--port <port>]",
      "",
      "Defaults:",
      "  --host 127.0.0.1",
      "  --port 8214",
      "",
      "Examples:",
      "  yarn server",
      "  yarn server --port 9000",
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

function parseServerArgs(args: string[]): ServerOptions {
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
    },
    strict: true,
  });

  if (parsed.values.help) {
    printUsage();
    process.exit(0);
  }

  return {
    host: parsed.values.host ?? "127.0.0.1",
    port: parsed.values.port ? parsePort(parsed.values.port) : 8214,
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

async function getWorkspaceDirectoryEntries({
  directoryPath,
  directoriesOnly,
}: {
  directoryPath: string | null;
  directoriesOnly: boolean;
}): Promise<WorkspaceDirectoryEntries> {
  const requestedPath = directoryPath?.trim() || os.homedir();
  const resolvedPath = path.resolve(requestedPath);
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

async function startIpcBridgeServer(options: ServerOptions): Promise<void> {
  const bridgeState = getIpcMainBridgeState();
  const app = Fastify({ logger: false });
  const websocketServer = new WebSocketServer({ noServer: true });
  const terminalWebsocketServer = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();
  const terminalSessionFactory = createNodePtyTerminalSessionFactory();
  const handleTerminalSocket = createTerminalSocketHandler(
    terminalSessionFactory,
  );

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: Infinity,
    },
  });

  const uploadRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "codex-web-uploads-"),
  );

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
    return reply.sendFile("index.html");
  });

  app.get("/__terminal", async (request, reply) => {
    return reply.type("text/html").send(
      createTerminalHtml({
        cwd: getTerminalCwdFromQuery(request.query),
        stylesheetHrefs: getTerminalStylesheetHrefs(webviewRoot),
      }),
    );
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/@fs/")) {
      return reply.code(404).send({ error: "Not Found" });
    }

    if (request.method === "GET") {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "Not Found" });
  });

  app.server.on("upgrade", (request, socket, head) => {
    const requestUrl = request.url ?? "/";
    const host = request.headers.host ?? "localhost";
    const url = new URL(requestUrl, `http://${host}`);
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
        getWorkspaceDirectoryEntries(message)
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
  console.log(`IPC bridge listening at ws://${options.host}:${options.port}`);

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

async function main(args: string[]) {
  const options = parseServerArgs(args);

  await startIpcBridgeServer(options);
}

main(process.argv.slice(2));

function createTerminalHtml({
  cwd: requestedCwd,
  stylesheetHrefs,
}: {
  cwd: string | undefined;
  stylesheetHrefs: string[];
}): string {
  const cwd = escapeHtml(requestedCwd ?? defaultTerminalCwd());
  const stylesheetLinks = stylesheetHrefs
    .map((href) => `    <link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join("\n");
  return `<!doctype html>
<html lang="en" data-codex-window-type="browser">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Terminal</title>
${stylesheetLinks}
    <script type="module" src="/assets/terminal-page.js"></script>
  </head>
  <body data-terminal-cwd="${cwd}">
    <div id="terminal-root"></div>
  </body>
</html>`;
}

function getTerminalStylesheetHrefs(webviewRoot: string): string[] {
  const assetsRoot = path.join(webviewRoot, "assets");
  try {
    return terminalStylesheetHrefs(fsSync.readdirSync(assetsRoot));
  } catch {
    return terminalStylesheetHrefs([]);
  }
}

function getTerminalCwdFromQuery(query: unknown): string | undefined {
  if (
    typeof query === "object" &&
    query !== null &&
    "cwd" in query &&
    typeof query.cwd === "string" &&
    query.cwd.trim()
  ) {
    return query.cwd;
  }
  return undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
