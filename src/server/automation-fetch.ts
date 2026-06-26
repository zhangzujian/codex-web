import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MESSAGE_FOR_VIEW_CHANNEL = "codex_desktop:message-for-view";

type FetchMessage = {
  type: "fetch";
  requestId: string;
  method?: unknown;
  url?: unknown;
  body?: unknown;
};

type DispatchMessage = {
  type: string;
  [key: string]: unknown;
};

type MainToRendererMessage = {
  type: "ipc-main-event";
  channel: string;
  args: unknown[];
};

type AutomationAppServerClient = {
  rpc: (method: string, params: unknown) => Promise<unknown>;
};

type AutomationStatus = "ACTIVE" | "PAUSED" | "DELETED";

type AutomationRecord = {
  id: string;
  kind: string;
  name: string;
  prompt: string;
  status: AutomationStatus;
  cwds?: string[];
  executionEnvironment?: string | null;
  localEnvironmentConfigPath?: string | null;
  targetThreadId?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  rrule: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

type AutomationInboxItem = {
  id: string;
  automationId: string;
  automationName: string;
  threadId: string;
  title: string;
  status: "ACCEPTED" | "ARCHIVED" | "PENDING_REVIEW";
  createdAt: number;
  readAt: number | null;
  sourceCwd: string | null;
};

type AutomationStore = {
  inboxItems: AutomationInboxItem[];
  items: AutomationRecord[];
};

type AutomationFetchEnvironment = {
  appServerClient?: AutomationAppServerClient;
  createId?: () => string;
  now?: () => Date;
  respond?: (message: MainToRendererMessage) => void;
  storePath?: string;
};

type AutomationRoute =
  | "automation-create"
  | "automation-delete"
  | "automation-run-now"
  | "automation-update"
  | "inbox-items"
  | "list-automations";

type AutomationDispatchRoute =
  | "inbox-automation-run-delete-by-thread"
  | "inbox-automation-runs-mark-all-read"
  | "inbox-item-set-read-state";

export type DynamicToolCallParams = {
  arguments?: unknown;
  tool?: unknown;
  threadId?: unknown;
};

type DynamicToolCallResponse = {
  contentItems: Array<{ type: "inputText"; text: string }>;
  success: boolean;
};

export async function handleAutomationFetchMessage(
  message: unknown,
  environment: AutomationFetchEnvironment = {},
): Promise<boolean> {
  if (!canHandleAutomationFetchMessage(message)) {
    return false;
  }

  try {
    const route = routeFromFetchUrl(message.url)!;
    const params = fetchParams(message.body);
    switch (route) {
      case "list-automations": {
        const store = await readStore(environment.storePath);
        sendFetchResponse(environment, message.requestId, 200, {
          items: store.items.filter((item) => item.status !== "DELETED"),
        });
        return true;
      }
      case "automation-create": {
        const item = createAutomation(params, environment);
        const store = await readStore(environment.storePath);
        store.items.push(item);
        await writeStore(store, environment.storePath);
        sendFetchResponse(environment, message.requestId, 200, { item });
        return true;
      }
      case "automation-update": {
        const store = await readStore(environment.storePath);
        const id = stringParam(params.id, "id");
        const index = store.items.findIndex((item) => item.id === id);
        if (index === -1) {
          throw new Error(`Automation ${id} not found`);
        }
        const status = statusParam(params.status ?? store.items[index]!.status);
        const item = {
          ...store.items[index]!,
          ...automationFields(params),
          id,
          status,
          createdAt: store.items[index]!.createdAt,
          updatedAt: nowIso(environment),
          lastRunAt: store.items[index]!.lastRunAt,
          nextRunAt:
            status === "ACTIVE"
              ? nextRunAt(
                  params.rrule ?? store.items[index]!.rrule,
                  environment,
                )
              : null,
        };
        store.items[index] = item;
        await writeStore(store, environment.storePath);
        sendFetchResponse(environment, message.requestId, 200, { item });
        return true;
      }
      case "automation-delete": {
        const store = await readStore(environment.storePath);
        const id = stringParam(params.id, "id");
        const index = store.items.findIndex((item) => item.id === id);
        if (index === -1) {
          sendFetchResponse(environment, message.requestId, 200, {
            success: false,
            status: "not_found",
            item: null,
          });
          return true;
        }
        const [item] = store.items.splice(index, 1);
        await writeStore(store, environment.storePath);
        sendFetchResponse(environment, message.requestId, 200, {
          success: true,
          status: "deleted",
          item,
        });
        return true;
      }
      case "automation-run-now": {
        const result = await runAutomationById(
          stringParam(params.id, "id"),
          environment,
        );
        sendFetchResponse(environment, message.requestId, 200, result);
        return true;
      }
      case "inbox-items":
        const store = await readStore(environment.storePath);
        sendFetchResponse(environment, message.requestId, 200, {
          items: store.inboxItems.slice().reverse(),
          unreadRunCounts: unreadRunCounts(store.inboxItems),
        });
        return true;
    }
  } catch (error) {
    sendFetchError(environment, message.requestId, errorMessage(error));
    return true;
  }
}

export function canHandleAutomationFetchMessage(
  message: unknown,
): message is FetchMessage {
  return isFetchMessage(message) && routeFromFetchUrl(message.url) != null;
}

export async function handleAutomationDispatchMessage(
  message: unknown,
  environment: AutomationFetchEnvironment = {},
): Promise<boolean> {
  if (!canHandleAutomationDispatchMessage(message)) {
    return false;
  }

  const store = await readStore(environment.storePath);
  switch (message.type) {
    case "inbox-automation-run-delete-by-thread": {
      const threadId = stringParam(message.threadId, "thread id");
      const remainingItems = store.inboxItems.filter(
        (item) => item.threadId !== threadId,
      );
      if (remainingItems.length !== store.inboxItems.length) {
        store.inboxItems = remainingItems;
        await writeStore(store, environment.storePath);
      }
      return true;
    }
    case "inbox-item-set-read-state": {
      const id = stringParam(message.id, "inbox item id");
      const item = store.inboxItems.find((item) => item.id === id);
      if (item != null) {
        item.readAt = message.isRead === true ? nowMs(environment) : null;
        await writeStore(store, environment.storePath);
      }
      return true;
    }
    case "inbox-automation-runs-mark-all-read": {
      const readAt =
        typeof message.readAt === "number"
          ? message.readAt
          : nowMs(environment);
      for (const item of store.inboxItems) {
        if (item.readAt == null && isAutomationRunInboxItem(item)) {
          item.readAt = readAt;
        }
      }
      await writeStore(store, environment.storePath);
      return true;
    }
  }
}

export function canHandleAutomationDispatchMessage(
  message: unknown,
): message is DispatchMessage & { type: AutomationDispatchRoute } {
  return (
    isRecord(message) &&
    typeof message.type === "string" &&
    isAutomationDispatchRoute(message.type)
  );
}

export async function handleAutomationDynamicToolCall(
  params: DynamicToolCallParams,
  environment: AutomationFetchEnvironment = {},
): Promise<DynamicToolCallResponse> {
  if (params.tool !== "automation_update") {
    return dynamicToolError(`Unsupported dynamic tool: ${String(params.tool)}`);
  }
  if (!isRecord(params.arguments)) {
    return dynamicToolError("automation_update received invalid arguments.");
  }

  const args = normalizeAutomationToolArgs(params.arguments, params.threadId);
  const mode = typeof args.mode === "string" ? args.mode : null;
  try {
    switch (mode) {
      case "create": {
        const result = await invokeAutomationRoute(
          "automation-create",
          args,
          environment,
        );
        const item = automationRouteItem(result);
        return dynamicToolResult({ automationId: item.id, mode: "create" });
      }
      case "update": {
        const result = await invokeAutomationRoute(
          "automation-update",
          args,
          environment,
        );
        const item = automationRouteItem(result);
        return dynamicToolResult({ automationId: item.id, mode: "update" });
      }
      case "delete": {
        const result = await invokeAutomationRoute(
          "automation-delete",
          { id: args.id },
          environment,
        );
        const item = isRecord(result.item) ? result.item : null;
        return dynamicToolResult({
          automationId: typeof args.id === "string" ? args.id : "",
          mode: "delete",
          deleteStatus: result.status === "not_found" ? "not_found" : "deleted",
          snapshot:
            item == null
              ? null
              : {
                  kind: item.kind,
                  name: item.name,
                  rrule: item.rrule,
                },
        });
      }
      case "view":
        return dynamicToolResult({
          items: (await readStore(environment.storePath)).items
            .filter((item) => item.status !== "DELETED")
            .map(automationToolViewItem),
        });
      default:
        return dynamicToolError("automation_update received invalid mode.");
    }
  } catch (error) {
    return dynamicToolError(errorMessage(error));
  }
}

export async function runDueAutomations(
  environment: AutomationFetchEnvironment = {},
): Promise<number> {
  const store = await readStore(environment.storePath);
  const now = nowIso(environment);
  let count = 0;
  for (const item of store.items) {
    if (
      item.status === "ACTIVE" &&
      item.nextRunAt != null &&
      item.nextRunAt <= now
    ) {
      await runAutomation(item, environment);
      count += 1;
    }
  }
  return count;
}

export function startAutomationScheduler(
  appServerClient: AutomationAppServerClient,
  intervalMs = 60_000,
): { dispose: () => void } {
  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }
    running = true;
    runDueAutomations({ appServerClient })
      .catch((error) => {
        console.error("[automation] scheduler failed", error);
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  return {
    dispose() {
      clearInterval(timer);
    },
  };
}

function createAutomation(
  params: Record<string, unknown>,
  environment: AutomationFetchEnvironment,
): AutomationRecord {
  const timestamp = nowIso(environment);
  return {
    id: environment.createId?.() ?? randomUUID(),
    status: "ACTIVE",
    ...automationFields(params),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastRunAt: null,
    nextRunAt: nextRunAt(params.rrule, environment),
  };
}

function automationFields(params: Record<string, unknown>) {
  const kind = stringParam(params.kind, "kind");
  const common = {
    kind,
    name: stringParam(params.name, "name"),
    prompt: stringParam(params.prompt, "prompt"),
    ...(typeof params.model === "string" ? { model: params.model } : {}),
    ...(typeof params.reasoningEffort === "string"
      ? { reasoningEffort: params.reasoningEffort }
      : {}),
    rrule: stringParam(params.rrule, "rrule"),
  };
  if (kind === "heartbeat") {
    return {
      ...common,
      targetThreadId: nullableString(params.targetThreadId),
    };
  }
  return {
    ...common,
    cwds: Array.isArray(params.cwds)
      ? params.cwds.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
    executionEnvironment: nullableString(params.executionEnvironment),
    localEnvironmentConfigPath: nullableString(
      params.localEnvironmentConfigPath,
    ),
  };
}

async function readStore(
  storePath = defaultStorePath(),
): Promise<AutomationStore> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(storePath, "utf8"));
    if (isRecord(parsed) && Array.isArray(parsed.items)) {
      return {
        inboxItems: Array.isArray(parsed.inboxItems)
          ? parsed.inboxItems.filter(isAutomationInboxItem)
          : [],
        items: parsed.items.filter(isAutomationRecord),
      };
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
  return { inboxItems: [], items: [] };
}

async function writeStore(
  store: AutomationStore,
  storePath = defaultStorePath(),
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(
    storePath,
    `${JSON.stringify(
      {
        ...store,
        items: store.items.filter((item) => item.status !== "DELETED"),
      },
      null,
      2,
    )}\n`,
  );
}

function defaultStorePath(): string {
  return path.join(defaultCodexHome(), "automations", "codex-web.json");
}

function defaultCodexHome(): string {
  return process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
}

async function runAutomationById(
  id: string,
  environment: AutomationFetchEnvironment,
): Promise<{ success: true; item: AutomationRecord; threadId: string }> {
  const store = await readStore(environment.storePath);
  const item = store.items.find((item) => item.id === id);
  if (item == null || item.status === "DELETED") {
    throw new Error(`Automation ${id} not found`);
  }
  return runAutomation(item, environment);
}

async function runAutomation(
  item: AutomationRecord,
  environment: AutomationFetchEnvironment,
): Promise<{ success: true; item: AutomationRecord; threadId: string }> {
  const appServerClient = environment.appServerClient;
  if (appServerClient == null) {
    throw new Error("Automation runner is unavailable");
  }

  const cwd = item.kind === "cron" ? (item.cwds?.[0] ?? null) : null;
  const threadResult = await appServerClient.rpc("thread/start", {
    ...(cwd == null ? {} : { cwd }),
    ...(item.model == null ? {} : { model: item.model }),
    threadSource: "automation",
  });
  const threadId = threadIdFromThreadStart(threadResult);
  await appServerClient.rpc("turn/start", {
    threadId,
    input: [
      {
        type: "text",
        text: automationRunPrompt(item),
        text_elements: [],
      },
    ],
    ...(cwd == null ? {} : { cwd }),
    ...(item.model == null ? {} : { model: item.model }),
    ...(item.reasoningEffort == null ? {} : { effort: item.reasoningEffort }),
  });

  const store = await readStore(environment.storePath);
  const index = store.items.findIndex((storeItem) => storeItem.id === item.id);
  if (index === -1) {
    throw new Error(`Automation ${item.id} not found`);
  }
  const ranAt = nowIso(environment);
  const updated = {
    ...store.items[index]!,
    lastRunAt: ranAt,
    nextRunAt: nextRunAt(store.items[index]!.rrule, environment),
    updatedAt: ranAt,
  };
  store.items[index] = updated;
  store.inboxItems.push({
    id: `${item.id}:${threadId}`,
    automationId: item.id,
    automationName: item.name,
    threadId,
    title: item.name,
    status: "ACCEPTED",
    createdAt: Date.parse(ranAt),
    readAt: null,
    sourceCwd: cwd,
  });
  await writeStore(store, environment.storePath);

  return { success: true, item: updated, threadId };
}

function threadIdFromThreadStart(value: unknown): string {
  if (
    isRecord(value) &&
    isRecord(value.thread) &&
    typeof value.thread.id === "string"
  ) {
    return value.thread.id;
  }
  throw new Error("thread/start did not return a thread id");
}

function automationRunPrompt(item: AutomationRecord): string {
  return [
    `Automation: ${item.name}`,
    `Automation ID: ${item.id}`,
    `Automation memory: ${path.join(
      defaultCodexHome(),
      "automations",
      item.id,
      "memory.md",
    )}`,
    `Last run: ${item.lastRunAt ?? "never"}`,
    "",
    item.prompt,
  ].join("\n");
}

function nextRunAt(
  rrule: unknown,
  environment: AutomationFetchEnvironment,
): string | null {
  const intervalMs = rruleIntervalMs(rrule);
  if (intervalMs == null) {
    return null;
  }
  return new Date(
    (environment.now?.() ?? new Date()).getTime() + intervalMs,
  ).toISOString();
}

function rruleIntervalMs(rrule: unknown): number | null {
  if (typeof rrule !== "string") {
    return null;
  }
  const fields = new Map(
    rrule
      .split(";")
      .map((part) => part.split("=", 2))
      .filter((part): part is [string, string] => part.length === 2),
  );
  const interval = Math.max(1, Number(fields.get("INTERVAL") ?? 1));
  if (!Number.isFinite(interval)) {
    return null;
  }
  // ponytail: only fixed-interval RRULEs; add full RRULE expansion if UI needs BYDAY/BYMONTH precision.
  switch (fields.get("FREQ")) {
    case "MINUTELY":
      return interval * 60_000;
    case "HOURLY":
      return interval * 60 * 60_000;
    case "DAILY":
      return interval * 24 * 60 * 60_000;
    case "WEEKLY":
      return interval * 7 * 24 * 60 * 60_000;
    case "MONTHLY":
      return interval * 30 * 24 * 60 * 60_000;
    default:
      return null;
  }
}

async function invokeAutomationRoute(
  route: AutomationRoute,
  params: Record<string, unknown>,
  environment: AutomationFetchEnvironment,
): Promise<Record<string, unknown>> {
  let error: string | null = null;
  let response: Record<string, unknown> | null = null;
  await handleAutomationFetchMessage(
    {
      type: "fetch",
      requestId: "dynamic-tool",
      method: "POST",
      url: `vscode://codex/${route}`,
      body: JSON.stringify(params),
    },
    {
      ...environment,
      respond(message) {
        const payload = message.args[0];
        if (
          isRecord(payload) &&
          payload.responseType === "success" &&
          typeof payload.bodyJsonString === "string"
        ) {
          const parsed: unknown = JSON.parse(payload.bodyJsonString);
          response = isRecord(parsed) ? parsed : {};
          return;
        }
        if (
          isRecord(payload) &&
          payload.responseType === "error" &&
          typeof payload.error === "string"
        ) {
          error = payload.error;
        }
      },
    },
  );
  if (error != null) {
    throw new Error(error);
  }
  if (response == null) {
    throw new Error(`Automation route ${route} did not return a response`);
  }
  return response;
}

function automationRouteItem(
  response: Record<string, unknown>,
): AutomationRecord {
  if (isAutomationRecord(response.item)) {
    return response.item;
  }
  throw new Error("Automation route did not return an automation item");
}

function automationToolViewItem(
  item: AutomationRecord,
): Record<string, unknown> {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    status: item.status,
    rrule: item.rrule,
    ...(item.kind === "cron" ? { cwds: item.cwds ?? [] } : {}),
    ...(item.kind === "heartbeat"
      ? { targetThreadId: item.targetThreadId ?? null }
      : {}),
  };
}

