import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import type { RawData, WebSocket } from "ws";
import * as pty from "node-pty";

export type TerminalClientMessage =
  | {
      type: "create";
      cwd?: string;
      cols?: number;
      rows?: number;
      terminalType?: string;
    }
  | {
      type: "input";
      data: string;
    }
  | {
      type: "resize";
      cols: number;
      rows: number;
    }
  | {
      type: "close";
    };

export type TerminalServerMessage =
  | {
      type: "created";
      sessionId: string;
    }
  | {
      type: "output";
      data: string;
    }
  | {
      type: "exit";
      exitCode: number | null;
      signal: number | null;
    }
  | {
      type: "error";
      message: string;
      messageKey?: string;
      messageValues?: Record<string, unknown>;
    };

export type TerminalSession = {
  id: string;
  close: () => void;
  onData: (listener: (data: string) => void) => void;
  onExit: (
    listener: (event: {
      exitCode: number | null;
      signal?: number | null;
    }) => void,
  ) => void;
  resize: (cols: number, rows: number) => void;
  write: (data: string) => void;
};

export type TerminalSessionOptions = {
  cols: number;
  cwd: string;
  rows: number;
  terminalType: string;
};

export type TerminalSessionFactory = {
  createSession: (options: TerminalSessionOptions) => TerminalSession;
};

export type RemoteProcessOutputDelta = {
  capReached?: boolean;
  chunk: Buffer;
};

export type RemoteProcessSession = {
  response: Promise<{
    exitCode: number | null;
  }>;
  resize: (size: { cols: number; rows: number }) => Promise<unknown>;
  terminate: () => Promise<unknown>;
  write: (data: Buffer, options?: { closeStdin?: boolean }) => Promise<unknown>;
};

export type RemoteProcessConnection = {
  startProcess: (options: {
    command: string[];
    cwd: string;
    env: Record<string, string | null>;
    onStderrDelta: (delta: RemoteProcessOutputDelta) => void;
    onStdoutDelta: (delta: RemoteProcessOutputDelta) => void;
    outputBytesCap: null;
    processHandle: string;
    size: { cols: number; rows: number };
    streamStdoutStderr: true;
    timeoutMs: null;
    tty: true;
  }) => Promise<RemoteProcessSession>;
};

export type AppServerRpcClient = {
  onNotification: (
    listener: (notification: { method: string; params: unknown }) => void,
  ) => () => void;
  rpc: (
    method: string,
    params: unknown,
    options?: { timeoutMs?: number | null },
  ) => Promise<unknown>;
};

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_TERMINAL_TYPE = "xterm-256color";
const TERMINAL_TYPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

class TerminalMessageError extends Error {
  constructor(
    message: string,
    readonly messageKey: string,
    readonly messageValues: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "TerminalMessageError";
  }
}

export function parseTerminalClientMessage(
  value: unknown,
): TerminalClientMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new TerminalMessageError(
      "Unknown terminal message type",
      "error.unknownMessageType",
    );
  }

  if (value.type === "create") {
    if (
      "cwd" in value &&
      value.cwd !== undefined &&
      typeof value.cwd !== "string"
    ) {
      throw new TerminalMessageError(
        "Invalid terminal create message",
        "error.invalidCreateMessage",
      );
    }
    if (
      "cols" in value &&
      value.cols !== undefined &&
      !isPositiveInteger(value.cols)
    ) {
      throw new TerminalMessageError(
        "Invalid terminal create message",
        "error.invalidCreateMessage",
      );
    }
    if (
      "rows" in value &&
      value.rows !== undefined &&
      !isPositiveInteger(value.rows)
    ) {
      throw new TerminalMessageError(
        "Invalid terminal create message",
        "error.invalidCreateMessage",
      );
    }
    if (
      "terminalType" in value &&
      value.terminalType !== undefined &&
      !isTerminalType(value.terminalType)
    ) {
      throw new TerminalMessageError(
        "Invalid terminal create message",
        "error.invalidCreateMessage",
      );
    }
    return {
      type: "create",
      ...(typeof value.cwd === "string" ? { cwd: value.cwd } : {}),
      ...(isPositiveInteger(value.cols) ? { cols: value.cols } : {}),
      ...(isPositiveInteger(value.rows) ? { rows: value.rows } : {}),
      ...(isTerminalType(value.terminalType)
        ? { terminalType: value.terminalType.trim() }
        : {}),
    };
  }

  if (value.type === "input") {
    if (typeof value.data !== "string") {
      throw new TerminalMessageError(
        "Invalid terminal input message",
        "error.invalidInputMessage",
      );
    }
    return {
      type: "input",
      data: value.data,
    };
  }

  if (value.type === "resize") {
    if (!isPositiveInteger(value.cols) || !isPositiveInteger(value.rows)) {
      throw new TerminalMessageError(
        "Invalid terminal resize message",
        "error.invalidResizeMessage",
      );
    }
    return {
      type: "resize",
      cols: value.cols,
      rows: value.rows,
    };
  }

  if (value.type === "close") {
    return {
      type: "close",
    };
  }

  throw new TerminalMessageError(
    "Unknown terminal message type",
    "error.unknownMessageType",
  );
}

