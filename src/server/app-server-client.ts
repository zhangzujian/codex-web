import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type AppServerNotification = {
  method: string;
  params: unknown;
};

export type AppServerJsonRpcClient = {
  dispose: () => void;
  onNotification: (
    listener: (notification: AppServerNotification) => void,
  ) => () => void;
  rpc: (
    method: string,
    params: unknown,
    options?: { timeoutMs?: number | null },
  ) => Promise<unknown>;
};

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
  timeout: NodeJS.Timeout | null;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export function createCodexAppServerClient(
  env: NodeJS.ProcessEnv = process.env,
): AppServerJsonRpcClient {
  return createAppServerJsonRpcClient({
    args: ["app-server"],
    command: env.CODEX_CLI_PATH?.trim() || "codex",
    env,
  });
}

export function createAppServerJsonRpcClient({
  args,
  command,
  env = process.env,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}: {
  args: string[];
  command: string;
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
}): AppServerJsonRpcClient {
  let initialized = false;
  let initializing: Promise<void> | null = null;
  let nextId = 1;
  let processHandle: ChildProcessWithoutNullStreams | null = null;
  let readBuffer = "";
  const listeners = new Set<(notification: AppServerNotification) => void>();
  const pending = new Map<number, PendingRequest>();

  const failPending = (error: Error): void => {
    for (const [id, request] of pending) {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      pending.delete(id);
      request.reject(error);
    }
  };

  const start = (): ChildProcessWithoutNullStreams => {
    if (processHandle) {
      return processHandle;
    }
    const subprocess = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    processHandle = subprocess;
    subprocess.stdout.setEncoding("utf8");
    subprocess.stdout.on("data", (chunk) => {
      readBuffer += chunk;
      let lineEnd = readBuffer.indexOf("\n");
      while (lineEnd !== -1) {
        const line = readBuffer.slice(0, lineEnd).trim();
        readBuffer = readBuffer.slice(lineEnd + 1);
        if (line) {
          handleLine(line);
        }
        lineEnd = readBuffer.indexOf("\n");
      }
    });
    subprocess.stderr.resume();
    subprocess.on("error", (error) => {
      if (processHandle !== subprocess) {
        return;
      }
      failPending(error);
    });
    subprocess.on("exit", () => {
      if (processHandle !== subprocess) {
        return;
      }
      processHandle = null;
      initialized = false;
      initializing = null;
      readBuffer = "";
      failPending(new Error("codex app-server exited"));
    });
    return subprocess;
  };

  const sendLine = (payload: unknown): void => {
    start().stdin.write(`${JSON.stringify(payload)}\n`);
  };

  const call = (
    method: string,
    params: unknown,
    options: { timeoutMs?: number | null } = {},
  ): Promise<unknown> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timeoutMs =
        "timeoutMs" in options ? options.timeoutMs : requestTimeoutMs;
      const timeout =
        timeoutMs === null
          ? null
          : setTimeout(() => {
              pending.delete(id);
              reject(
                new Error(`codex app-server request timed out: ${method}`),
              );
            }, timeoutMs);
      pending.set(id, { reject, resolve, timeout });
      sendLine({ jsonrpc: "2.0", id, method, params });
    });
  };

  const ensureInitialized = async (): Promise<void> => {
    if (initialized) {
      return;
    }
    if (initializing) {
      await initializing;
      return;
    }
    initializing = call("initialize", {
      capabilities: { experimentalApi: true },
      clientInfo: { name: "codex-web", version: "0.1.0" },
    })
      .then(() => {
        sendLine({ jsonrpc: "2.0", method: "initialized" });
        initialized = true;
      })
      .finally(() => {
        initializing = null;
      });
    await initializing;
  };

  const handleLine = (line: string): void => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(message)) {
      return;
    }
    if (typeof message.id === "number" && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (!request) {
        return;
      }
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      const error = isRecord(message.error) ? message.error : null;
      if (error) {
        request.reject(new Error(String(error.message ?? "app-server error")));
      } else {
        request.resolve(message.result);
      }
      return;
    }
    if (typeof message.method === "string" && !("id" in message)) {
      for (const listener of listeners) {
        listener({ method: message.method, params: message.params });
      }
    }
  };

  return {
    dispose() {
      const subprocess = processHandle;
      processHandle = null;
      initialized = false;
      initializing = null;
      readBuffer = "";
      failPending(new Error("codex app-server stopped"));
      listeners.clear();
      subprocess?.stdin.end();
      subprocess?.kill();
    },
    onNotification(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async rpc(method, params, options) {
      await ensureInitialized();
      return await call(method, params, options);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
