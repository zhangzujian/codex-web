import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canHandleAutomationFetchMessage,
  handleAutomationDynamicToolCall,
  handleAutomationDispatchMessage,
  handleAutomationFetchMessage,
  runDueAutomations,
} from "../src/server/automation-fetch.js";

function fetchBody(message) {
  return JSON.parse(message.args[0].bodyJsonString);
}

test("automation fetch bridge creates and lists automations", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");
  const messages = [];

  try {
    assert.equal(
      canHandleAutomationFetchMessage({
        type: "fetch",
        requestId: "list",
        url: "vscode://codex/list-automations",
      }),
      true,
    );

    assert.equal(
      await handleAutomationFetchMessage(
        {
          type: "fetch",
          requestId: "create",
          method: "POST",
          url: "vscode://codex/automation-create",
          body: JSON.stringify({
            kind: "cron",
            name: "Trending",
            prompt: "Check GitHub trending",
            cwds: ["/repo"],
            executionEnvironment: "worktree",
            localEnvironmentConfigPath: null,
            model: "gpt-5",
            reasoningEffort: null,
            rrule: "FREQ=MINUTELY;INTERVAL=10",
          }),
        },
        {
          createId: () => "automation-1",
          now: () => new Date("2026-06-24T10:00:00.000Z"),
          respond: (message) => messages.push(message),
          storePath,
        },
      ),
      true,
    );

    assert.deepEqual(fetchBody(messages[0]).item, {
      id: "automation-1",
      kind: "cron",
      name: "Trending",
      prompt: "Check GitHub trending",
      status: "ACTIVE",
      cwds: ["/repo"],
      executionEnvironment: "worktree",
      localEnvironmentConfigPath: null,
      model: "gpt-5",
      rrule: "FREQ=MINUTELY;INTERVAL=10",
      createdAt: "2026-06-24T10:00:00.000Z",
      updatedAt: "2026-06-24T10:00:00.000Z",
      lastRunAt: null,
      nextRunAt: "2026-06-24T10:10:00.000Z",
    });

    assert.equal(
      await handleAutomationFetchMessage(
        {
          type: "fetch",
          requestId: "list",
          method: "POST",
          url: "vscode://codex/list-automations",
          body: JSON.stringify({}),
        },
        {
          respond: (message) => messages.push(message),
          storePath,
        },
      ),
      true,
    );

    assert.deepEqual(fetchBody(messages[1]), {
      items: [fetchBody(messages[0]).item],
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation fetch bridge updates and deletes items", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");
  const messages = [];

  try {
    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "create",
        url: "vscode://codex/automation-create",
        body: JSON.stringify({
          kind: "cron",
          name: "Trending",
          prompt: "Check GitHub trending",
          cwds: ["/repo"],
          executionEnvironment: "worktree",
          model: "gpt-5",
          rrule: "FREQ=MINUTELY;INTERVAL=10",
        }),
      },
      {
        createId: () => "automation-1",
        now: () => new Date("2026-06-24T10:00:00.000Z"),
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "update",
        url: "vscode://codex/automation-update",
        body: JSON.stringify({
          id: "automation-1",
          kind: "cron",
          name: "Trending paused",
          prompt: "Check GitHub trending",
          status: "PAUSED",
          cwds: ["/repo"],
          executionEnvironment: "worktree",
          model: "gpt-5",
          rrule: "FREQ=MINUTELY;INTERVAL=10",
        }),
      },
      {
        now: () => new Date("2026-06-24T10:01:00.000Z"),
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    assert.equal(fetchBody(messages[1]).item.name, "Trending paused");
    assert.equal(fetchBody(messages[1]).item.status, "PAUSED");
    assert.equal(
      fetchBody(messages[1]).item.updatedAt,
      "2026-06-24T10:01:00.000Z",
    );
    assert.equal(fetchBody(messages[1]).item.nextRunAt, null);

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "delete",
        url: "vscode://codex/automation-delete",
        body: JSON.stringify({ id: "automation-1" }),
      },
      {
        now: () => new Date("2026-06-24T10:02:00.000Z"),
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    assert.equal(fetchBody(messages[2]).success, true);
    assert.equal(fetchBody(messages[2]).status, "deleted");
    assert.equal(fetchBody(messages[2]).item.status, "PAUSED");

    assert.deepEqual(JSON.parse(await readFile(storePath, "utf8")).items, []);

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "list",
        url: "vscode://codex/list-automations",
      },
      {
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    assert.deepEqual(fetchBody(messages[3]), { items: [] });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation fetch bridge returns empty inbox history", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");
  const messages = [];

  try {
    assert.equal(
      await handleAutomationFetchMessage(
        {
          type: "fetch",
          requestId: "inbox",
          url: "vscode://codex/inbox-items",
        },
        { respond: (message) => messages.push(message), storePath },
      ),
      true,
    );

    assert.deepEqual(fetchBody(messages[0]), {
      items: [],
      unreadRunCounts: { total: 0, automationIds: [], unreadRuns: [] },
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation fetch bridge runs automations through app-server threads", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");
  const messages = [];
  const rpcCalls = [];

  try {
    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "create",
        url: "vscode://codex/automation-create",
        body: JSON.stringify({
          kind: "cron",
          name: "Trending",
          prompt: "Check GitHub trending",
          cwds: ["/repo"],
          executionEnvironment: "worktree",
          model: "gpt-5",
          reasoningEffort: "medium",
          rrule: "FREQ=MINUTELY;INTERVAL=10",
        }),
      },
      {
        createId: () => "automation-1",
        now: () => new Date("2026-06-24T10:00:00.000Z"),
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    assert.equal(
      await handleAutomationFetchMessage(
        {
          type: "fetch",
          requestId: "run",
          url: "vscode://codex/automation-run-now",
          body: JSON.stringify({ id: "automation-1" }),
        },
        {
          appServerClient: {
            async rpc(method, params) {
              rpcCalls.push({ method, params });
              if (method === "thread/start") {
                return { thread: { id: "thread-1" } };
              }
              if (method === "turn/start") {
                return { turn: { id: "turn-1" } };
              }
              throw new Error(`unexpected rpc ${method}`);
            },
          },
          now: () => new Date("2026-06-24T10:05:00.000Z"),
          respond: (message) => messages.push(message),
          storePath,
        },
      ),
      true,
    );

    assert.equal(fetchBody(messages[1]).success, true);
    assert.equal(fetchBody(messages[1]).threadId, "thread-1");
    assert.deepEqual(rpcCalls, [
      {
        method: "thread/start",
        params: {
          cwd: "/repo",
          model: "gpt-5",
          threadSource: "automation",
        },
      },
      {
        method: "turn/start",
        params: {
          threadId: "thread-1",
          input: [
            {
              type: "text",
              text: [
                "Automation: Trending",
                "Automation ID: automation-1",
                `Automation memory: ${path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "automations", "automation-1", "memory.md")}`,
                "Last run: never",
                "",
                "Check GitHub trending",
              ].join("\n"),
              text_elements: [],
            },
          ],
          cwd: "/repo",
          model: "gpt-5",
          effort: "medium",
        },
      },
    ]);

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "list",
        url: "vscode://codex/list-automations",
      },
      {
        respond: (message) => messages.push(message),
        storePath,
      },
    );
    assert.equal(
      fetchBody(messages[2]).items[0].lastRunAt,
      "2026-06-24T10:05:00.000Z",
    );
    assert.equal(
      fetchBody(messages[2]).items[0].nextRunAt,
      "2026-06-24T10:15:00.000Z",
    );

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "inbox",
        url: "vscode://codex/inbox-items",
      },
      {
        respond: (message) => messages.push(message),
        storePath,
      },
    );
    assert.deepEqual(fetchBody(messages[3]).items, [
      {
        id: "automation-1:thread-1",
        automationId: "automation-1",
        automationName: "Trending",
        threadId: "thread-1",
        title: "Trending",
        status: "ACCEPTED",
        createdAt: Date.parse("2026-06-24T10:05:00.000Z"),
        readAt: null,
        sourceCwd: "/repo",
      },
    ]);
    assert.deepEqual(fetchBody(messages[3]).unreadRunCounts, {
      total: 1,
      automationIds: ["automation-1"],
      unreadRuns: [{ automationId: "automation-1", threadId: "thread-1" }],
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation dispatch bridge marks inbox items read and unread", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");
  const messages = [];

  try {
    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "create",
        url: "vscode://codex/automation-create",
        body: JSON.stringify({
          kind: "cron",
          name: "Trending",
          prompt: "Check GitHub trending",
          cwds: ["/repo"],
          executionEnvironment: "worktree",
          model: "gpt-5",
          rrule: "FREQ=MINUTELY;INTERVAL=10",
        }),
      },
      {
        createId: () => "automation-1",
        now: () => new Date("2026-06-24T10:00:00.000Z"),
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "run",
        url: "vscode://codex/automation-run-now",
        body: JSON.stringify({ id: "automation-1" }),
      },
      {
        appServerClient: {
          async rpc(method) {
            return method === "thread/start"
              ? { thread: { id: "thread-1" } }
              : { turn: { id: "turn-1" } };
          },
        },
        now: () => new Date("2026-06-24T10:05:00.000Z"),
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    assert.equal(
      await handleAutomationDispatchMessage(
        {
          type: "inbox-item-set-read-state",
          id: "automation-1:thread-1",
          isRead: true,
        },
        {
          now: () => new Date("2026-06-24T10:06:00.000Z"),
          storePath,
        },
      ),
      true,
    );

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "inbox-read",
        url: "vscode://codex/inbox-items",
      },
      {
        respond: (message) => messages.push(message),
        storePath,
      },
    );
    assert.equal(
      fetchBody(messages[2]).items[0].readAt,
      Date.parse("2026-06-24T10:06:00.000Z"),
    );
    assert.deepEqual(fetchBody(messages[2]).unreadRunCounts, {
      total: 0,
      automationIds: [],
      unreadRuns: [],
    });

    await handleAutomationDispatchMessage(
      {
        type: "inbox-item-set-read-state",
        id: "automation-1:thread-1",
        isRead: false,
      },
      { storePath },
    );

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "inbox-unread",
        url: "vscode://codex/inbox-items",
      },
      {
        respond: (message) => messages.push(message),
        storePath,
      },
    );
    assert.equal(fetchBody(messages[3]).items[0].readAt, null);
    assert.deepEqual(fetchBody(messages[3]).unreadRunCounts, {
      total: 1,
      automationIds: ["automation-1"],
      unreadRuns: [{ automationId: "automation-1", threadId: "thread-1" }],
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation dispatch bridge marks all automation runs read", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");
  const messages = [];

  try {
    for (const id of ["automation-1", "automation-2"]) {
      await handleAutomationFetchMessage(
        {
          type: "fetch",
          requestId: `create-${id}`,
          url: "vscode://codex/automation-create",
          body: JSON.stringify({
            kind: "cron",
            name: id,
            prompt: "Check GitHub trending",
            cwds: ["/repo"],
            executionEnvironment: "worktree",
            model: "gpt-5",
            rrule: "FREQ=MINUTELY;INTERVAL=10",
          }),
        },
        {
          createId: () => id,
          now: () => new Date("2026-06-24T10:00:00.000Z"),
          respond: (message) => messages.push(message),
          storePath,
        },
      );

      await handleAutomationFetchMessage(
        {
          type: "fetch",
          requestId: `run-${id}`,
          url: "vscode://codex/automation-run-now",
          body: JSON.stringify({ id }),
        },
        {
          appServerClient: {
            async rpc(method) {
              return method === "thread/start"
                ? { thread: { id: `thread-${id}` } }
                : { turn: { id: "turn-1" } };
            },
          },
          now: () => new Date("2026-06-24T10:05:00.000Z"),
          respond: (message) => messages.push(message),
          storePath,
        },
      );
    }

    assert.equal(
      await handleAutomationDispatchMessage(
        {
          type: "inbox-automation-runs-mark-all-read",
          readAt: Date.parse("2026-06-24T10:07:00.000Z"),
        },
        { storePath },
      ),
      true,
    );

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "inbox",
        url: "vscode://codex/inbox-items",
      },
      {
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    assert.deepEqual(
      fetchBody(messages[4]).items.map((item) => item.readAt),
      [
        Date.parse("2026-06-24T10:07:00.000Z"),
        Date.parse("2026-06-24T10:07:00.000Z"),
      ],
    );
    assert.deepEqual(fetchBody(messages[4]).unreadRunCounts, {
      total: 0,
      automationIds: [],
      unreadRuns: [],
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation dispatch bridge deletes run history for deleted threads", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");
  const messages = [];

  try {
    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "create",
        url: "vscode://codex/automation-create",
        body: JSON.stringify({
          kind: "cron",
          name: "Trending",
          prompt: "Check GitHub trending",
          cwds: ["/repo"],
          executionEnvironment: "worktree",
          rrule: "FREQ=MINUTELY;INTERVAL=10",
        }),
      },
      {
        createId: () => "automation-1",
        now: () => new Date("2026-06-24T10:00:00.000Z"),
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "run",
        url: "vscode://codex/automation-run-now",
        body: JSON.stringify({ id: "automation-1" }),
      },
      {
        appServerClient: {
          async rpc(method) {
            return method === "thread/start"
              ? { thread: { id: "thread-1" } }
              : { turn: { id: "turn-1" } };
          },
        },
        now: () => new Date("2026-06-24T10:05:00.000Z"),
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    assert.equal(
      await handleAutomationDispatchMessage(
        {
          type: "inbox-automation-run-delete-by-thread",
          threadId: "thread-1",
        },
        { storePath },
      ),
      true,
    );

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "inbox",
        url: "vscode://codex/inbox-items",
      },
      {
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    assert.deepEqual(fetchBody(messages[2]).items, []);
    assert.deepEqual(fetchBody(messages[2]).unreadRunCounts, {
      total: 0,
      automationIds: [],
      unreadRuns: [],
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation due runner runs active due automations once", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");
  const messages = [];
  const rpcCalls = [];

  try {
    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "create",
        url: "vscode://codex/automation-create",
        body: JSON.stringify({
          kind: "cron",
          name: "Trending",
          prompt: "Check GitHub trending",
          cwds: ["/repo"],
          executionEnvironment: "worktree",
          model: "gpt-5",
          rrule: "FREQ=MINUTELY;INTERVAL=10",
        }),
      },
      {
        createId: () => "automation-1",
        now: () => new Date("2026-06-24T10:00:00.000Z"),
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    const runCount = await runDueAutomations({
      appServerClient: {
        async rpc(method) {
          rpcCalls.push(method);
          return method === "thread/start"
            ? { thread: { id: "thread-1" } }
            : { turn: { id: "turn-1" } };
        },
      },
      now: () => new Date("2026-06-24T10:10:00.000Z"),
      storePath,
    });

    assert.equal(runCount, 1);
    assert.deepEqual(rpcCalls, ["thread/start", "turn/start"]);

    const secondRunCount = await runDueAutomations({
      appServerClient: {
        async rpc(method) {
          rpcCalls.push(method);
          return method === "thread/start"
            ? { thread: { id: "thread-2" } }
            : { turn: { id: "turn-2" } };
        },
      },
      now: () => new Date("2026-06-24T10:10:30.000Z"),
      storePath,
    });

    assert.equal(secondRunCount, 0);
    assert.deepEqual(rpcCalls, ["thread/start", "turn/start"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation_update dynamic tool creates, updates, and deletes automations", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");

  try {
    const created = await handleAutomationDynamicToolCall(
      {
        arguments: {
          mode: "create",
          kind: "cron",
          name: "Trending",
          prompt: "Check GitHub trending",
          cwds: ["/repo"],
          executionEnvironment: "worktree",
          localEnvironmentConfigPath: null,
          model: "gpt-5",
          reasoningEffort: null,
          rrule: "FREQ=MINUTELY;INTERVAL=10",
          status: "ACTIVE",
        },
        callId: "call-1",
        threadId: "thread-1",
        tool: "automation_update",
        turnId: "turn-1",
      },
      {
        createId: () => "automation-1",
        now: () => new Date("2026-06-24T10:00:00.000Z"),
        storePath,
      },
    );

    assert.equal(created.success, true);
    assert.deepEqual(JSON.parse(created.contentItems[0].text), {
      automationId: "automation-1",
      mode: "create",
    });

    const updated = await handleAutomationDynamicToolCall(
      {
        arguments: {
          id: "automation-1",
          mode: "update",
          kind: "cron",
          name: "Trending paused",
          prompt: "Check GitHub trending",
          status: "PAUSED",
          cwds: ["/repo"],
          executionEnvironment: "worktree",
          localEnvironmentConfigPath: null,
          model: "gpt-5",
          reasoningEffort: null,
          rrule: "FREQ=MINUTELY;INTERVAL=10",
        },
        callId: "call-2",
        threadId: "thread-1",
        tool: "automation_update",
        turnId: "turn-2",
      },
      {
        now: () => new Date("2026-06-24T10:01:00.000Z"),
        storePath,
      },
    );

    assert.equal(updated.success, true);
    assert.deepEqual(JSON.parse(updated.contentItems[0].text), {
      automationId: "automation-1",
      mode: "update",
    });

    const deleted = await handleAutomationDynamicToolCall(
      {
        arguments: {
          id: "automation-1",
          mode: "delete",
        },
        callId: "call-3",
        threadId: "thread-1",
        tool: "automation_update",
        turnId: "turn-3",
      },
      { storePath },
    );

    assert.equal(deleted.success, true);
    assert.deepEqual(JSON.parse(deleted.contentItems[0].text), {
      automationId: "automation-1",
      mode: "delete",
      deleteStatus: "deleted",
      snapshot: {
        kind: "cron",
        name: "Trending paused",
        rrule: "FREQ=MINUTELY;INTERVAL=10",
      },
    });
    assert.deepEqual(JSON.parse(await readFile(storePath, "utf8")).items, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation_update dynamic tool normalizes common model-shaped cron arguments", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");
  const messages = [];

  try {
    const created = await handleAutomationDynamicToolCall(
      {
        arguments: {
          mode: "create",
          name: "Fetch origin master head commit",
          prompt: "Use gh to check the repository every ten minutes.",
          rrule: "DTSTART:20260624T140000Z\nRRULE:FREQ=MINUTELY;INTERVAL=10",
          cwds: "/home/zhang/kube-ovn",
          destination: "thread",
          executionEnvironment: "local",
          localEnvironmentConfigPath: "",
          model: "",
          reasoningEffort: "",
        },
        threadId: "thread-1",
        tool: "automation_update",
      },
      {
        createId: () => "automation-1",
        now: () => new Date("2026-06-24T14:00:00.000Z"),
        storePath,
      },
    );

    assert.equal(created.success, true);
    assert.deepEqual(JSON.parse(created.contentItems[0].text), {
      automationId: "automation-1",
      mode: "create",
    });

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "list",
        url: "vscode://codex/list-automations",
      },
      {
        respond: (message) => messages.push(message),
        storePath,
      },
    );

    assert.deepEqual(fetchBody(messages[0]).items[0], {
      id: "automation-1",
      kind: "cron",
      name: "Fetch origin master head commit",
      prompt: "Use gh to check the repository every ten minutes.",
      status: "ACTIVE",
      cwds: ["/home/zhang/kube-ovn"],
      executionEnvironment: "worktree",
      localEnvironmentConfigPath: null,
      rrule: "FREQ=MINUTELY;INTERVAL=10",
      createdAt: "2026-06-24T14:00:00.000Z",
      updatedAt: "2026-06-24T14:00:00.000Z",
      lastRunAt: null,
      nextRunAt: "2026-06-24T14:10:00.000Z",
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation_update view lists automations and rejects unsupported suggested modes", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");

  try {
    await handleAutomationDynamicToolCall(
      {
        arguments: {
          mode: "create",
          name: "Fetch origin master head commit",
          prompt: "Use gh to check the repository every ten minutes.",
          rrule: "FREQ=MINUTELY;INTERVAL=10",
          cwds: "/home/zhang/kube-ovn",
        },
        threadId: "thread-1",
        tool: "automation_update",
      },
      {
        createId: () => "automation-1",
        now: () => new Date("2026-06-24T14:00:00.000Z"),
        storePath,
      },
    );

    const viewed = await handleAutomationDynamicToolCall(
      {
        arguments: { mode: "view" },
        threadId: "thread-1",
        tool: "automation_update",
      },
      { storePath },
    );

    assert.equal(viewed.success, true);
    assert.deepEqual(JSON.parse(viewed.contentItems[0].text), {
      items: [
        {
          id: "automation-1",
          kind: "cron",
          name: "Fetch origin master head commit",
          status: "ACTIVE",
          rrule: "FREQ=MINUTELY;INTERVAL=10",
          cwds: ["/home/zhang/kube-ovn"],
        },
      ],
    });

    const suggested = await handleAutomationDynamicToolCall(
      {
        arguments: { mode: "suggested_create" },
        threadId: "thread-1",
        tool: "automation_update",
      },
      { storePath },
    );

    assert.equal(suggested.success, false);
    assert.equal(
      suggested.contentItems[0].text,
      "automation_update received invalid mode.",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("automation_update uses Codex defaults when model and reasoning effort are omitted", async () => {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "codex-web-automation-"),
  );
  const storePath = path.join(tempDir, "automations.json");
  const rpcCalls = [];

  try {
    const created = await handleAutomationDynamicToolCall(
      {
        arguments: {
          mode: "create",
          name: "Fetch origin master head commit",
          prompt: "Use gh to check the repository every ten minutes.",
          rrule: "FREQ=MINUTELY;INTERVAL=10",
          cwds: "/home/zhang/kube-ovn",
        },
        threadId: "thread-1",
        tool: "automation_update",
      },
      {
        createId: () => "automation-1",
        now: () => new Date("2026-06-24T14:00:00.000Z"),
        storePath,
      },
    );

    assert.equal(created.success, true);

    const viewed = await handleAutomationDynamicToolCall(
      {
        arguments: { mode: "view" },
        threadId: "thread-1",
        tool: "automation_update",
      },
      { storePath },
    );
    const [item] = JSON.parse(viewed.contentItems[0].text).items;
    assert.equal(Object.hasOwn(item, "model"), false);
    assert.equal(Object.hasOwn(item, "reasoningEffort"), false);

    await handleAutomationFetchMessage(
      {
        type: "fetch",
        requestId: "run",
        url: "vscode://codex/automation-run-now",
        body: JSON.stringify({ id: "automation-1" }),
      },
      {
        appServerClient: {
          async rpc(method, params) {
            rpcCalls.push({ method, params });
            return method === "thread/start"
              ? { thread: { id: "thread-1" } }
              : { turn: { id: "turn-1" } };
          },
        },
        now: () => new Date("2026-06-24T14:05:00.000Z"),
        storePath,
      },
    );

    assert.deepEqual(
      rpcCalls.map(({ method, params }) => ({
        method,
        hasModel: Object.hasOwn(params, "model"),
        hasEffort: Object.hasOwn(params, "effort"),
      })),
      [
        { method: "thread/start", hasModel: false, hasEffort: false },
        { method: "turn/start", hasModel: false, hasEffort: false },
      ],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