function normalizeAutomationToolArgs(
  args: Record<string, unknown>,
  threadId: unknown,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...args };
  if (typeof normalized.cwds === "string") {
    normalized.cwds = [normalized.cwds];
  }
  if (typeof normalized.rrule === "string") {
    normalized.rrule = normalizeRrule(normalized.rrule);
  }
  if (normalized.mode === "create" && normalized.kind == null) {
    normalized.kind = "cron";
  }
  if (normalized.mode === "create" || normalized.mode === "update") {
    if (normalized.status == null) {
      normalized.status = "ACTIVE";
    }
    if (normalized.model === "") {
      delete normalized.model;
    }
    if (normalized.reasoningEffort === "") {
      delete normalized.reasoningEffort;
    }
  }
  if (normalized.kind === "cron") {
    if (normalized.cwds == null) {
      normalized.cwds = [];
    }
    if (
      normalized.executionEnvironment == null ||
      normalized.executionEnvironment === "" ||
      normalized.executionEnvironment === "local"
    ) {
      normalized.executionEnvironment = "worktree";
    }
    if (
      normalized.localEnvironmentConfigPath === undefined ||
      normalized.localEnvironmentConfigPath === ""
    ) {
      normalized.localEnvironmentConfigPath = null;
    }
    delete normalized.destination;
    delete normalized.targetThreadId;
  }
  if (
    normalized.kind === "heartbeat" &&
    normalized.destination === "thread" &&
    normalized.targetThreadId == null &&
    typeof threadId === "string"
  ) {
    normalized.targetThreadId = threadId;
  }
  return normalized;
}