export function resolveTerminalCwd(requestedCwd: string | undefined): string {
  const trimmed = requestedCwd?.trim();
  if (!trimmed) {
    return process.cwd();
  }

  const resolved = path.resolve(trimmed);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new TerminalMessageError(
      `Terminal cwd is not a directory: ${trimmed}`,
      "error.cwdNotDirectory",
      { cwd: trimmed },
    );
  }
  if (!stat.isDirectory()) {
    throw new TerminalMessageError(
      `Terminal cwd is not a directory: ${trimmed}`,
      "error.cwdNotDirectory",
      { cwd: trimmed },
    );
  }
  return resolved;
}

export function createTerminalSocketHandler(
  factory: TerminalSessionFactory,
  {
    resolveCwd = resolveTerminalCwd,
  }: {
    resolveCwd?: (requestedCwd: string | undefined) => string;
  } = {},
): (socket: Pick<WebSocket, "on" | "send" | "close" | "readyState">) => void {
  return (socket) => {
    let session: TerminalSession | null = null;

    const send = (message: TerminalServerMessage): void => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(message));
      }
    };

    const closeSession = (): void => {
      if (!session) {
        return;
      }
      const closingSession = session;
      session = null;
      closingSession.close();
    };

    socket.on("message", (rawData: RawData) => {
      let message: TerminalClientMessage;
      try {
        message = parseTerminalClientMessage(
          JSON.parse(
            Buffer.isBuffer(rawData)
              ? rawData.toString("utf8")
              : String(rawData),
          ),
        );
      } catch (error) {
        send(terminalErrorMessage(error));
        return;
      }

      try {
        if (message.type === "create") {
          closeSession();
          const createdSession = factory.createSession({
            cwd: resolveCwd(message.cwd),
            cols: message.cols ?? DEFAULT_COLS,
            rows: message.rows ?? DEFAULT_ROWS,
            terminalType: message.terminalType ?? DEFAULT_TERMINAL_TYPE,
          });
          session = createdSession;
          send({ type: "created", sessionId: session.id });
          createdSession.onData((data) => {
            send({ type: "output", data });
          });
          createdSession.onExit((event) => {
            send({
              type: "exit",
              exitCode: event.exitCode,
              signal: event.signal ?? null,
            });
            if (session === createdSession) {
              session = null;
            }
          });
          return;
        }

        if (message.type === "input") {
          session?.write(message.data);
          return;
        }

        if (message.type === "resize") {
          session?.resize(message.cols, message.rows);
          return;
        }

        closeSession();
      } catch (error) {
        send(terminalErrorMessage(error));
      }
    });

    socket.on("close", closeSession);
  };
}

