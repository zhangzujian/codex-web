"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dialog = exports.crashReporter = exports.webContents = exports.WebContentsView = exports.utilityProcess = exports.Tray = exports.session = exports.screen = exports.protocol = exports.powerMonitor = exports.Notification = exports.nativeTheme = exports.nativeImage = exports.net = exports.MessageChannelMain = exports.MenuItem = exports.Menu = exports.ipcMain = exports.BrowserWindow = exports.autoUpdater = exports.app = void 0;
const remote_default_config_1 = require("../remote-default-config");
function getIpcMainBridgeState() {
    const globals = globalThis;
    if (!globals.__codexElectronIpcBridge) {
        globals.__codexElectronIpcBridge = {};
    }
    return globals.__codexElectronIpcBridge;
}
function log(method, args) {
    if (process.env.CODEX_WEB_ELECTRON_STUB_DEBUG) {
        process.stderr.write(`[electron-main-stub] ${method} ${args.length}\n`);
    }
}
function createDeepStub(pathLabel) {
    const fn = (...args) => {
        log(`${pathLabel}()`, args);
        return undefined;
    };
    return new Proxy(fn, {
        apply(_target, _thisArg, argArray) {
            log(`${pathLabel}()`, argArray);
            return undefined;
        },
        construct(_target, argArray) {
            log(`new ${pathLabel}()`, argArray);
            return {};
        },
        get(_target, prop) {
            if (prop === "then") {
                return undefined;
            }
            if (prop === Symbol.toPrimitive) {
                return () => pathLabel;
            }
            return createDeepStub(`${pathLabel}.${String(prop)}`);
        },
    });
}
function createEmitterStub(label) {
    const listeners = new Map();
    const api = {
        on(event, listener) {
            log(`${label}.on`, [event, listener]);
            const eventListeners = listeners.get(event) ?? new Set();
            eventListeners.add(listener);
            listeners.set(event, eventListeners);
            return api;
        },
        once(event, listener) {
            log(`${label}.once`, [event, listener]);
            const wrapped = (...args) => {
                api.removeListener(event, wrapped);
                listener(...args);
            };
            return api.on(event, wrapped);
        },
        addListener(event, listener) {
            log(`${label}.addListener`, [event, listener]);
            return api.on(event, listener);
        },
        removeListener(event, listener) {
            log(`${label}.removeListener`, [event, listener]);
            listeners.get(event)?.delete(listener);
            return api;
        },
        off(event, listener) {
            log(`${label}.off`, [event, listener]);
            return api.removeListener(event, listener);
        },
        emit(event, ...args) {
            log(`${label}.emit`, [event, ...args]);
            for (const listener of listeners.get(event) ?? []) {
                listener(...args);
            }
            return true;
        },
    };
    return api;
}
function createMessagePortStub(label) {
    const emitter = createEmitterStub(label);
    return {
        on: emitter.on,
        postMessage(...args) {
            log(`${label}.postMessage`, args);
        },
        start() {
            log(`${label}.start`, []);
        },
    };
}
function extractVirtualPortIds(transfer) {
    return (transfer
        ?.map((port) => typeof port === "object" &&
        port !== null &&
        "__codexVirtualPortId" in port &&
        typeof port.__codexVirtualPortId === "string"
        ? port.__codexVirtualPortId
        : null)
        .filter((portId) => portId !== null) ?? []);
}
const GENERATED_PROJECTLESS_CWD_PATTERN = /^(.*(?:^|[\\/])Documents[\\/]+Codex)[\\/]+(?:\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*|\d{4}-\d{2}-\d{2}[\\/]+[a-z0-9][a-z0-9-]*)[\\/]*$/;
const mcpRequests = new Map();
const proxiedMcpHosts = new Map();
const fetchRequests = new Map();
const remoteProjectState = {
    workspaceRoots: [],
    workspaceLabels: {},
    remoteProjects: [],
    localProjects: {},
    writableRoots: {},
    threadPaths: new Map(),
    projectlessThreadIds: new Set(),
};
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function remoteDefaultSharedObjectValue(key, value) {
    if (key === "host_config") {
        return (0, remote_default_config_1.remoteDefaultHostConfig)();
    }
    if (key === "remote_connections" || key === "remote_ssh_connections") {
        return [(0, remote_default_config_1.remoteDefaultConnection)()];
    }
    if (key === "remote_wsl_connections") {
        return [];
    }
    if (key === "local_remote_control_client_id") {
        return null;
    }
    if (key === "statsig_default_enable_features") {
        return {
            ...(isRecord(value) ? value : {}),
            remote_connections: true,
            remote_ssh_connections: true,
        };
    }
    return value;
}
function mcpRequestKey(hostId, id) {
    if (typeof hostId !== "string") {
        return null;
    }
    if (typeof id !== "string" && typeof id !== "number") {
        return null;
    }
    return `${hostId}\0${String(id)}`;
}
function recordRendererMcpRequest(channel, args) {
    if (channel !== "codex_desktop:message-from-view") {
        return;
    }
    const message = args[0];
    if (!isRecord(message) ||
        message.type !== "mcp-request" ||
        typeof message.hostId !== "string" ||
        !isRecord(message.request) ||
        typeof message.request.method !== "string") {
        return;
    }
    const key = mcpRequestKey(message.hostId, message.request.id);
    if (key == null) {
        return;
    }
    mcpRequests.set(key, {
        hostId: proxiedMcpHosts.get(key) ?? message.hostId,
        method: message.request.method,
        params: message.request.params,
    });
}
function recordRendererFetchRequest(channel, args) {
    if (channel !== "codex_desktop:message-from-view") {
        return;
    }
    const message = args[0];
    if (!isRecord(message) ||
        message.type !== "fetch" ||
        typeof message.requestId !== "string" ||
        typeof message.url !== "string") {
        return;
    }
    const route = fetchRoute(message.url);
    if (route == null) {
        return;
    }
    const body = parseFetchBody(message.body);
    fetchRequests.set(message.requestId, {
        route,
        method: isRecord(body) && typeof body.method === "string"
            ? body.method
            : null,
        params: fetchRequestParams(route, body),
    });
}
function fetchRequestParams(route, body) {
    if (!isRecord(body)) {
        return undefined;
    }
    if (route === "send-cli-request-for-host" || route === "ipc-request") {
        return body.params;
    }
    return "params" in body ? body.params : body;
}
function normalizeRendererToMainIpcArgs(channel, args) {
    if (args.length === 0 ||
        (channel !== "codex_desktop:message-from-view" &&
            !isWorkerFromViewChannel(channel))) {
        return args;
    }
    return [normalizeRendererToMainIpcMessage(args[0]), ...args.slice(1)];
}
function isWorkerFromViewChannel(channel) {
    return /^codex_desktop:worker:[^:]+:from-view$/.test(channel);
}
function normalizeRendererToMainIpcMessage(message) {
    if (!isRecord(message)) {
        return message;
    }
    if (message.type === "worker-request") {
        const localized = localizeRemoteDefaultMainPayload(message);
        return localized;
    }
    if (message.type === "mcp-request" &&
        message.hostId === remote_default_config_1.REMOTE_DEFAULT_HOST_ID &&
        isRecord(message.request)) {
        const key = mcpRequestKey("local", message.request.id);
        if (key != null) {
            proxiedMcpHosts.set(key, remote_default_config_1.REMOTE_DEFAULT_HOST_ID);
        }
        return {
            ...message,
            hostId: "local",
            request: {
                ...message.request,
                params: localizeRemoteDefaultHostParam(message.request.params),
            },
        };
    }
    if (message.type === "fetch" &&
        typeof message.url === "string" &&
        fetchRoute(message.url) != null) {
        const route = fetchRoute(message.url);
        const body = parseFetchBody(message.body);
        const localizedBody = localizeRemoteDefaultFetchBody(route, body);
        if (localizedBody !== body) {
            return {
                ...message,
                body: JSON.stringify(localizedBody),
            };
        }
    }
    return message;
}
function localizeRemoteDefaultMainPayload(value) {
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const localized = localizeRemoteDefaultMainPayload(item);
            changed ||= localized !== item;
            return localized;
        });
        return changed ? next : value;
    }
    if (!isRecord(value)) {
        return value;
    }
    if (value.id === remote_default_config_1.REMOTE_DEFAULT_HOST_ID && value.kind === "ssh") {
        return localHostConfig();
    }
    let changed = false;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
        if (key === "hostId" && item === remote_default_config_1.REMOTE_DEFAULT_HOST_ID) {
            changed = true;
            next[key] = "local";
            continue;
        }
        const localized = localizeRemoteDefaultMainPayload(item);
        changed ||= localized !== item;
        next[key] = localized;
    }
    return changed ? next : value;
}
function localHostConfig() {
    return { id: "local", display_name: "Local", kind: "local" };
}
function localizeRemoteDefaultFetchBody(route, body) {
    if (!isRecord(body)) {
        return body;
    }
    let changed = false;
    const next = { ...body };
    if (next.hostId === remote_default_config_1.REMOTE_DEFAULT_HOST_ID) {
        next.hostId = "local";
        changed = true;
    }
    const params = localizeRemoteDefaultHostParam(next.params);
    if (params !== next.params) {
        next.params = params;
        changed = true;
    }
    const localized = route === "start-conversation"
        ? localizeRemoteDefaultMainPayload(next)
        : next;
    return changed || localized !== next ? localized : body;
}
function localizeRemoteDefaultHostParam(params) {
    if (!isRecord(params) || params.hostId !== remote_default_config_1.REMOTE_DEFAULT_HOST_ID) {
        return params;
    }
    return { ...params, hostId: "local" };
}
function recordRendererRequest(channel, args) {
    recordRendererMcpRequest(channel, args);
    recordRendererFetchRequest(channel, args);
}
function fetchRoute(value) {
    try {
        const url = new URL(value);
        return url.protocol === "vscode:" && url.hostname === "codex"
            ? url.pathname.slice(1)
            : null;
    }
    catch {
        return null;
    }
}
function parseFetchBody(body) {
    if (typeof body !== "string") {
        return body;
    }
    try {
        return JSON.parse(body);
    }
    catch {
        return null;
    }
}
function normalizeRemoteDefaultMcpResponse(message) {
    if (!isRecord(message.message)) {
        return message;
    }
    const key = mcpRequestKey(message.hostId, message.message.id);
    if (key == null) {
        return message;
    }
    const proxiedHostId = proxiedMcpHosts.get(key);
    proxiedMcpHosts.delete(key);
    const request = mcpRequests.get(key);
    if (request == null || !("result" in message.message)) {
        return proxiedHostId == null ? message : { ...message, hostId: proxiedHostId };
    }
    mcpRequests.delete(key);
    const result = normalizeRemoteDefaultMcpResult(request, message.message.result);
    return {
        ...message,
        hostId: proxiedHostId ??
            (message.hostId === "local" && containsThreadResult(result)
                ? remote_default_config_1.REMOTE_DEFAULT_HOST_ID
                : message.hostId),
        message: {
            ...message.message,
            result,
        },
    };
}
function normalizeRemoteDefaultFetchResponse(message) {
    const request = typeof message.requestId === "string"
        ? fetchRequests.get(message.requestId)
        : undefined;
    if (typeof message.requestId === "string") {
        fetchRequests.delete(message.requestId);
    }
    if (message.responseType !== "success" ||
        typeof message.bodyJsonString !== "string") {
        return message;
    }
    try {
        const body = JSON.parse(message.bodyJsonString);
        const normalizedBody = request == null
            ? normalizeRemoteDefaultPayload(body)
            : normalizeRemoteDefaultFetchResult(request, body);
        return normalizedBody === body
            ? message
            : { ...message, bodyJsonString: JSON.stringify(normalizedBody) };
    }
    catch {
        return message;
    }
}
function normalizeRemoteDefaultFetchResult(request, result) {
    if (request.route === "set-global-state") {
        if (!isRecord(result) || result.success !== false) {
            cacheRemoteDefaultGlobalStateWrite(request.params);
        }
        return normalizeRemoteDefaultPayload(result);
    }
    if (request.route === "send-cli-request-for-host" && request.method != null) {
        return normalizeRemoteDefaultMcpResult({ hostId: "local", method: request.method, params: request.params }, result);
    }
    if (request.route === "ipc-request" && request.method != null) {
        return normalizeRemoteDefaultMcpResult({ hostId: "local", method: request.method, params: request.params }, result);
    }
    return normalizeRemoteDefaultMcpResult({ hostId: "local", method: request.route, params: request.params }, result);
}
function normalizeRemoteDefaultPayload(value) {
    if (Array.isArray(value)) {
        let changed = false;
        const next = value.map((item) => {
            const normalized = normalizeRemoteDefaultPayload(item);
            changed ||= normalized !== item;
            return normalized;
        });
        return changed ? next : value;
    }
    if (!isRecord(value)) {
        return value;
    }
    if (looksLikeThread(value)) {
        return normalizeThread(value);
    }
    let changed = false;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
        if (key === "hostId" && item === "local") {
            changed = true;
            next[key] = remote_default_config_1.REMOTE_DEFAULT_HOST_ID;
            continue;
        }
        if (key === "PROJECTLESS_THREAD_IDS" || key === "projectlessThreadIds") {
            for (const threadId of stringArray(item)) {
                remoteProjectState.projectlessThreadIds.add(threadId);
            }
            if (Array.isArray(item) && item.length > 0) {
                changed = true;
                next[key] = [];
            }
            else {
                next[key] = item;
            }
            continue;
        }
        const normalized = normalizeRemoteDefaultPayload(item);
        changed ||= normalized !== item;
        next[key] = normalized;
    }
    if (next.projectKind === "local" &&
        "projectId" in next &&
        !("label" in next) &&
        !("threadKeys" in next)) {
        return normalizeProjectAssignment(next);
    }
    return changed ? next : value;
}
function normalizeRemoteDefaultMcpResult(request, result) {
    if (request.hostId === "local" && request.method === "thread/list") {
        return emptyThreadListResult(result);
    }
    if (request.method === "workspace-root-options" && isRecord(result)) {
        cacheWorkspaceRootOptions(result);
        return { ...result, roots: [], labels: {} };
    }
    if (request.method === "thread/list") {
        return normalizeThreadListResult(result);
    }
    if (request.method === "set-global-state") {
        if (!isRecord(result) || result.success !== false) {
            cacheRemoteDefaultGlobalStateWrite(request.params);
        }
        return normalizeRemoteDefaultPayload(result);
    }
    if (request.method === "get-global-state" && isRecord(result)) {
        const key = isRecord(request.params) ? request.params.key : null;
        if (key === "REMOTE_PROJECTS") {
            return { ...result, value: synthesizeRemoteProjects(result.value) };
        }
        if (key === "LOCAL_PROJECTS") {
            remoteProjectState.localProjects = toRecord(result.value);
            return { ...result, value: {} };
        }
        if (key === "PROJECT_WRITABLE_ROOTS") {
            remoteProjectState.writableRoots = toRecord(result.value);
            return { ...result, value: {} };
        }
        if (key === "PROJECTLESS_THREAD_IDS") {
            for (const threadId of stringArray(result.value)) {
                remoteProjectState.projectlessThreadIds.add(threadId);
            }
            return { ...result, value: [] };
        }
        if (key === "THREAD_PROJECT_ASSIGNMENTS") {
            return {
                ...result,
                value: synthesizeThreadProjectAssignments(result.value),
            };
        }
    }
    return normalizeRemoteDefaultPayload(result);
}
function cacheRemoteDefaultGlobalStateWrite(params) {
    if (!isRecord(params) || params.key !== "REMOTE_PROJECTS") {
        return;
    }
    cacheRemoteDefaultProjectsWrite(params.value);
}
function cacheRemoteDefaultProjectsWrite(value) {
    remoteProjectState.remoteProjects = Array.isArray(value)
        ? value.flatMap((project) => {
            const normalized = normalizeRemoteProject(project);
            return normalized == null ? [] : [normalized];
        })
        : [];
}
function containsThreadResult(result) {
    if (!isRecord(result)) {
        return false;
    }
    return isRecord(result.thread) && looksLikeThread(result.thread);
}
function emptyThreadListResult(result) {
    if (Array.isArray(result)) {
        return [];
    }
    if (!isRecord(result)) {
        return result;
    }
    const next = { ...result };
    for (const key of ["threads", "conversations", "items", "data"]) {
        if (Array.isArray(next[key])) {
            next[key] = [];
        }
    }
    return next;
}
function cacheWorkspaceRootOptions(result) {
    if (Array.isArray(result.roots)) {
        remoteProjectState.workspaceRoots = result.roots.filter((root) => typeof root === "string");
    }
    remoteProjectState.workspaceLabels = toStringRecord(result.labels);
}
function normalizeThreadListResult(result) {
    if (Array.isArray(result)) {
        return result.map(normalizeThread);
    }
    if (!isRecord(result)) {
        return result;
    }
    const next = { ...result };
    for (const key of ["threads", "conversations", "items", "data"]) {
        if (Array.isArray(next[key])) {
            next[key] = next[key].map(normalizeThread);
        }
    }
    return looksLikeThread(result) ? normalizeThread(next) : next;
}
function normalizeThread(thread) {
    if (!isRecord(thread) || !looksLikeThread(thread)) {
        return thread;
    }
    const id = threadId(thread);
    const path = threadPath(thread);
    if (id != null && path != null) {
        remoteProjectState.threadPaths.set(id, path);
    }
    const isProjectless = path === "~" ||
        thread.workspaceKind === "projectless" ||
        (typeof thread.cwd === "string" && isGeneratedProjectlessCwd(thread.cwd));
    if (id != null && isProjectless) {
        remoteProjectState.projectlessThreadIds.add(id);
    }
    return {
        ...thread,
        hostId: remote_default_config_1.REMOTE_DEFAULT_HOST_ID,
        ...(path === "~" || isProjectless ? { workspaceKind: "workspace" } : {}),
    };
}
function looksLikeThread(value) {
    return (threadId(value) != null &&
        ("cwd" in value ||
            "workspaceKind" in value ||
            "title" in value ||
            "updatedAt" in value ||
            "createdAt" in value ||
            "threadRuntimeStatus" in value));
}
function threadId(value) {
    if (typeof value.conversationId === "string") {
        return value.conversationId;
    }
    if (typeof value.id === "string") {
        return value.id;
    }
    return null;
}
function threadPath(value) {
    if (typeof value.cwd === "string" && value.cwd.trim().length > 0) {
        if (isGeneratedProjectlessCwd(value.cwd)) {
            return "~";
        }
        return value.cwd;
    }
    if (value.workspaceKind === "projectless") {
        return "~";
    }
    return "~";
}
function isGeneratedProjectlessCwd(cwd) {
    return GENERATED_PROJECTLESS_CWD_PATTERN.test(cwd.trim());
}
function synthesizeRemoteProjects(existingValue) {
    const projects = new Map();
    for (const project of [
        ...(Array.isArray(existingValue) ? existingValue : []),
        ...remoteProjectState.remoteProjects,
    ]) {
        const normalized = normalizeRemoteProject(project);
        if (normalized != null) {
            projects.set(String(normalized.remotePath), normalized);
        }
    }
    for (const root of remoteProjectState.workspaceRoots) {
        projects.set(root, remoteProject(root));
    }
    for (const [projectId, project] of Object.entries(remoteProjectState.localProjects)) {
        projects.set(projectId, remoteProject(projectId, localProjectName(project)));
    }
    for (const [projectId, roots] of Object.entries(remoteProjectState.writableRoots)) {
        for (const root of stringArray(roots)) {
            projects.set(root, remoteProject(root, localProjectLabel(projectId)));
        }
    }
    for (const path of remoteProjectState.threadPaths.values()) {
        projects.set(path, remoteProject(path));
    }
    projects.set("~", remoteProject("~"));
    return Array.from(projects.values());
}
function normalizeRemoteProject(project) {
    if (!isRecord(project)) {
        return null;
    }
    const path = typeof project.remotePath === "string"
        ? project.remotePath
        : typeof project.path === "string"
            ? project.path
            : typeof project.id === "string"
                ? project.id
                : null;
    if (path == null) {
        return null;
    }
    return {
        ...project,
        id: typeof project.id === "string" ? project.id : path,
        hostId: remote_default_config_1.REMOTE_DEFAULT_HOST_ID,
        path: typeof project.path === "string" ? project.path : path,
        remotePath: path,
    };
}
function synthesizeThreadProjectAssignments(existingValue) {
    const assignments = {};
    if (isRecord(existingValue)) {
        for (const [threadId, assignment] of Object.entries(existingValue)) {
            assignments[threadId] = normalizeProjectAssignment(assignment);
        }
    }
    for (const [threadId, path] of remoteProjectState.threadPaths) {
        assignments[threadId] ??= remoteProjectAssignment(path);
    }
    for (const threadId of remoteProjectState.projectlessThreadIds) {
        assignments[threadId] ??= remoteProjectAssignment("~");
    }
    return assignments;
}
function normalizeProjectAssignment(assignment) {
    if (!isRecord(assignment)) {
        return assignment;
    }
    if (assignment.projectKind === "remote") {
        return { ...assignment, hostId: remote_default_config_1.REMOTE_DEFAULT_HOST_ID };
    }
    const path = typeof assignment.path === "string"
        ? assignment.path
        : typeof assignment.cwd === "string"
            ? assignment.cwd
            : typeof assignment.projectId === "string"
                ? assignment.projectId
                : null;
    return path == null ? assignment : remoteProjectAssignment(path);
}
function remoteProjectAssignment(path) {
    return {
        projectKind: "remote",
        projectId: path,
        hostId: remote_default_config_1.REMOTE_DEFAULT_HOST_ID,
        path,
    };
}
function remoteProject(path, label = localProjectLabel(path)) {
    return {
        id: path,
        hostId: remote_default_config_1.REMOTE_DEFAULT_HOST_ID,
        label,
        path,
        remotePath: path,
    };
}
function localProjectLabel(path) {
    return (remoteProjectState.workspaceLabels[path]?.trim() ||
        localProjectName(remoteProjectState.localProjects[path]) ||
        basename(path) ||
        "Remote");
}
function localProjectName(project) {
    return isRecord(project) && typeof project.name === "string"
        ? project.name.trim()
        : "";
}
function basename(path) {
    const normalized = path.replace(/\/+$/, "");
    if (normalized === "~") {
        return "Remote";
    }
    return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}