function normalizeRrule(rrule: string): string {
  const rruleLine = rrule
    .split(/\r?\n/)
    .find((line) => line.startsWith("RRULE:"));
  const normalized = rruleLine ?? rrule;
  return normalized.startsWith("RRULE:") ? normalized.slice(6) : normalized;
}

function dynamicToolResult(body: unknown): DynamicToolCallResponse {
  return {
    contentItems: [{ type: "inputText", text: JSON.stringify(body) }],
    success: true,
  };
}

function dynamicToolError(message: string): DynamicToolCallResponse {
  return {
    contentItems: [{ type: "inputText", text: message }],
    success: false,
  };
}

function fetchParams(body: unknown): Record<string, unknown> {
  if (typeof body !== "string") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) {
      return {};
    }
    return isRecord(parsed.params) ? parsed.params : parsed;
  } catch {
    return {};
  }
}

function routeFromFetchUrl(value: unknown): AutomationRoute | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "vscode:" || url.hostname !== "codex") {
      return null;
    }
    const route = url.pathname.slice(1);
    return isAutomationRoute(route) ? route : null;
  } catch {
    return null;
  }
}

function isAutomationRoute(value: string): value is AutomationRoute {
  return (
    value === "automation-create" ||
    value === "automation-delete" ||
    value === "automation-run-now" ||
    value === "automation-update" ||
    value === "inbox-items" ||
    value === "list-automations"
  );
}

