import assert from "node:assert/strict";
import test from "node:test";

import { createAppServerJsonRpcClient } from "../src/server/app-server-client.js";

test("app server json rpc client initializes, calls, and forwards notifications", async () => {
  const script = `
    const readline = require("node:readline");
    const rl = readline.createInterface({ input: process.stdin });
    process.stdout.write(JSON.stringify({ method: "server/ready", params: { ok: true } }) + "\\n");
    rl.on("line", (line) => {
      const message = JSON.parse(line);
      if (message.method === "initialize") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { ok: true } }) + "\\n");
        return;
      }
      if (message.method === "initialized") {
        return;
      }
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { method: message.method, params: message.params } }) + "\\n");
    });
  `;
  const client = createAppServerJsonRpcClient({
    args: ["-e", script],
    command: process.execPath,
  });
  const notifications = [];
  client.onNotification((notification) => {
    notifications.push(notification);
  });

  const result = await client.rpc("command/exec/write", {
    processId: "proc-1",
  });
  client.dispose();

  assert.deepEqual(result, {
    method: "command/exec/write",
    params: { processId: "proc-1" },
  });
  assert.deepEqual(notifications, [
    { method: "server/ready", params: { ok: true } },
  ]);
});

test("app server json rpc client times out unanswered requests", async () => {
  const script = `
    const readline = require("node:readline");
    const rl = readline.createInterface({ input: process.stdin });
    process.stdin.once("data", (chunk) => {
      const message = JSON.parse(String(chunk).trim());
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { ok: true } }) + "\\n");
    });
    rl.on("line", (line) => {
      const message = JSON.parse(line);
    });
  `;
  const client = createAppServerJsonRpcClient({
    args: ["-e", script],
    command: process.execPath,
    requestTimeoutMs: 100,
  });

  await assert.rejects(() => client.rpc("never/replies", {}), /timed out/);
  client.dispose();
});

test("app server json rpc client can disable timeout for long-running requests", async () => {
  const script = `
    const readline = require("node:readline");
    const rl = readline.createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      const message = JSON.parse(line);
      if (message.method === "initialize") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { ok: true } }) + "\\n");
      }
    });
  `;
  const client = createAppServerJsonRpcClient({
    args: ["-e", script],
    command: process.execPath,
    requestTimeoutMs: 100,
  });
  let settled = false;

  const pending = client
    .rpc("command/exec", {}, { timeoutMs: null })
    .finally(() => {
      settled = true;
    });
  await new Promise((resolve) => setTimeout(resolve, 150));

  try {
    assert.equal(settled, false);
  } finally {
    client.dispose();
  }
  await assert.rejects(pending, /stopped|exited|timed out/);
});

test("app server json rpc client drains stderr and disposes pending requests", async () => {
  const script = `
    const readline = require("node:readline");
    const rl = readline.createInterface({ input: process.stdin });
    process.stderr.write("x".repeat(1024 * 1024));
    rl.on("line", (line) => {
      const message = JSON.parse(line);
      if (message.method === "initialize") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { ok: true } }) + "\\n");
        return;
      }
      if (message.method === "initialized") {
        return;
      }
      if (message.method === "after/dispose") {
        return;
      }
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { ok: true } }) + "\\n");
    });
  `;
  const client = createAppServerJsonRpcClient({
    args: ["-e", script],
    command: process.execPath,
    requestTimeoutMs: 1_000,
  });

  assert.deepEqual(await client.rpc("after/stderr", {}), { ok: true });

  const pending = client.rpc("after/dispose", {});
  await new Promise((resolve) => setImmediate(resolve));
  client.dispose();
  await assert.rejects(pending, /stopped|exited/);
});

test("app server json rpc client answers server requests", async () => {
  const script = `
    const readline = require("node:readline");
    const rl = readline.createInterface({ input: process.stdin });
    let pendingAfterToolCallId = null;
    let toolResult = null;
    function maybeReply() {
      if (pendingAfterToolCallId == null || toolResult == null) {
        return;
      }
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: pendingAfterToolCallId, result: toolResult }) + "\\n");
      pendingAfterToolCallId = null;
    }
    rl.on("line", (line) => {
      const message = JSON.parse(line);
      if (message.method === "initialize") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { ok: true } }) + "\\n");
        return;
      }
      if (message.method === "initialized") {
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          id: 99,
          method: "item/tool/call",
          params: {
            arguments: { mode: "create" },
            callId: "call-1",
            threadId: "thread-1",
            tool: "automation_update",
            turnId: "turn-1"
          }
        }) + "\\n");
        return;
      }
      if (message.id === 99) {
        toolResult = message.result;
        maybeReply();
        return;
      }
      if (message.method === "after/tool-call") {
        pendingAfterToolCallId = message.id;
        maybeReply();
      }
    });
  `;
  const client = createAppServerJsonRpcClient({
    args: ["-e", script],
    command: process.execPath,
    requestHandler(request) {
      assert.equal(request.method, "item/tool/call");
      return {
        contentItems: [
          { type: "inputText", text: JSON.stringify(request.params) },
        ],
        success: true,
      };
    },
  });

  const result = await client.rpc("after/tool-call", {});
  client.dispose();

  assert.deepEqual(result, {
    contentItems: [
      {
        type: "inputText",
        text: JSON.stringify({
          arguments: { mode: "create" },
          callId: "call-1",
          threadId: "thread-1",
          tool: "automation_update",
          turnId: "turn-1",
        }),
      },
    ],
    success: true,
  });
});