function toRecord(value) {
    return isRecord(value) ? value : {};
}
function toStringRecord(value) {
    if (!isRecord(value)) {
        return {};
    }
    return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === "string"));
}
function stringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string")
        : [];
}
function normalizeRendererIpcMessage(channel, message) {
    if (channel !== "codex_desktop:message-for-view" ||
        !isRecord(message) ||
        message.type !== "shared-object-updated" ||
        typeof message.key !== "string") {
        if (channel === "codex_desktop:message-for-view" &&
            isRecord(message) &&
            message.type === "mcp-response") {
            return normalizeRemoteDefaultMcpResponse(message);
        }
        if (channel === "codex_desktop:message-for-view" &&
            isRecord(message) &&
            message.type === "fetch-response") {
            return normalizeRemoteDefaultFetchResponse(message);
        }
        if (channel === "codex_desktop:message-for-view" && isRecord(message)) {
            return normalizeRemoteDefaultPayload(message);
        }
        return message;
    }
    return {
        ...message,
        value: remoteDefaultSharedObjectValue(message.key, message.value),
    };
}
function normalizeRendererIpcArgs(channel, args) {
    if (channel !== "codex_desktop:message-for-view" || args.length === 0) {
        return args;
    }
    return [normalizeRendererIpcMessage(channel, args[0]), ...args.slice(1)];
}
const rendererUrl = "http://localhost:5175/";
const rendererMainFrame = {
    url: rendererUrl,
};
const rendererWebContentsEmitter = createEmitterStub("ipcMainEvent.sender");
const rendererWebContents = {
    id: 1001,
    mainFrame: rendererMainFrame,
    isDestroyed: () => false,
    off: rendererWebContentsEmitter.off,
    on: rendererWebContentsEmitter.on,
    once: rendererWebContentsEmitter.once,
    postMessage: (channel, message, transfer) => {
        const portIds = extractVirtualPortIds(transfer);
        getIpcMainBridgeState().broadcastToRenderer?.({
            type: "ipc-main-event",
            channel,
            args: [normalizeRendererIpcMessage(channel, message)],
            ...(portIds.length > 0 ? { portIds } : {}),
        });
    },
    removeListener: rendererWebContentsEmitter.removeListener,
    send: (channel, ...args) => {
        getIpcMainBridgeState().broadcastToRenderer?.({
            type: "ipc-main-event",
            channel,
            args: normalizeRendererIpcArgs(channel, args),
        });
    },
};
function createIpcMainEvent({ ports = [], sourceUrl: _sourceUrl, } = {}) {
    const event = {
        returnValue: undefined,
        processId: 1,
        frameId: 1,
        ports,
        sender: rendererWebContents,
        senderFrame: rendererMainFrame,
        reply: (channel, ...args) => {
            getIpcMainBridgeState().broadcastToRenderer?.({
                type: "ipc-main-event",
                channel,
                args: normalizeRendererIpcArgs(channel, args),
            });
        },
    };
    return event;
}
function createIpcMainStub() {
    const emitter = createEmitterStub("ipcMain");
    const handlers = new Map();
    const bridgeState = getIpcMainBridgeState();
    bridgeState.handleRendererInvoke = async (channel, args, sourceUrl) => {
        const normalizedArgs = normalizeRendererToMainIpcArgs(channel, args);
        recordRendererRequest(channel, normalizedArgs);
        const handler = handlers.get(channel);
        if (!handler) {
            throw new Error(`[electron-main-stub] No ipcMain.handle for ${channel}`);
        }
        const event = createIpcMainEvent({ sourceUrl });
        return await Promise.resolve(handler(event, ...normalizedArgs));
    };
    bridgeState.handleRendererSend = (channel, args, sourceUrl, ports) => {
        const normalizedArgs = normalizeRendererToMainIpcArgs(channel, args);
        recordRendererRequest(channel, normalizedArgs);
        const event = createIpcMainEvent({ ports, sourceUrl });
        emitter.emit(channel, event, ...normalizedArgs);
    };
    return {
        on: emitter.on,
        off: emitter.off,
        handle(channel, handler) {
            log("ipcMain.handle", [channel, handler]);
            handlers.set(channel, handler);
        },
        removeHandler(channel) {
            log("ipcMain.removeHandler", [channel]);
            handlers.delete(channel);
        },
    };
}
let appReady = false;
let appReadyPromise = null;
const commandLineSwitches = new Map();
const appBase = {
    ...createEmitterStub("app"),
    name: "Codex",
    isPackaged: false,
    getName() {
        log("app.getName", []);
        return "Codex";
    },
    getVersion() {
        log("app.getVersion", []);
        return "26.409.20454";
    },
    getPath(name) {
        log("app.getPath", [name]);
        return process.cwd();
    },
    getAppMetrics() {
        log("app.getAppMetrics", []);
        return [];
    },
    getAppPath() {
        log("app.getAppPath", []);
        return process.cwd();
    },
    async getGPUInfo(infoLevel) {
        log("app.getGPUInfo", [infoLevel]);
        return { gpuDevice: [] };
    },
    setName(name) {
        log("app.setName", [name]);
    },
    setPath(name, value) {
        log("app.setPath", [name, value]);
    },
    setAppUserModelId(value) {
        log("app.setAppUserModelId", [value]);
    },
    requestSingleInstanceLock() {
        log("app.requestSingleInstanceLock", []);
        return true;
    },
    isReady() {
        log("app.isReady", []);
        return appReady;
    },
    whenReady() {
        log("app.whenReady", []);
        if (appReady) {
            return Promise.resolve();
        }
        appReadyPromise ??= new Promise((resolve) => {
            setImmediate(() => {
                appReady = true;
                resolve();
            });
        });
        return appReadyPromise;
    },
    commandLine: {
        appendSwitch(name, value) {
            log("app.commandLine.appendSwitch", [name, value]);
            commandLineSwitches.set(name, value ?? "");
        },
        getSwitchValue(name) {
            log("app.commandLine.getSwitchValue", [name]);
            return commandLineSwitches.get(name) ?? "";
        },
        hasSwitch(name) {
            log("app.commandLine.hasSwitch", [name]);
            return commandLineSwitches.has(name);
        },
        removeSwitch(name) {
            log("app.commandLine.removeSwitch", [name]);
            commandLineSwitches.delete(name);
        },
    },
    on(event, listener) {
        log("app.on", [event, listener]);
        return app;
    },
    once(event, listener) {
        log("app.once", [event, listener]);
        return app;
    },
    quit() {
        log("app.quit", []);
    },
    exit(code) {
        log("app.exit", [code]);
    },
};
const app = new Proxy(appBase, {
    get(target, prop) {
        if (prop in target) {
            return target[prop];
        }
        return createDeepStub(`app.${String(prop)}`);
    },
});
exports.app = app;
class BrowserWindow {
    static nextId = 1;
    static allWindows = [];
    static focusedWindow = null;
    id;
    destroyed = false;
    title = "Codex";
    bounds = { x: 0, y: 0, width: 1280, height: 820 };
    webContents;
    emitter;
    constructor(...args) {
        log("new BrowserWindow", args);
        this.id = BrowserWindow.nextId++;
        this.emitter = createEmitterStub(`BrowserWindow#${this.id}`);
        const webContentsEmitter = createEmitterStub(`BrowserWindow#${this.id}.webContents`);
        this.webContents = new Proxy({
            ...webContentsEmitter,
            id: this.id * 1000 + 1,
            loadURL: async (url) => {
                log(`BrowserWindow#${this.id}.webContents.loadURL`, [url]);
            },
            loadFile: async (...loadFileArgs) => {
                log(`BrowserWindow#${this.id}.webContents.loadFile`, loadFileArgs);
            },
            openDevTools: (...openDevToolsArgs) => {
                log(`BrowserWindow#${this.id}.webContents.openDevTools`, openDevToolsArgs);
            },
            postMessage: (channel, message, transfer) => {
                log(`BrowserWindow#${this.id}.webContents.postMessage`, [
                    channel,
                    message,
                    transfer,
                ]);
                const portIds = extractVirtualPortIds(transfer);
                getIpcMainBridgeState().broadcastToRenderer?.({
                    type: "ipc-main-event",
                    channel,
                    args: [normalizeRendererIpcMessage(channel, message)],
                    ...(portIds.length > 0 ? { portIds } : {}),
                });
            },
            send: (...sendArgs) => {
                log(`BrowserWindow#${this.id}.webContents.send`, sendArgs);
                if (sendArgs.length === 0 || typeof sendArgs[0] !== "string") {
                    return;
                }
                const [channel, ...args] = sendArgs;
                getIpcMainBridgeState().broadcastToRenderer?.({
                    type: "ipc-main-event",
                    channel,
                    args: normalizeRendererIpcArgs(channel, args),
                });
            },
        }, {
            get: (target, prop) => {
                if (prop in target) {
                    return target[prop];
                }
                return createDeepStub(`BrowserWindow#${this.id}.webContents.${String(prop)}`);
            },
        });
        BrowserWindow.allWindows.push(this);
        BrowserWindow.focusedWindow = this;
        return new Proxy(this, {
            get: (target, prop) => {
                if (prop in target) {
                    return target[prop];
                }
                return createDeepStub(`BrowserWindow#${target.id}.${String(prop)}`);
            },
        });
    }
    static getAllWindows() {
        log("BrowserWindow.getAllWindows", []);
        return BrowserWindow.allWindows.filter((window) => !window.destroyed);
    }
    static getFocusedWindow() {
        log("BrowserWindow.getFocusedWindow", []);
        if (BrowserWindow.focusedWindow && !BrowserWindow.focusedWindow.destroyed) {
            return BrowserWindow.focusedWindow;
        }
        return BrowserWindow.getAllWindows()[0] ?? null;
    }
    static fromWebContents(webContents) {
        log("BrowserWindow.fromWebContents", [webContents]);
        return (BrowserWindow.getAllWindows().find((window) => window.webContents === webContents) ?? null);
    }
    on(event, listener) {
        return this.emitter.on(event, listener);
    }
    once(event, listener) {
        return this.emitter.once(event, listener);
    }
    off(event, listener) {
        return this.emitter.off(event, listener);
    }
    removeListener(event, listener) {
        return this.emitter.removeListener(event, listener);
    }
    close() {
        log(`BrowserWindow#${this.id}.close`, []);
        this.emitter.emit("close", {
            preventDefault: () => undefined,
        });
        this.destroy();
    }
    destroy() {
        log(`BrowserWindow#${this.id}.destroy`, []);
        this.destroyed = true;
        if (BrowserWindow.focusedWindow === this) {
            BrowserWindow.focusedWindow = null;
        }
        this.emitter.emit("closed");
    }
    isDestroyed() {
        log(`BrowserWindow#${this.id}.isDestroyed`, []);
        return this.destroyed;
    }
    removeMenu() {
        log(`BrowserWindow#${this.id}.removeMenu`, []);
    }
    getTitle() {
        log(`BrowserWindow#${this.id}.getTitle`, []);
        return this.title;
    }
    setTitle(nextTitle) {
        log(`BrowserWindow#${this.id}.setTitle`, [nextTitle]);
        this.title = nextTitle;
    }
    getBounds() {
        log(`BrowserWindow#${this.id}.getBounds`, []);
        return { ...this.bounds };
    }
    setBounds(nextBounds) {
        log(`BrowserWindow#${this.id}.setBounds`, [nextBounds]);
        this.bounds = {
            x: nextBounds.x ?? this.bounds.x,
            y: nextBounds.y ?? this.bounds.y,
            width: nextBounds.width ?? this.bounds.width,
            height: nextBounds.height ?? this.bounds.height,
        };
    }
    show() {
        log(`BrowserWindow#${this.id}.show`, []);
    }
    hide() {
        log(`BrowserWindow#${this.id}.hide`, []);
    }
    focus() {
        log(`BrowserWindow#${this.id}.focus`, []);
        BrowserWindow.focusedWindow = this;
        this.emitter.emit("focus");
    }
}
exports.BrowserWindow = BrowserWindow;
class WebContentsView {
    constructor(...args) {
        log("new WebContentsView", args);
    }
}
exports.WebContentsView = WebContentsView;
class Menu {
    static applicationMenu = null;
    items = [];
    constructor(items = []) {
        this.items = items;
    }
    static buildFromTemplate(template) {
        log("Menu.buildFromTemplate", [template]);
        const items = template.map((entry) => new MenuItem(entry));
        return new Menu(items);
    }
    static setApplicationMenu(menu) {
        log("Menu.setApplicationMenu", [menu]);
        Menu.applicationMenu = menu;
    }
    static getApplicationMenu() {
        log("Menu.getApplicationMenu", []);
        return Menu.applicationMenu;
    }
    getMenuItemById(id) {
        log("Menu.getMenuItemById", [id]);
        const queue = [...this.items];
        while (queue.length > 0) {
            const candidate = queue.shift();
            if (!candidate) {
                continue;
            }
            if (candidate.id === id) {
                return candidate;
            }
            if (candidate.submenu) {
                queue.push(...candidate.submenu.items);
            }
        }
        return undefined;
    }
    append(item) {
        log("Menu.append", [item]);
        this.items.push(item);
    }
    insert(pos, item) {
        log("Menu.insert", [pos, item]);
        const index = Math.max(0, Math.min(pos, this.items.length));
        this.items.splice(index, 0, item);
    }
    popup(...args) {
        log("Menu.popup", args);
    }
}
exports.Menu = Menu;
class MenuItem {
    checked;
    click;
    enabled;
    id;
    label;
    role;
    submenu;
    type;
    visible;
    constructor(...args) {
        log("new MenuItem", args);
        const [options] = args;
        if (!options || typeof options !== "object") {
            return;
        }
        this.checked =
            typeof options.checked === "boolean" ? options.checked : undefined;
        this.click =
            typeof options.click === "function"
                ? options.click
                : undefined;
        this.enabled =
            typeof options.enabled === "boolean" ? options.enabled : undefined;
        this.id = typeof options.id === "string" ? options.id : undefined;
        this.label = typeof options.label === "string" ? options.label : undefined;
        this.role = typeof options.role === "string" ? options.role : undefined;
        this.type = typeof options.type === "string" ? options.type : undefined;
        this.visible =
            typeof options.visible === "boolean" ? options.visible : undefined;
        const submenu = options.submenu;
        if (Array.isArray(submenu)) {
            this.submenu = Menu.buildFromTemplate(submenu);
            return;
        }
        if (submenu instanceof Menu) {
            this.submenu = submenu;
        }
    }
}
exports.MenuItem = MenuItem;
class Tray {
    constructor(...args) {
        log("new Tray", args);
    }
}
exports.Tray = Tray;
class Notification {
    constructor(...args) {
        log("new Notification", args);
    }
    show() {
        log("Notification.show", []);
    }
}
exports.Notification = Notification;
const dialog = {
    async showMessageBox(...args) {
        log("dialog.showMessageBox", args);
        return { response: 0 };
    },
};
exports.dialog = dialog;
const crashReporter = {
    start(...args) {
        log("crashReporter.start", args);
    },
};
exports.crashReporter = crashReporter;
const net = {
    async fetch(input, init) {
        // log("net.fetch", [input, init]);
        if (String(input).startsWith("sentry-ipc:")) {
            return new Response(null, { status: 204 });
        }
        if (typeof globalThis.fetch === "function") {
            return globalThis.fetch(input, init);
        }
        return new Response(null, { status: 204 });
    },
    request(...args) {
        // log("net.request", args);
        const headers = new Map();
        const request = {
            setHeader(name, value) {
                // log("net.request.setHeader", [name, value]);
                headers.set(name.toLowerCase(), value);
            },
            getHeader(name) {
                // log("net.request.getHeader", [name]);
                return headers.get(name.toLowerCase());
            },
            once(event, listener) {
                // log("net.request.once", [event, listener]);
                return request;
            },
        };
        return request;
    },
};
exports.net = net;
const autoUpdater = createEmitterStub("autoUpdater");
exports.autoUpdater = autoUpdater;
const ipcMain = createIpcMainStub();
exports.ipcMain = ipcMain;
const nativeTheme = {
    ...createEmitterStub("nativeTheme"),
    shouldUseDarkColors: false,
    shouldUseHighContrastColors: false,
    shouldUseInvertedColorScheme: false,
    themeSource: "system",
};
exports.nativeTheme = nativeTheme;
const nativeImage = {
    createEmpty() {
        log("nativeImage.createEmpty", []);
        return {
            isEmpty: () => true,
        };
    },
    createFromPath(imagePath) {
        log("nativeImage.createFromPath", [imagePath]);
        return {
            isEmpty: () => !imagePath,
        };
    },
};
exports.nativeImage = nativeImage;
const powerMonitor = createEmitterStub("powerMonitor");
exports.powerMonitor = powerMonitor;
const screen = {
    ...createEmitterStub("screen"),
    getAllDisplays() {
        log("screen.getAllDisplays", []);
        return [this.getPrimaryDisplay()];
    },
    getDisplayMatching() {
        log("screen.getDisplayMatching", []);
        return this.getPrimaryDisplay();
    },
    getPrimaryDisplay() {
        log("screen.getPrimaryDisplay", []);
        return {
            id: 1,
            scaleFactor: 2,
            size: { width: 1440, height: 900 },
            workArea: { x: 0, y: 0, width: 1440, height: 900 },
            workAreaSize: { width: 1440, height: 900 },
            bounds: { x: 0, y: 0, width: 1440, height: 900 },
        };
    },
};
exports.screen = screen;
const protocol = {
    registerSchemesAsPrivileged(...args) {
        log("protocol.registerSchemesAsPrivileged", args);
    },
    handle(...args) {
        log("protocol.handle", args);
    },
    registerStringProtocol(...args) {
        log("protocol.registerStringProtocol", args);
    },
};
exports.protocol = protocol;
function createSessionStub(label) {
    const emitter = createEmitterStub(label);
    return {
        async loadExtension(extensionPath) {
            log(`${label}.loadExtension`, [extensionPath]);
            return {
                id: "stub-extension",
                name: "Stub Extension",
                path: extensionPath,
                version: "0.0.0",
            };
        },
        getUserAgent() {
            log(`${label}.getUserAgent`, []);
            return "Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36";
        },
        off: emitter.off,
        on: emitter.on,
        once: emitter.once,
        protocol,
        removeListener: emitter.removeListener,
        setPermissionCheckHandler(...args) {
            log(`${label}.setPermissionCheckHandler`, args);
        },
        setPermissionRequestHandler(...args) {
            log(`${label}.setPermissionRequestHandler`, args);
        },
        webRequest: {
            onBeforeRequest(...args) {
                log(`${label}.webRequest.onBeforeRequest`, args);
            },
            onBeforeSendHeaders(...args) {
                log(`${label}.webRequest.onBeforeSendHeaders`, args);
            },
        },
    };
}
const partitionSessions = new Map();
const session = {
    defaultSession: createSessionStub("session.defaultSession"),
    fromPartition(partition) {
        log("session.fromPartition", [partition]);
        let partitionSession = partitionSessions.get(partition);
        if (!partitionSession) {
            partitionSession = createSessionStub(`session.fromPartition(${partition})`);
            partitionSessions.set(partition, partitionSession);
        }
        return partitionSession;
    },
};
exports.session = session;
const utilityProcess = {
    fork: undefined,
};
exports.utilityProcess = utilityProcess;
const webContents = {
    fromId(id) {
        log("webContents.fromId", [id]);
        return BrowserWindow.getAllWindows().find((window) => window.webContents.id === id)?.webContents;
    },
    getAllWebContents() {
        log("webContents.getAllWebContents", []);
        return BrowserWindow.getAllWindows().map((window) => window.webContents);
    },
    getFocusedWebContents() {
        log("webContents.getFocusedWebContents", []);
        return BrowserWindow.getFocusedWindow()?.webContents ?? null;
    },
};
exports.webContents = webContents;
class MessageChannelMain {
    port1 = createMessagePortStub("MessageChannelMain.port1");
    port2 = createMessagePortStub("MessageChannelMain.port2");
}
exports.MessageChannelMain = MessageChannelMain;
const electronModule = new Proxy({
    app,
    BrowserWindow,
    ipcMain,
    autoUpdater,
    crashReporter,
    MessageChannelMain,
    Menu,
    MenuItem,
    net,
    nativeImage,
    nativeTheme,
    Notification,
    powerMonitor,
    protocol,
    screen,
    session,
    Tray,
    utilityProcess,
    WebContentsView,
    webContents,
    dialog,
}, {
    get(target, prop) {
        if (prop in target) {
            return target[prop];
        }
        return createDeepStub(`electron.${String(prop)}`);
    },
});
exports.default = electronModule;
//# sourceMappingURL=index.js.map