"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAutomationFetchMessage = handleAutomationFetchMessage;
exports.canHandleAutomationFetchMessage = canHandleAutomationFetchMessage;
exports.handleAutomationDispatchMessage = handleAutomationDispatchMessage;
exports.canHandleAutomationDispatchMessage = canHandleAutomationDispatchMessage;
exports.handleAutomationDynamicToolCall = handleAutomationDynamicToolCall;
exports.runDueAutomations = runDueAutomations;
exports.startAutomationScheduler = startAutomationScheduler;
const node_crypto_1 = require("node:crypto");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const MESSAGE_FOR_VIEW_CHANNEL = "codex_desktop:message-for-view";
async function handleAutomationFetchMessage(message, environment = {}) {
    if (!canHandleAutomationFetchMessage(message)) {
        return false;
    }
    try {
        const route = routeFromFetchUrl(message.url);
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
                const status = statusParam(params.status ?? store.items[index].status);
                const item = {
                    ...store.items[index],
                    ...automationFields(params),
                    id,
                    status,
                    createdAt: store.items[index].createdAt,
                    updatedAt: nowIso(environment),
                    lastRunAt: store.items[index].lastRunAt,
                    nextRunAt: status === "ACTIVE"
                        ? nextRunAt(params.rrule ?? store.items[index].rrule, environment)
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
                const result = await runAutomationById(stringParam(params.id, "id"), environment);
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
    }
    catch (error) {
        sendFetchError(environment, message.requestId, errorMessage(error));
        return true;
    }
}
function canHandleAutomationFetchMessage(message) {
    return isFetchMessage(message) && routeFromFetchUrl(message.url) != null;
}
async function handleAutomationDispatchMessage(message, environment = {}) {
    if (!canHandleAutomationDispatchMessage(message)) {
        return false;
    }
    const store = await readStore(environment.storePath);
    switch (message.type) {
        case "inbox-automation-run-delete-by-thread": {
            const threadId = stringParam(message.threadId, "thread id");
            const remainingItems = store.inboxItems.filter((item) => item.threadId !== threadId);
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
            const readAt = typeof message.readAt === "number"
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
function canHandleAutomationDispatchMessage(message) {
    return (isRecord(message) &&
        typeof message.type === "string" &&
        isAutomationDispatchRoute(message.type));
}
async function handleAutomationDynamicToolCall(params, environment = {}) {
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
                const result = await invokeAutomationRoute("automation-create", args, environment);
                const item = automationRouteItem(result);
                return dynamicToolResult({ automationId: item.id, mode: "create" });
            }
            case "update": {
                const result = await invokeAutomationRoute("automation-update", args, environment);
                const item = automationRouteItem(result);
                return dynamicToolResult({ automationId: item.id, mode: "update" });
            }
            case "delete": {
                const result = await invokeAutomationRoute("automation-delete", { id: args.id }, environment);
                const item = isRecord(result.item) ? result.item : null;
                return dynamicToolResult({
                    automationId: typeof args.id === "string" ? args.id : "",
                    mode: "delete",
                    deleteStatus: result.status === "not_found" ? "not_found" : "deleted",
                    snapshot: item == null
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
    }
    catch (error) {
        return dynamicToolError(errorMessage(error));
    }
}
async function runDueAutomations(environment = {}) {
    const store = await readStore(environment.storePath);
    const now = nowIso(environment);
    let count = 0;
    for (const item of store.items) {
        if (item.status === "ACTIVE" &&
            item.nextRunAt != null &&
            item.nextRunAt <= now) {
            await runAutomation(item, environment);
            count += 1;
        }
    }
    return count;
}
function startAutomationScheduler(appServerClient, intervalMs = 60_000) {
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
function createAutomation(params, environment) {
    const timestamp = nowIso(environment);
    return {
        id: environment.createId?.() ?? (0, node_crypto_1.randomUUID)(),
        status: "ACTIVE",
        ...automationFields(params),
        createdAt: timestamp,
        updatedAt: timestamp,
        lastRunAt: null,
        nextRunAt: nextRunAt(params.rrule, environment),
    };
}
function automationFields(params) {
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
            ? params.cwds.filter((value) => typeof value === "string")
            : [],
        executionEnvironment: nullableString(params.executionEnvironment),
        localEnvironmentConfigPath: nullableString(params.localEnvironmentConfigPath),
    };
}
async function readStore(storePath = defaultStorePath()) {
    try {
        const parsed = JSON.parse(await promises_1.default.readFile(storePath, "utf8"));
        if (isRecord(parsed) && Array.isArray(parsed.items)) {
            return {
                inboxItems: Array.isArray(parsed.inboxItems)
                    ? parsed.inboxItems.filter(isAutomationInboxItem)
                    : [],
                items: parsed.items.filter(isAutomationRecord),
            };
        }
    }
    catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") {
            throw error;
        }
    }
    return { inboxItems: [], items: [] };
}
async function writeStore(store, storePath = defaultStorePath()) {
    await promises_1.default.mkdir(node_path_1.default.dirname(storePath), { recursive: true });
    await promises_1.default.writeFile(storePath, `${JSON.stringify({
        ...store,
        items: store.items.filter((item) => item.status !== "DELETED"),
    }, null, 2)}\n`);
}
function defaultStorePath() {
    return node_path_1.default.join(defaultCodexHome(), "automations", "codex-web.json");
}
function defaultCodexHome() {
    return process.env.CODEX_HOME ?? node_path_1.default.join(node_os_1.default.homedir(), ".codex");
}
async function runAutomationById(id, environment) {
    const store = await readStore(environment.storePath);
    const item = store.items.find((item) => item.id === id);
    if (item == null || item.status === "DELETED") {
        throw new Error(`Automation ${id} not found`);
    }
    return runAutomation(item, environment);
}
async function runAutomation(item, environment) {
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
        ...store.items[index],
        lastRunAt: ranAt,
        nextRunAt: nextRunAt(store.items[index].rrule, environment),
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
function threadIdFromThreadStart(value) {
    if (isRecord(value) &&
        isRecord(value.thread) &&
        typeof value.thread.id === "string") {
        return value.thread.id;
    }
    throw new Error("thread/start did not return a thread id");
}
function automationRunPrompt(item) {
    return [
        `Automation: ${item.name}`,
        `Automation ID: ${item.id}`,
        `Automation memory: ${node_path_1.default.join(defaultCodexHome(), "automations", item.id, "memory.md")}`,
        `Last run: ${item.lastRunAt ?? "never"}`,
        "",
        item.prompt,
    ].join("\n");
}
function nextRunAt(rrule, environment) {
    const intervalMs = rruleIntervalMs(rrule);
    if (intervalMs == null) {
        return null;
    }
    return new Date((environment.now?.() ?? new Date()).getTime() + intervalMs).toISOString();
}
function rruleIntervalMs(rrule) {
    if (typeof rrule !== "string") {
        return null;
    }
    const fields = new Map(rrule
        .split(";")
        .map((part) => part.split("=", 2))
        .filter((part) => part.length === 2));
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
async function invokeAutomationRoute(route, params, environment) {
    let error = null;
    let response = null;
    await handleAutomationFetchMessage({
        type: "fetch",
        requestId: "dynamic-tool",
        method: "POST",
        url: `vscode://codex/${route}`,
        body: JSON.stringify(params),
    }, {
        ...environment,
        respond(message) {
            const payload = message.args[0];
            if (isRecord(payload) &&
                payload.responseType === "success" &&
                typeof payload.bodyJsonString === "string") {
                const parsed = JSON.parse(payload.bodyJsonString);
                response = isRecord(parsed) ? parsed : {};
                return;
            }
            if (isRecord(payload) &&
                payload.responseType === "error" &&
                typeof payload.error === "string") {
                error = payload.error;
            }
        },
    });
    if (error != null) {
        throw new Error(error);
    }
    if (response == null) {
        throw new Error(`Automation route ${route} did not return a response`);
    }
    return response;
}
function automationRouteItem(response) {
    if (isAutomationRecord(response.item)) {
        return response.item;
    }
    throw new Error("Automation route did not return an automation item");
}
function automationToolViewItem(item) {
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
function normalizeAutomationToolArgs(args, threadId) {
    const normalized = { ...args };
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
        if (normalized.executionEnvironment == null ||
            normalized.executionEnvironment === "" ||
            normalized.executionEnvironment === "local") {
            normalized.executionEnvironment = "worktree";
        }
        if (normalized.localEnvironmentConfigPath === undefined ||
            normalized.localEnvironmentConfigPath === "") {
            normalized.localEnvironmentConfigPath = null;
        }
        delete normalized.destination;
        delete normalized.targetThreadId;
    }
    if (normalized.kind === "heartbeat" &&
        normalized.destination === "thread" &&
        normalized.targetThreadId == null &&
        typeof threadId === "string") {
        normalized.targetThreadId = threadId;
    }
    return normalized;
}
function normalizeRrule(rrule) {
    const rruleLine = rrule
        .split(/\r?\n/)
        .find((line) => line.startsWith("RRULE:"));
    const normalized = rruleLine ?? rrule;
    return normalized.startsWith("RRULE:") ? normalized.slice(6) : normalized;
}
function dynamicToolResult(body) {
    return {
        contentItems: [{ type: "inputText", text: JSON.stringify(body) }],
        success: true,
    };
}
function dynamicToolError(message) {
    return {
        contentItems: [{ type: "inputText", text: message }],
        success: false,
    };
}
function fetchParams(body) {
    if (typeof body !== "string") {
        return {};
    }
    try {
        const parsed = JSON.parse(body);
        if (!isRecord(parsed)) {
            return {};
        }
        return isRecord(parsed.params) ? parsed.params : parsed;
    }
    catch {
        return {};
    }
}
function routeFromFetchUrl(value) {
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
    }
    catch {
        return null;
    }
}
function isAutomationRoute(value) {
    return (value === "automation-create" ||
        value === "automation-delete" ||
        value === "automation-run-now" ||
        value === "automation-update" ||
        value === "inbox-items" ||
        value === "list-automations");
}
function isAutomationDispatchRoute(value) {
    return (value === "inbox-automation-run-delete-by-thread" ||
        value === "inbox-automation-runs-mark-all-read" ||
        value === "inbox-item-set-read-state");
}
function statusParam(value) {
    if (value === "ACTIVE" || value === "PAUSED" || value === "DELETED") {
        return value;
    }
    throw new Error("Invalid automation status");
}
function stringParam(value, name) {
    if (typeof value === "string" && value.length > 0) {
        return value;
    }
    throw new Error(`Missing automation ${name}`);
}
function nullableString(value) {
    return typeof value === "string" ? value : null;
}
function nowIso({ now }) {
    return (now?.() ?? new Date()).toISOString();
}
function nowMs(environment) {
    return (environment.now?.() ?? new Date()).getTime();
}
function unreadRunCounts(items) {
    const automationIds = new Set();
    let total = 0;
    for (const item of items) {
        if (item.readAt != null || !isAutomationRunInboxItem(item)) {
            continue;
        }
        total += 1;
        automationIds.add(item.automationId);
    }
    return { total, automationIds: [...automationIds] };
}
function isAutomationRunInboxItem(item) {
    return (item.status === "ACCEPTED" ||
        item.status === "ARCHIVED" ||
        item.status === "PENDING_REVIEW");
}
function isFetchMessage(value) {
    return (isRecord(value) &&
        value.type === "fetch" &&
        typeof value.requestId === "string");
}
function isAutomationRecord(value) {
    return (isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.kind === "string" &&
        typeof value.name === "string" &&
        typeof value.prompt === "string" &&
        (value.status === "ACTIVE" ||
            value.status === "PAUSED" ||
            value.status === "DELETED") &&
        typeof value.rrule === "string" &&
        typeof value.createdAt === "string" &&
        typeof value.updatedAt === "string");
}
function isAutomationInboxItem(value) {
    return (isRecord(value) &&
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
        (typeof value.sourceCwd === "string" || value.sourceCwd === null));
}
function sendFetchResponse({ respond }, requestId, status, body) {
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
function sendFetchError({ respond }, requestId, error) {
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
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isNodeError(error) {
    return error instanceof Error && "code" in error;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=automation-fetch.js.map