function isAutomationDispatchRoute(
  value: string,
): value is AutomationDispatchRoute {
  return (
    value === "inbox-automation-run-delete-by-thread" ||
    value === "inbox-automation-runs-mark-all-read" ||
    value === "inbox-item-set-read-state"
  );
}

function statusParam(value: unknown): AutomationStatus {
  if (value === "ACTIVE" || value === "PAUSED" || value === "DELETED") {
    return value;
  }
  throw new Error("Invalid automation status");
}

function stringParam(value: unknown, name: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`Missing automation ${name}`);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nowIso({ now }: AutomationFetchEnvironment): string {
  return (now?.() ?? new Date()).toISOString();
}

function nowMs(environment: AutomationFetchEnvironment): number {
  return (environment.now?.() ?? new Date()).getTime();
}

function unreadRunCounts(items: AutomationInboxItem[]): {
  total: number;
  automationIds: string[];
  unreadRuns: Array<{ automationId: string; threadId: string }>;
} {
  const automationIds = new Set<string>();
  const unreadRuns: Array<{ automationId: string; threadId: string }> = [];
  let total = 0;
  for (const item of items) {
    if (item.readAt != null || !isAutomationRunInboxItem(item)) {
      continue;
    }
    total += 1;
    automationIds.add(item.automationId);
    unreadRuns.push({ automationId: item.automationId, threadId: item.threadId });
  }
  return { total, automationIds: [...automationIds], unreadRuns };
}

