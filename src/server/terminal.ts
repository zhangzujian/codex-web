import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";

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
    throw new Error(`Terminal cwd is not a directory: ${trimmed}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Terminal cwd is not a directory: ${trimmed}`);
  }
  return resolved;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
