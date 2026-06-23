import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  createCommandExecRemoteProcessConnection,
  createNodePtyTerminalSessionFactory,
  createRemoteTerminalSessionFactory,
  createTerminalSocketHandler,
  parseTerminalClientMessage,
  resolveTerminalCwd,
} from "../src/server/terminal.js";

test("parseTerminalClientMessage accepts create, input, resize, and close messages", () => {
  assert.deepEqual(
    parseTerminalClientMessage({
      type: "create",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
      terminalType: "linux",
    }),
    {
      type: "create",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
      terminalType: "linux",
    },
  );
  assert.deepEqual(
    parseTerminalClientMessage({ type: "input", data: "ls\r" }),
    {
      type: "input",
      data: "ls\r",
    },
  );
  assert.deepEqual(
    parseTerminalClientMessage({ type: "resize", cols: 100, rows: 30 }),
    {
      type: "resize",
      cols: 100,
      rows: 30,
    },
  );
  assert.deepEqual(parseTerminalClientMessage({ type: "close" }), {
    type: "close",
  });
});

test("parseTerminalClientMessage rejects malformed messages", () => {
  assert.throws(
    () => parseTerminalClientMessage({ type: "create", cwd: 123 }),
    /Invalid terminal create message/,
  );
  assert.throws(
    () =>
      parseTerminalClientMessage({ type: "create", terminalType: "bad term" }),
    /Invalid terminal create message/,
  );
  assert.throws(
    () => parseTerminalClientMessage({ type: "input", data: 123 }),
    /Invalid terminal input message/,
  );
  assert.throws(
    () => parseTerminalClientMessage({ type: "resize", cols: 0, rows: 24 }),
    /Invalid terminal resize message/,
  );
  assert.throws(
    () => parseTerminalClientMessage({ type: "unknown" }),
    /Unknown terminal message type/,
  );
});

test("resolveTerminalCwd returns requested directories and falls back to process cwd", () => {
  assert.equal(resolveTerminalCwd("/tmp"), "/tmp");
  assert.equal(resolveTerminalCwd(""), process.cwd());
});

test(
  "node pty terminal sessions inject CODEX_SHELL",
  { skip: process.platform === "win32" },
  async () => {
    const previousCodexShell = process.env.CODEX_SHELL;
    const previousShell = process.env.SHELL;
    delete process.env.CODEX_SHELL;
    process.env.SHELL = "/bin/sh";

    try {
      const session = createNodePtyTerminalSessionFactory().createSession({
        cols: 80,
        cwd: "/tmp",
        rows: 24,
        terminalType: "xterm-256color",
      });
      let output = "";
      session.onData((data) => {
        output += data;
      });
      const exit = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          session.close();
          reject(new Error("Timed out waiting for terminal session to exit"));
        }, 3000);
        session.onExit(() => {
          clearTimeout(timeout);
          resolve();
        });
      });

      session.write('printf "codex-shell=%s\\n" "$CODEX_SHELL"; exit\r');
      await exit;

      assert.match(output, /codex-shell=1/);
    } finally {
      if (previousCodexShell === undefined) {
        delete process.env.CODEX_SHELL;
      } else {
        process.env.CODEX_SHELL = previousCodexShell;
      }
      if (previousShell === undefined) {
        delete process.env.SHELL;
      } else {
        process.env.SHELL = previousShell;
      }
    }
  },
);