export function createNodePtyTerminalSessionFactory(): TerminalSessionFactory {
  return {
    createSession(options) {
      const id = randomUUID();
      const shell =
        process.env.SHELL ||
        (process.platform === "win32" ? "powershell.exe" : "/bin/sh");
      const subprocess = pty.spawn(shell, [], {
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd,
        env: {
          ...process.env,
          CODEX_SHELL: "1",
          TERM: options.terminalType,
          COLORTERM: "truecolor",
        },
        name: options.terminalType,
      });

      return {
        id,
        close() {
          subprocess.kill();
        },
        onData(listener) {
          subprocess.onData(listener);
        },
        onExit(listener) {
          subprocess.onExit((event) => {
            listener({
              exitCode: event.exitCode,
              signal: event.signal,
            });
          });
        },
        resize(cols, rows) {
          subprocess.resize(cols, rows);
        },
        write(data) {
          subprocess.write(data);
        },
      };
    },
  };
}

export function createRemoteTerminalSessionFactory(
  connection: RemoteProcessConnection,
): TerminalSessionFactory {
  return {
    createSession(options) {
      const id = randomUUID();
      const dataListeners = new Set<(data: string) => void>();
      const exitListeners = new Set<
        (event: { exitCode: number | null; signal?: number | null }) => void
      >();
      const decoder = new StringDecoder("utf8");
      let closed = false;
      let pending = Promise.resolve();

      const cleanup = (): void => {
        dataListeners.clear();
        exitListeners.clear();
      };

      const emitData = (delta: RemoteProcessOutputDelta): void => {
        if (closed) {
          return;
        }
        const data = decoder.write(delta.chunk);
        if (!data) {
          return;
        }
        for (const listener of dataListeners) {
          listener(data);
        }
      };

      const processSession = connection.startProcess({
        processHandle: id,
        command: remoteLoginShellCommand(),
        tty: true,
        size: { cols: options.cols, rows: options.rows },
        streamStdoutStderr: true,
        outputBytesCap: null,
        timeoutMs: null,
        cwd: options.cwd,
        env: remoteTerminalEnv(options.terminalType),
        onStdoutDelta: emitData,
        onStderrDelta: emitData,
      });

      processSession
        .then((session) => session.response)
        .then(
          (event) => {
            if (closed) {
              return;
            }
            const tail = decoder.end();
            if (tail) {
              for (const listener of dataListeners) {
                listener(tail);
              }
            }
            for (const listener of exitListeners) {
              listener({ exitCode: event.exitCode, signal: null });
            }
            cleanup();
          },
          () => {
            if (closed) {
              return;
            }
            for (const listener of exitListeners) {
              listener({ exitCode: null, signal: null });
            }
            cleanup();
          },
        );

      const enqueue = (
        action: (session: RemoteProcessSession) => Promise<unknown>,
      ): void => {
        if (closed) {
          return;
        }
        pending = pending
          .then(async () => {
            await action(await processSession);
          })
          .catch(() => {});
      };

      return {
        id,
        close() {
          closed = true;
          cleanup();
          pending = pending
            .then(async () => {
              await (await processSession).terminate();
            })
            .catch(() => {});
        },
        onData(listener) {
          if (!closed) {
            dataListeners.add(listener);
          }
        },
        onExit(listener) {
          if (!closed) {
            exitListeners.add(listener);
          }
        },
        resize(cols, rows) {
          enqueue((session) => session.resize({ cols, rows }));
        },
        write(data) {
          enqueue((session) => session.write(Buffer.from(data, "utf8")));
        },
      };
    },
  };
}

export function createCommandExecRemoteProcessConnection(
  client: AppServerRpcClient,
): RemoteProcessConnection {
  return {
    async startProcess(options) {
      const processId = options.processHandle;
      let cleaned = false;
      const offNotification = client.onNotification((notification) => {
        if (notification.method !== "command/exec/outputDelta") {
          return;
        }
        const params = asCommandExecOutputDelta(notification.params);
        if (!params || params.processId !== processId) {
          return;
        }
        const delta = {
          chunk: Buffer.from(params.deltaBase64, "base64"),
          capReached: params.capReached,
        };
        if (params.stream === "stderr") {
          options.onStderrDelta(delta);
        } else {
          options.onStdoutDelta(delta);
        }
      });
      const cleanup = (): void => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        offNotification();
      };

      const response = client
        .rpc(
          "command/exec",
          {
            command: options.command,
            cwd: options.cwd,
            disableOutputCap: options.outputBytesCap === null,
            disableTimeout: options.timeoutMs === null,
            env: options.env,
            processId,
            size: options.size,
            streamStdin: true,
            streamStdoutStderr: options.streamStdoutStderr,
            tty: options.tty,
          },
          { timeoutMs: null },
        )
        .finally(cleanup)
        .then((result) => ({
          exitCode: commandExecExitCode(result),
        }));

      return {
        response,
        resize(size) {
          return client.rpc("command/exec/resize", { processId, size });
        },
        terminate() {
          cleanup();
          return client.rpc("command/exec/terminate", { processId });
        },
        write(data, writeOptions) {
          return client.rpc("command/exec/write", {
            processId,
            deltaBase64: data.toString("base64"),
            closeStdin: writeOptions?.closeStdin ?? false,
          });
        },
      };
    },
  };
}