function isAutomationRunInboxItem(item: AutomationInboxItem): boolean {
  return (
    item.status === "ACCEPTED" ||
    item.status === "ARCHIVED" ||
    item.status === "PENDING_REVIEW"
  );
}

function isFetchMessage(value: unknown): value is FetchMessage {
  return (
    isRecord(value) &&
    value.type === "fetch" &&
    typeof value.requestId === "string"
  );
}

function isAutomationRecord(value: unknown): value is AutomationRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.name === "string" &&
    typeof value.prompt === "string" &&
    (value.status === "ACTIVE" ||
      value.status === "PAUSED" ||
      value.status === "DELETED") &&
    typeof value.rrule === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isAutomationInboxItem(value: unknown): value is AutomationInboxItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.automationId === "string" &&
    typeof value.automationName === "string" &&
    typeof value.threadId === "string" &&
    typeof value.title === "string" &&
    (value.status === "ACCEPTED" ||
      value.status === "ARCHIVED" ||
      value.status === "PENDING_REVIEW") &&
    typeof value.createdAt === "number" &&
    (typeof value.readAt === "number" || value.readAt === null) &&
    (typeof value.sourceCwd === "string" || value.sourceCwd === null)
  );
}

function sendFetchResponse(
  { respond }: AutomationFetchEnvironment,
  requestId: string,
  status: number,
  body: unknown,
): void {
  respond?.({
    type: "ipc-main-event",
    channel: MESSAGE_FOR_VIEW_CHANNEL,
    args: [
      {
        type: "fetch-response",
        requestId,
        responseType: "success",
        status,
        headers: {},
        bodyJsonString: JSON.stringify(body),
      },
    ],
  });
}

function sendFetchError(
  { respond }: AutomationFetchEnvironment,
  requestId: string,
  error: string,
): void {
  respond?.({
    type: "ipc-main-event",
    channel: MESSAGE_FOR_VIEW_CHANNEL,
    args: [
      {
        type: "fetch-response",
        requestId,
        responseType: "error",
        status: 500,
        error,
      },
    ],
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