test("terminal socket handler creates a session and forwards input, resize, and close", async () => {
  const socket = new FakeSocket();
  const calls = [];
  const handler = createTerminalSocketHandler({
    createSession(options) {
      calls.push(["create", options]);
      return {
        id: "session-1",
        write(data) {
          calls.push(["write", data]);
        },
        resize(cols, rows) {
          calls.push(["resize", cols, rows]);
        },
        close() {
          calls.push(["close"]);
        },
        onData(listener) {
          calls.push(["onData"]);
          listener("hello\r\n");
        },
        onExit(listener) {
          calls.push(["onExit"]);
          this.exit = listener;
        },
      };
    },
  });

  handler(socket);

  socket.emitMessage({
    type: "create",
    cwd: "/tmp",
    cols: 80,
    rows: 24,
    terminalType: "linux",
  });
  socket.emitMessage({ type: "input", data: "pwd\r" });
  socket.emitMessage({ type: "resize", cols: 100, rows: 30 });
  socket.emitMessage({ type: "close" });

  assert.deepEqual(calls, [
    ["create", { cwd: "/tmp", cols: 80, rows: 24, terminalType: "linux" }],
    ["onData"],
    ["onExit"],
    ["write", "pwd\r"],
    ["resize", 100, 30],
    ["close"],
  ]);
  assert.deepEqual(socket.sentMessages, [
    { type: "created", sessionId: "session-1" },
    { type: "output", data: "hello\r\n" },
  ]);
});

test("terminal socket handler can use a remote cwd resolver", () => {
  const socket = new FakeSocket();
  const calls = [];
  const handler = createTerminalSocketHandler(
    {
      createSession(options) {
        calls.push(["create", options.cwd]);
        return {
          id: "session-1",
          close() {},
          onData() {},
          onExit() {},
          resize() {},
          write() {},
        };
      },
    },
    {
      resolveCwd(cwd) {
        return `remote:${cwd}`;
      },
    },
  );

  handler(socket);
  socket.emitMessage({ type: "create", cwd: "/not-local" });

  assert.deepEqual(calls, [["create", "remote:/not-local"]]);
});

test("remote terminal sessions spawn a remote tty process and clean up on close", async () => {
  let spawnOptions;
  const calls = [];
  const connection = {
    async startProcess(options) {
      spawnOptions = options;
      return {
        response: new Promise(() => {}),
        async write(data) {
          calls.push(["write", data.toString("utf8")]);
        },
        async resize(size) {
          calls.push(["resize", size]);
        },
        async terminate() {
          calls.push(["terminate"]);
        },
      };
    },
  };
  const session = createRemoteTerminalSessionFactory(connection).createSession({
    cols: 80,
    cwd: "/workspace",
    rows: 24,
    terminalType: "xterm-256color",
  });
  let output = "";
  session.onData((data) => {
    output += data;
  });

  spawnOptions.onStdoutDelta({
    chunk: Buffer.from("remote-output"),
    capReached: false,
  });
  session.write("pwd\r");
  session.resize(100, 30);
  session.close();
  spawnOptions.onStdoutDelta({
    chunk: Buffer.from("ignored-after-close"),
    capReached: false,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(spawnOptions.processHandle, session.id);
  assert.equal(spawnOptions.tty, true);
  assert.deepEqual(spawnOptions.size, { cols: 80, rows: 24 });
  assert.equal(spawnOptions.cwd, "/workspace");
  assert.equal(spawnOptions.env.TERM, "xterm-256color");
  assert.equal(output, "remote-output");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["write", "pwd\r"],
    ["resize", { cols: 100, rows: 30 }],
    ["terminate"],
  ]);
});