function remoteLoginShellCommand(): string[] {
  return [
    "sh",
    "-c",
    [
      'login_shell="${SHELL:-}"',
      'if [ -z "$login_shell" ] && command -v getent >/dev/null 2>&1; then login_shell="$(getent passwd "$(id -un)" | cut -d: -f7 || true)"; fi',
      'if [ -z "$login_shell" ] || [ ! -x "$login_shell" ]; then login_shell="/bin/bash"; fi',
      'exec "$login_shell" -il',
    ].join("\n"),
  ];
}

function remoteTerminalEnv(
  terminalType: string,
): Record<string, string | null> {
  return {
    TERM: terminalType,
    TERMINFO: null,
    TERMINFO_DIRS: null,
  };
}

function asCommandExecOutputDelta(value: unknown): {
  capReached: boolean;
  deltaBase64: string;
  processId: string;
  stream: "stdout" | "stderr";
} | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.processId !== "string" ||
    typeof value.deltaBase64 !== "string" ||
    typeof value.capReached !== "boolean"
  ) {
    return null;
  }
  if (value.stream !== "stdout" && value.stream !== "stderr") {
    return null;
  }
  return {
    capReached: value.capReached,
    deltaBase64: value.deltaBase64,
    processId: value.processId,
    stream: value.stream,
  };
}

function commandExecExitCode(result: unknown): number | null {
  if (!isRecord(result) || typeof result.exitCode !== "number") {
    return null;
  }
  return result.exitCode;
}

export function defaultTerminalCwd(): string {
  return os.homedir();
}

export function terminalStylesheetHrefs(assetFiles: string[]): string[] {
  const terminalStylesheet = "terminal-page.css";
  const appStylesheets = assetFiles
    .filter((file) =>
      /^app(?:-[A-Za-z0-9_]+|-main-[A-Za-z0-9_]+|-shell-[A-Za-z0-9_]+)\.css$/.test(
        file,
      ),
    )
    .sort(compareAppStylesheets);
  const terminalStylesheets = assetFiles.includes(terminalStylesheet)
    ? [terminalStylesheet]
    : [];
  return [...appStylesheets, ...terminalStylesheets].map(
    (file) => `/assets/${file}`,
  );
}

function compareAppStylesheets(left: string, right: string): number {
  return (
    appStylesheetRank(left) - appStylesheetRank(right) ||
    left.localeCompare(right)
  );
}

function appStylesheetRank(file: string): number {
  if (/^app-[A-Za-z0-9_]+\.css$/.test(file)) {
    return 0;
  }
  if (/^app-main-[A-Za-z0-9_]+\.css$/.test(file)) {
    return 1;
  }
  if (/^app-shell-[A-Za-z0-9_]+\.css$/.test(file)) {
    return 2;
  }
  return 3;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isTerminalType(value: unknown): value is string {
  return typeof value === "string" && TERMINAL_TYPE_PATTERN.test(value.trim());
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function terminalErrorMessage(error: unknown): TerminalServerMessage {
  const message = errorMessage(error);
  if (error instanceof TerminalMessageError) {
    return {
      type: "error",
      message,
      messageKey: error.messageKey,
      messageValues: error.messageValues,
    };
  }
  return { type: "error", message };
}