test("command exec remote process connection maps process calls to app-server rpc and unregisters notifications on terminate", async () => {
  const notifications = new Set();
  const rpcCalls = [];
  let execResolve;
  const client = {
    onNotification(listener) {
      notifications.add(listener);
      return () => notifications.delete(listener);
    },
    async rpc(method, params, options) {
      rpcCalls.push([method, params, options]);
      if (method === "command/exec") {
        return await new Promise((resolve) => {
          execResolve = resolve;
        });
      }
      return {};
    },
  };
  let stdout = "";

  const session = await createCommandExecRemoteProcessConnection(
    client,
  ).startProcess({
    command: ["sh", "-lc", "echo hi"],
    cwd: "/workspace",
    env: { TERM: "xterm-256color" },
    onStderrDelta() {},
    onStdoutDelta(delta) {
      stdout += delta.chunk.toString("utf8");
    },
    outputBytesCap: null,
    processHandle: "proc-1",
    size: { cols: 80, rows: 24 },
    streamStdoutStderr: true,
    timeoutMs: null,
    tty: true,
  });

  for (const listener of notifications) {
    listener({
      method: "command/exec/outputDelta",
      params: {
        processId: "proc-1",
        stream: "stdout",
        deltaBase64: Buffer.from("out").toString("base64"),
        capReached: false,
      },
    });
  }

  await session.write(Buffer.from("pwd\r", "utf8"));
  await session.resize({ cols: 100, rows: 30 });
  await session.terminate();
  assert.equal(notifications.size, 0);
  execResolve({ exitCode: 7, stdout: "", stderr: "" });

  assert.equal(stdout, "out");
  assert.deepEqual(rpcCalls, [
    [
      "command/exec",
      {
        command: ["sh", "-lc", "echo hi"],
        cwd: "/workspace",
        disableOutputCap: true,
        disableTimeout: true,
        env: { TERM: "xterm-256color" },
        processId: "proc-1",
        size: { cols: 80, rows: 24 },
        streamStdin: true,
        streamStdoutStderr: true,
        tty: true,
      },
      { timeoutMs: null },
    ],
    [
      "command/exec/write",
      {
        processId: "proc-1",
        deltaBase64: Buffer.from("pwd\r", "utf8").toString("base64"),
        closeStdin: false,
      },
      undefined,
    ],
    [
      "command/exec/resize",
      {
        processId: "proc-1",
        size: { cols: 100, rows: 30 },
      },
      undefined,
    ],
    ["command/exec/terminate", { processId: "proc-1" }, undefined],
  ]);
  assert.deepEqual(await session.response, { exitCode: 7 });
});

test("terminal socket handler ignores stale exit events from replaced sessions", async () => {
  const socket = new FakeSocket();
  const sessions = [];
  const calls = [];
  const handler = createTerminalSocketHandler({
    createSession() {
      const id = `session-${sessions.length + 1}`;
      const session = {
        id,
        write(data) {
          calls.push([id, "write", data]);
        },
        resize() {},
        close() {
          calls.push([id, "close"]);
        },
        onData() {},
        onExit(listener) {
          session.exit = listener;
        },
      };
      sessions.push(session);
      return session;
    },
  });

  handler(socket);

  socket.emitMessage({ type: "create", cwd: "/tmp", cols: 80, rows: 24 });
  socket.emitMessage({ type: "create", cwd: "/tmp", cols: 80, rows: 24 });
  sessions[0].exit({ exitCode: 0, signal: null });
  socket.emitMessage({ type: "input", data: "still-active\r" });

  assert.deepEqual(calls, [
    ["session-1", "close"],
    ["session-2", "write", "still-active\r"],
  ]);
});

test("terminal socket handler sends localized error keys with fallback text", async () => {
  const socket = new FakeSocket();
  const handler = createTerminalSocketHandler({
    createSession() {
      throw new Error("should not create a session");
    },
  });

  handler(socket);
  socket.emitMessage({ type: "create", cwd: 123 });
  socket.emitMessage({ type: "create", cwd: "/tmp/not-a-directory" });

  assert.deepEqual(socket.sentMessages, [
    {
      type: "error",
      message: "Invalid terminal create message",
      messageKey: "error.invalidCreateMessage",
      messageValues: {},
    },
    {
      type: "error",
      message: "Terminal cwd is not a directory: /tmp/not-a-directory",
      messageKey: "error.cwdNotDirectory",
      messageValues: { cwd: "/tmp/not-a-directory" },
    },
  ]);
});

class FakeSocket extends EventEmitter {
  sentMessages = [];
  readyState = 1;

  send(payload) {
    this.sentMessages.push(JSON.parse(String(payload)));
  }

  close() {
    this.emit("close");
  }

  emitMessage(message) {
    this.emit("message", JSON.stringify(message));
  }
}
