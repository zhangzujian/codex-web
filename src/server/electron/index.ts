import {
  REMOTE_DEFAULT_HOST_ID,
  remoteDefaultConnection,
  remoteDefaultHostConfig,
} from "../remote-default-config";

const AUTOMATION_DEVELOPER_INSTRUCTION =
  "Codex Automations are app-level automations. If the user asks to create, update, or run a Codex automation, use the Automations UI/API when available, or explain that the automation tool is unavailable. Do not implement Codex Automations by editing OS crontab, systemd timers, launchd jobs, or other system schedulers.";

type StubFunction = (...args: unknown[]) => unknown;
type StubListener = (...args: unknown[]) => void;
type StubWebContents = {
  id: number;
  mainFrame: {
    url: string;
  };
  isDestroyed: () => boolean;
  off: (event: string, listener: StubListener) => unknown;
  on: (event: string, listener: StubListener) => unknown;
  once: (event: string, listener: StubListener) => unknown;
  postMessage: (
    channel: string,
    message: unknown,
    transfer?: unknown[],
  ) => void;
  removeListener: (event: string, listener: StubListener) => unknown;
  send: (channel: string, ...args: unknown[]) => void;
};
type IpcMainEvent = {
  returnValue: unknown;
  processId: number;
  frameId: number;
  ports: unknown[];
  sender: StubWebContents;
  senderFrame: {
    url: string;
  };
  reply: (channel: string, ...args: unknown[]) => void;
};

type IpcMainBridgeState = {
  broadcastToRenderer?: (message: {
    type: "ipc-main-event";
    channel: string;
    args: unknown[];
    portIds?: string[];
  }) => void;
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

function getIpcMainBridgeState(): IpcMainBridgeState {
  const globals = globalThis as typeof globalThis & {
    __codexElectronIpcBridge?: IpcMainBridgeState;
  };
  if (!globals.__codexElectronIpcBridge) {
    globals.__codexElectronIpcBridge = {};
  }
  return globals.__codexElectronIpcBridge;
}

function log(method: string, args: unknown[]): void {
  if (process.env.CODEX_WEB_ELECTRON_STUB_DEBUG) {
    process.stderr.write(`[electron-main-stub] ${method} ${args.length}\n`);
  }
}

function createDeepStub(pathLabel: string): StubFunction {
  const fn: StubFunction = (...args: unknown[]) => {
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

function createEmitterStub(label: string): {
  addListener: (event: string, listener: StubListener) => unknown;
  emit: (event: string, ...args: unknown[]) => boolean;
  off: (event: string, listener: StubListener) => unknown;
  on: (event: string, listener: StubListener) => unknown;
  once: (event: string, listener: StubListener) => unknown;
  removeListener: (event: string, listener: StubListener) => unknown;
} {
  const listeners = new Map<string, Set<StubListener>>();

  const api = {
    on(event: string, listener: StubListener): unknown {
      log(`${label}.on`, [event, listener]);
      const eventListeners = listeners.get(event) ?? new Set<StubListener>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return api;
    },
    once(event: string, listener: StubListener): unknown {
      log(`${label}.once`, [event, listener]);
      const wrapped: StubListener = (...args: unknown[]) => {
        api.removeListener(event, wrapped);
        listener(...args);
      };
      return api.on(event, wrapped);
    },
    addListener(event: string, listener: StubListener): unknown {
      log(`${label}.addListener`, [event, listener]);
      return api.on(event, listener);
    },
    removeListener(event: string, listener: StubListener): unknown {
      log(`${label}.removeListener`, [event, listener]);
      listeners.get(event)?.delete(listener);
      return api;
    },
    off(event: string, listener: StubListener): unknown {
      log(`${label}.off`, [event, listener]);
      return api.removeListener(event, listener);
    },
    emit(event: string, ...args: unknown[]): boolean {
      log(`${label}.emit`, [event, ...args]);
      for (const listener of listeners.get(event) ?? []) {
        listener(...args);
      }
      return true;
    },
  };

  return api;
}

function createMessagePortStub(label: string): {
  on: (event: string, listener: StubListener) => unknown;
  postMessage: (...args: unknown[]) => void;
  start: () => void;
} {
  const emitter = createEmitterStub(label);
  return {
    on: emitter.on,
    postMessage(...args: unknown[]): void {
      log(`${label}.postMessage`, args);
    },
    start(): void {
      log(`${label}.start`, []);
    },
  };
}

function extractVirtualPortIds(transfer: unknown[] | undefined): string[] {
  return (
    transfer
      ?.map((port) =>
        typeof port === "object" &&
        port !== null &&
        "__codexVirtualPortId" in port &&
        typeof port.__codexVirtualPortId === "string"
          ? port.__codexVirtualPortId
          : null,
      )
      .filter((portId): portId is string => portId !== null) ?? []
  );
}

const GENERATED_PROJECTLESS_CWD_PATTERN =
  /^(.*(?:^|[\\/])Documents[\\/]+Codex)[\\/]+(?:\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*|\d{4}-\d{2}-\d{2}[\\/]+[a-z0-9][a-z0-9-]*)[\\/]*$/;
const mcpRequests = new Map<
  string,
  { hostId: string; method: string; params: unknown }
>();
const proxiedMcpHosts = new Map<string, string>();
const localThreadIds = new Set<string>();
const fetchRequests = new Map<
  string,
  { route: string; method: string | null; params: unknown }
>();
const remoteProjectState = {
  workspaceRoots: [] as string[],
  workspaceLabels: {} as Record<string, string>,
  remoteProjects: [] as Record<string, unknown>[],
  localProjects: {} as Record<string, unknown>,
  writableRoots: {} as Record<string, unknown>,
  threadPaths: new Map<string, string>(),
  projectlessThreadIds: new Set<string>(),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function remoteDefaultSharedObjectValue(key: string, value: unknown): unknown {
  if (key === "host_config") {
    return remoteDefaultHostConfig();
  }
  if (key === "remote_connections" || key === "remote_ssh_connections") {
    return [remoteDefaultConnection()];
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

function mcpRequestKey(hostId: unknown, id: unknown): string | null {
  if (typeof hostId !== "string") {
    return null;
  }
  if (typeof id !== "string" && typeof id !== "number") {
    return null;
  }
  return `${hostId}\0${String(id)}`;
}

function recordRendererMcpRequest(channel: string, args: unknown[]): void {
  if (channel !== "codex_desktop:message-from-view") {
    return;
  }

  const message = args[0];
  if (
    !isRecord(message) ||
    (message.type !== "mcp-request" &&
      message.type !== "thread-prewarm-start") ||
    typeof message.hostId !== "string" ||
    !isRecord(message.request) ||
    typeof message.request.method !== "string"
  ) {
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

function recordRendererFetchRequest(channel: string, args: unknown[]): void {
  if (channel !== "codex_desktop:message-from-view") {
    return;
  }

  const message = args[0];
  if (
    !isRecord(message) ||
    message.type !== "fetch" ||
    typeof message.requestId !== "string" ||
    typeof message.url !== "string"
  ) {
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

function fetchRequestParams(route: string, body: unknown): unknown {
  if (!isRecord(body)) {
    return undefined;
  }
  if (route === "send-cli-request-for-host" || route === "ipc-request") {
    return body.params;
  }
  return "params" in body ? body.params : body;
}

function normalizeRendererToMainIpcArgs(
  channel: string,
  args: unknown[],
): unknown[] {
  if (
    args.length === 0 ||
    (channel !== "codex_desktop:message-from-view" &&
      !isWorkerFromViewChannel(channel))
  ) {
    return args;
  }
  return [normalizeRendererToMainIpcMessage(args[0]), ...args.slice(1)];
}

function isWorkerFromViewChannel(channel: string): boolean {
  return /^codex_desktop:worker:[^:]+:from-view$/.test(channel);
}

function normalizeRendererToMainIpcMessage(message: unknown): unknown {
  if (!isRecord(message)) {
    return message;
  }

  if (message.type === "worker-request") {
    const localized = localizeRemoteDefaultMainPayload(message);
    return localized;
  }

  if (
    (message.type === "mcp-request" ||
      message.type === "thread-prewarm-start") &&
    message.hostId === REMOTE_DEFAULT_HOST_ID &&
    isRecord(message.request)
  ) {
    const key = mcpRequestKey("local", message.request.id);
    if (key != null) {
      proxiedMcpHosts.set(key, REMOTE_DEFAULT_HOST_ID);
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

  if (message.type === "mcp-response" && message.hostId === REMOTE_DEFAULT_HOST_ID) {
    return {
      ...message,
      hostId: "local",
    };
  }

  if (
    message.type === "fetch" &&
    typeof message.url === "string" &&
    fetchRoute(message.url) != null
  ) {
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

function localizeRemoteDefaultMainPayload(value: unknown): unknown {
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

  if (value.id === REMOTE_DEFAULT_HOST_ID && value.kind === "ssh") {
    return localHostConfig();
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "hostId" && item === REMOTE_DEFAULT_HOST_ID) {
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

function localHostConfig(): Record<string, unknown> {
  return { id: "local", display_name: "Local", kind: "local" };
}

function localizeRemoteDefaultFetchBody(
  route: string | null,
  body: unknown,
): unknown {
  if (!isRecord(body)) {
    return body;
  }

  let changed = false;
  const next = { ...body };
  if (next.hostId === REMOTE_DEFAULT_HOST_ID) {
    next.hostId = "local";
    changed = true;
  }
  const params = localizeRemoteDefaultHostParam(next.params);
  if (params !== next.params) {
    next.params = params;
    changed = true;
  }
  const localized =
    route === "start-conversation"
      ? localizeRemoteDefaultMainPayload(next)
      : next;
  if (
    route === "start-conversation" &&
    isRecord(localized) &&
    localized.preparePrimaryRuntimeForFirstTurn === true
  ) {
    return { ...localized, preparePrimaryRuntimeForFirstTurn: false };
  }
  return changed || localized !== next ? localized : body;
}

function localizeRemoteDefaultHostParam(params: unknown): unknown {
  if (!isRecord(params) || params.hostId !== REMOTE_DEFAULT_HOST_ID) {
    return params;
  }
  return { ...params, hostId: "local" };
}

function recordRendererRequest(channel: string, args: unknown[]): void {
  recordRendererMcpRequest(channel, args);
  recordRendererFetchRequest(channel, args);
}

function fetchRoute(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "vscode:" && url.hostname === "codex"
      ? url.pathname.slice(1)
      : null;
  } catch {
    return null;
  }
}

function parseFetchBody(body: unknown): unknown {
  if (typeof body !== "string") {
    return body;
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function normalizeRemoteDefaultMcpResponse(message: Record<string, unknown>) {
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

  const keepLocalThreadStart =
    request.hostId === "local" && request.method === "thread/start";
  const result = keepLocalThreadStart
    ? message.message.result
    : normalizeRemoteDefaultMcpResult(request, message.message.result);
  if (keepLocalThreadStart) {
    const threadId = threadResultId(result);
    if (threadId != null) {
      localThreadIds.add(threadId);
    }
  }
  return {
    ...message,
    hostId:
      proxiedHostId ??
      (message.hostId === "local" &&
      !keepLocalThreadStart &&
      containsThreadResult(result)
        ? REMOTE_DEFAULT_HOST_ID
        : message.hostId),
    message: {
      ...message.message,
      result,
    },
  };
}

function threadResultId(result: unknown): string | null {
  return isRecord(result) &&
    isRecord(result.thread) &&
    typeof result.thread.id === "string"
    ? result.thread.id
    : null;
}

function normalizeRemoteDefaultFetchResponse(
  message: Record<string, unknown>,
): Record<string, unknown> {
  const request =
    typeof message.requestId === "string"
      ? fetchRequests.get(message.requestId)
      : undefined;
  if (typeof message.requestId === "string") {
    fetchRequests.delete(message.requestId);
  }

  if (
    message.responseType !== "success" ||
    typeof message.bodyJsonString !== "string"
  ) {
    return message;
  }

  try {
    const body = JSON.parse(message.bodyJsonString) as unknown;
    const normalizedBody =
      request == null
        ? normalizeRemoteDefaultPayload(body)
        : normalizeRemoteDefaultFetchResult(request, body);
    return normalizedBody === body
      ? message
      : { ...message, bodyJsonString: JSON.stringify(normalizedBody) };
  } catch {
    return message;
  }
}

function normalizeRemoteDefaultFetchResult(
  request: { route: string; method: string | null; params: unknown },
  result: unknown,
): unknown {
  if (request.route === "set-global-state") {
    if (!isRecord(result) || result.success !== false) {
      cacheRemoteDefaultGlobalStateWrite(request.params);
    }
    return normalizeRemoteDefaultPayload(result);
  }
  if (request.route === "developer-instructions") {
    return normalizeDeveloperInstructionsResult(result);
  }
  if (request.route === "send-cli-request-for-host" && request.method != null) {
    return normalizeRemoteDefaultMcpResult(
      { hostId: "local", method: request.method, params: request.params },
      result,
    );
  }
  if (request.route === "ipc-request" && request.method != null) {
    return normalizeRemoteDefaultMcpResult(
      { hostId: "local", method: request.method, params: request.params },
      result,
    );
  }
  return normalizeRemoteDefaultMcpResult(
    { hostId: "local", method: request.route, params: request.params },
    result,
  );
}

function normalizeRemoteDefaultPayload(value: unknown): unknown {
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

  if (typeof value.instructions === "string") {
    return normalizeDeveloperInstructionsResult(value);
  }

  if (looksLikeThread(value)) {
    return normalizeThread(value);
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "hostId" && item === "local") {
      changed = true;
      next[key] = REMOTE_DEFAULT_HOST_ID;
      continue;
    }

    if (key === "PROJECTLESS_THREAD_IDS" || key === "projectlessThreadIds") {
      for (const threadId of stringArray(item)) {
        remoteProjectState.projectlessThreadIds.add(threadId);
      }
      if (Array.isArray(item) && item.length > 0) {
        changed = true;
        next[key] = [];
      } else {
        next[key] = item;
      }
      continue;
    }

    const normalized = normalizeRemoteDefaultPayload(item);
    changed ||= normalized !== item;
    next[key] = normalized;
  }
  if (
    next.projectKind === "local" &&
    "projectId" in next &&
    !("label" in next) &&
    !("threadKeys" in next)
  ) {
    return normalizeProjectAssignment(next);
  }
  return changed ? next : value;
}

function normalizeRemoteDefaultMcpResult(
  request: { hostId: string; method: string; params: unknown },
  result: unknown,
): unknown {
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

  if (request.method === "developer-instructions") {
    return normalizeDeveloperInstructionsResult(result);
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

function normalizeDeveloperInstructionsResult(result: unknown): unknown {
  if (!isRecord(result) || typeof result.instructions !== "string") {
    return normalizeRemoteDefaultPayload(result);
  }
  if (result.instructions.includes(AUTOMATION_DEVELOPER_INSTRUCTION)) {
    return normalizeRemoteDefaultPayloadWithoutInstructionGuard(result);
  }
  const instructions = result.instructions.trim()
    ? `${result.instructions.trim()}\n\n${AUTOMATION_DEVELOPER_INSTRUCTION}`
    : AUTOMATION_DEVELOPER_INSTRUCTION;
  return normalizeRemoteDefaultPayloadWithoutInstructionGuard({
    ...result,
    instructions,
  });
}

function normalizeRemoteDefaultPayloadWithoutInstructionGuard(
  value: Record<string, unknown>,
): unknown {
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "instructions") {
      next[key] = item;
      continue;
    }
    const normalized = normalizeRemoteDefaultPayload(item);
    changed ||= normalized !== item;
    next[key] = normalized;
  }
  return changed ? next : value;
}

function cacheRemoteDefaultGlobalStateWrite(params: unknown): void {
  if (!isRecord(params) || params.key !== "REMOTE_PROJECTS") {
    return;
  }
  cacheRemoteDefaultProjectsWrite(params.value);
}

function cacheRemoteDefaultProjectsWrite(value: unknown): void {
  remoteProjectState.remoteProjects = Array.isArray(value)
    ? value.flatMap((project) => {
        const normalized = normalizeRemoteProject(project);
        return normalized == null ? [] : [normalized];
      })
    : [];
}

function containsThreadResult(result: unknown): boolean {
  if (!isRecord(result)) {
    return false;
  }
  return isRecord(result.thread) && looksLikeThread(result.thread);
}

function emptyThreadListResult(result: unknown): unknown {
  if (Array.isArray(result)) {
    return [];
  }
  if (!isRecord(result)) {
    return result;
  }
  const next: Record<string, unknown> = { ...result };
  for (const key of ["threads", "conversations", "items", "data"]) {
    if (Array.isArray(next[key])) {
      next[key] = [];
    }
  }
  return next;
}

function cacheWorkspaceRootOptions(result: Record<string, unknown>): void {
  if (Array.isArray(result.roots)) {
    remoteProjectState.workspaceRoots = result.roots.filter(
      (root): root is string => typeof root === "string",
    );
  }
  remoteProjectState.workspaceLabels = toStringRecord(result.labels);
}

function normalizeThreadListResult(result: unknown): unknown {
  if (Array.isArray(result)) {
    return result.map(normalizeThread);
  }
  if (!isRecord(result)) {
    return result;
  }

  const next: Record<string, unknown> = { ...result };
  for (const key of ["threads", "conversations", "items", "data"]) {
    if (Array.isArray(next[key])) {
      next[key] = next[key].map(normalizeThread);
    }
  }
  return looksLikeThread(result) ? normalizeThread(next) : next;
}

function normalizeThread(thread: unknown): unknown {
  if (!isRecord(thread) || !looksLikeThread(thread)) {
    return thread;
  }

  const id = threadId(thread);
  const path = threadPath(thread);
  if (id != null && path != null) {
    remoteProjectState.threadPaths.set(id, path);
  }
  const isProjectless =
    path === "~" ||
    thread.workspaceKind === "projectless" ||
    (typeof thread.cwd === "string" && isGeneratedProjectlessCwd(thread.cwd));
  if (id != null && isProjectless) {
    remoteProjectState.projectlessThreadIds.add(id);
  }

  return {
    ...thread,
    hostId: REMOTE_DEFAULT_HOST_ID,
    ...(path === "~" || isProjectless ? { workspaceKind: "workspace" } : {}),
  };
}

function looksLikeThread(value: Record<string, unknown>): boolean {
  return (
    threadId(value) != null &&
    ("cwd" in value ||
      "workspaceKind" in value ||
      "title" in value ||
      "updatedAt" in value ||
      "createdAt" in value ||
      "threadRuntimeStatus" in value)
  );
}

function threadId(value: Record<string, unknown>): string | null {
  if (typeof value.conversationId === "string") {
    return value.conversationId;
  }
  if (typeof value.id === "string") {
    return value.id;
  }
  return null;
}

function threadPath(value: Record<string, unknown>): string | null {
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

function isGeneratedProjectlessCwd(cwd: string): boolean {
  return GENERATED_PROJECTLESS_CWD_PATTERN.test(cwd.trim());
}

function synthesizeRemoteProjects(existingValue: unknown): unknown[] {
  const projects = new Map<string, Record<string, unknown>>();
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
  for (const [projectId, project] of Object.entries(
    remoteProjectState.localProjects,
  )) {
    projects.set(projectId, remoteProject(projectId, localProjectName(project)));
  }
  for (const [projectId, roots] of Object.entries(
    remoteProjectState.writableRoots,
  )) {
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

function normalizeRemoteProject(project: unknown): Record<string, unknown> | null {
  if (!isRecord(project)) {
    return null;
  }
  const path =
    typeof project.remotePath === "string"
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
    hostId: REMOTE_DEFAULT_HOST_ID,
    path: typeof project.path === "string" ? project.path : path,
    remotePath: path,
  };
}

function synthesizeThreadProjectAssignments(existingValue: unknown): unknown {
  const assignments: Record<string, unknown> = {};
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

function normalizeProjectAssignment(assignment: unknown): unknown {
  if (!isRecord(assignment)) {
    return assignment;
  }
  if (assignment.projectKind === "remote") {
    return { ...assignment, hostId: REMOTE_DEFAULT_HOST_ID };
  }
  const path =
    typeof assignment.path === "string"
      ? assignment.path
      : typeof assignment.cwd === "string"
        ? assignment.cwd
        : typeof assignment.projectId === "string"
          ? assignment.projectId
          : null;
  return path == null ? assignment : remoteProjectAssignment(path);
}

function remoteProjectAssignment(path: string): Record<string, unknown> {
  return {
    projectKind: "remote",
    projectId: path,
    hostId: REMOTE_DEFAULT_HOST_ID,
    path,
  };
}

function remoteProject(
  path: string,
  label = localProjectLabel(path),
): Record<string, unknown> {
  return {
    id: path,
    hostId: REMOTE_DEFAULT_HOST_ID,
    label,
    path,
    remotePath: path,
  };
}

function localProjectLabel(path: string): string {
  return (
    remoteProjectState.workspaceLabels[path]?.trim() ||
    localProjectName(remoteProjectState.localProjects[path]) ||
    basename(path) ||
    "Remote"
  );
}

function localProjectName(project: unknown): string {
  return isRecord(project) && typeof project.name === "string"
    ? project.name.trim()
    : "";
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  if (normalized === "~") {
    return "Remote";
  }
  return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeRendererIpcMessage(
  channel: string,
  message: unknown,
): unknown {
  if (
    channel === "codex_desktop:message-for-view" &&
    isRecord(message) &&
    message.type === "mcp-notification" &&
    message.hostId === "local" &&
    localThreadIds.has(notificationThreadId(message) ?? "")
  ) {
    return message;
  }

  if (
    channel !== "codex_desktop:message-for-view" ||
    !isRecord(message) ||
    message.type !== "shared-object-updated" ||
    typeof message.key !== "string"
  ) {
    if (
      channel === "codex_desktop:message-for-view" &&
      isRecord(message) &&
      message.type === "mcp-response"
    ) {
      return normalizeRemoteDefaultMcpResponse(message);
    }
    if (
      channel === "codex_desktop:message-for-view" &&
      isRecord(message) &&
      message.type === "fetch-response"
    ) {
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

function notificationThreadId(message: Record<string, unknown>): string | null {
  if (!isRecord(message.params)) {
    return null;
  }
  const params = message.params;
  if (typeof params.threadId === "string") {
    return params.threadId;
  }
  if (isRecord(params.thread) && typeof params.thread.id === "string") {
    return params.thread.id;
  }
  return null;
}

function normalizeRendererIpcArgs(channel: string, args: unknown[]): unknown[] {
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
const rendererWebContents: StubWebContents = {
  id: 1001,
  mainFrame: rendererMainFrame,
  isDestroyed: () => false,
  off: rendererWebContentsEmitter.off,
  on: rendererWebContentsEmitter.on,
  once: rendererWebContentsEmitter.once,
  postMessage: (
    channel: string,
    message: unknown,
    transfer?: unknown[],
  ): void => {
    const portIds = extractVirtualPortIds(transfer);
    getIpcMainBridgeState().broadcastToRenderer?.({
      type: "ipc-main-event",
      channel,
      args: [normalizeRendererIpcMessage(channel, message)],
      ...(portIds.length > 0 ? { portIds } : {}),
    });
  },
  removeListener: rendererWebContentsEmitter.removeListener,
  send: (channel: string, ...args: unknown[]): void => {
    getIpcMainBridgeState().broadcastToRenderer?.({
      type: "ipc-main-event",
      channel,
      args: normalizeRendererIpcArgs(channel, args),
    });
  },
};

function createIpcMainEvent({
  ports = [],
  sourceUrl: _sourceUrl,
}: {
  ports?: unknown[];
  sourceUrl?: string;
} = {}): IpcMainEvent {
  const event: IpcMainEvent = {
    returnValue: undefined,
    processId: 1,
    frameId: 1,
    ports,
    sender: rendererWebContents,
    senderFrame: rendererMainFrame,
    reply: (channel: string, ...args: unknown[]): void => {
      getIpcMainBridgeState().broadcastToRenderer?.({
        type: "ipc-main-event",
        channel,
        args: normalizeRendererIpcArgs(channel, args),
      });
    },
  };

  return event;
}

function createIpcMainStub(): {
  handle: (
    channel: string,
    handler: (event: unknown, ...args: unknown[]) => unknown,
  ) => void;
  off: (event: string, listener: StubListener) => unknown;
  on: (event: string, listener: StubListener) => unknown;
  removeHandler: (channel: string) => void;
} {
  const emitter = createEmitterStub("ipcMain");
  const handlers = new Map<
    string,
    (event: unknown, ...args: unknown[]) => unknown
  >();
  const bridgeState = getIpcMainBridgeState();

  bridgeState.handleRendererInvoke = async (
    channel: string,
    args: unknown[],
    sourceUrl?: string,
  ): Promise<unknown> => {
    const normalizedArgs = normalizeRendererToMainIpcArgs(channel, args);
    recordRendererRequest(channel, normalizedArgs);
    const handler = handlers.get(channel);
    if (!handler) {
      throw new Error(`[electron-main-stub] No ipcMain.handle for ${channel}`);
    }
    const event = createIpcMainEvent({ sourceUrl });
    return await Promise.resolve(handler(event, ...normalizedArgs));
  };

  bridgeState.handleRendererSend = (
    channel: string,
    args: unknown[],
    sourceUrl?: string,
    ports?: unknown[],
  ): void => {
    const normalizedArgs = normalizeRendererToMainIpcArgs(channel, args);
    recordRendererRequest(channel, normalizedArgs);
    const event = createIpcMainEvent({ ports, sourceUrl });
    emitter.emit(channel, event, ...normalizedArgs);
  };

  return {
    on: emitter.on,
    off: emitter.off,
    handle(
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => unknown,
    ): void {
      log("ipcMain.handle", [channel, handler]);
      handlers.set(channel, handler);
    },
    removeHandler(channel: string): void {
      log("ipcMain.removeHandler", [channel]);
      handlers.delete(channel);
    },
  };
}

let appReady = false;
let appReadyPromise: Promise<void> | null = null;
const commandLineSwitches = new Map<string, string>();

const appBase = {
  ...createEmitterStub("app"),
  name: "Codex",
  isPackaged: false,
  getName(): string {
    log("app.getName", []);
    return "Codex";
  },
  getVersion(): string {
    log("app.getVersion", []);
    return "26.409.20454";
  },
  getPath(name: string): string {
    log("app.getPath", [name]);
    return process.cwd();
  },
  getAppMetrics(): unknown[] {
    log("app.getAppMetrics", []);
    return [];
  },
  getAppPath(): string {
    log("app.getAppPath", []);
    return process.cwd();
  },
  async getGPUInfo(infoLevel: string): Promise<{ gpuDevice: unknown[] }> {
    log("app.getGPUInfo", [infoLevel]);
    return { gpuDevice: [] };
  },
  setName(name: string): void {
    log("app.setName", [name]);
  },
  setPath(name: string, value: string): void {
    log("app.setPath", [name, value]);
  },
  setAppUserModelId(value: string): void {
    log("app.setAppUserModelId", [value]);
  },
  requestSingleInstanceLock(): boolean {
    log("app.requestSingleInstanceLock", []);
    return true;
  },
  isReady(): boolean {
    log("app.isReady", []);
    return appReady;
  },
  whenReady(): Promise<void> {
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
    appendSwitch(name: string, value?: string): void {
      log("app.commandLine.appendSwitch", [name, value]);
      commandLineSwitches.set(name, value ?? "");
    },
    getSwitchValue(name: string): string {
      log("app.commandLine.getSwitchValue", [name]);
      return commandLineSwitches.get(name) ?? "";
    },
    hasSwitch(name: string): boolean {
      log("app.commandLine.hasSwitch", [name]);
      return commandLineSwitches.has(name);
    },
    removeSwitch(name: string): void {
      log("app.commandLine.removeSwitch", [name]);
      commandLineSwitches.delete(name);
    },
  },
  on(event: string, listener: (...args: unknown[]) => void): unknown {
    log("app.on", [event, listener]);
    return app;
  },
  once(event: string, listener: (...args: unknown[]) => void): unknown {
    log("app.once", [event, listener]);
    return app;
  },
  quit(): void {
    log("app.quit", []);
  },
  exit(code?: number): void {
    log("app.exit", [code]);
  },
};

const app = new Proxy(appBase as Record<string, unknown>, {
  get(target, prop) {
    if (prop in target) {
      return target[prop as keyof typeof target];
    }

    return createDeepStub(`app.${String(prop)}`);
  },
}) as typeof appBase;

class BrowserWindow {
  static nextId = 1;
  static allWindows: BrowserWindow[] = [];
  static focusedWindow: BrowserWindow | null = null;
  id: number;
  private destroyed = false;
  private title = "Codex";
  private bounds = { x: 0, y: 0, width: 1280, height: 820 };
  webContents: Record<string, unknown>;
  private readonly emitter: ReturnType<typeof createEmitterStub>;

  constructor(...args: unknown[]) {
    log("new BrowserWindow", args);
    this.id = BrowserWindow.nextId++;
    this.emitter = createEmitterStub(`BrowserWindow#${this.id}`);

    const webContentsEmitter = createEmitterStub(
      `BrowserWindow#${this.id}.webContents`,
    );
    this.webContents = new Proxy(
      {
        ...webContentsEmitter,
        id: this.id * 1000 + 1,
        loadURL: async (url: string): Promise<void> => {
          log(`BrowserWindow#${this.id}.webContents.loadURL`, [url]);
        },
        loadFile: async (...loadFileArgs: unknown[]): Promise<void> => {
          log(`BrowserWindow#${this.id}.webContents.loadFile`, loadFileArgs);
        },
        openDevTools: (...openDevToolsArgs: unknown[]): void => {
          log(
            `BrowserWindow#${this.id}.webContents.openDevTools`,
            openDevToolsArgs,
          );
        },
        postMessage: (
          channel: string,
          message: unknown,
          transfer?: unknown[],
        ): void => {
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
        send: (...sendArgs: unknown[]): void => {
          log(`BrowserWindow#${this.id}.webContents.send`, sendArgs);
          if (sendArgs.length === 0 || typeof sendArgs[0] !== "string") {
            return;
          }
          const [channel, ...args] = sendArgs as [string, ...unknown[]];
          getIpcMainBridgeState().broadcastToRenderer?.({
            type: "ipc-main-event",
            channel,
            args: normalizeRendererIpcArgs(channel, args),
          });
        },
      } as Record<string, unknown>,
      {
        get: (target, prop) => {
          if (prop in target) {
            return target[prop as keyof typeof target];
          }
          return createDeepStub(
            `BrowserWindow#${this.id}.webContents.${String(prop)}`,
          );
        },
      },
    );

    BrowserWindow.allWindows.push(this);
    BrowserWindow.focusedWindow = this;
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in target) {
          return target[prop as keyof typeof target];
        }
        return createDeepStub(`BrowserWindow#${target.id}.${String(prop)}`);
      },
    });
  }

  static getAllWindows(): BrowserWindow[] {
    log("BrowserWindow.getAllWindows", []);
    return BrowserWindow.allWindows.filter((window) => !window.destroyed);
  }

  static getFocusedWindow(): BrowserWindow | null {
    log("BrowserWindow.getFocusedWindow", []);
    if (BrowserWindow.focusedWindow && !BrowserWindow.focusedWindow.destroyed) {
      return BrowserWindow.focusedWindow;
    }
    return BrowserWindow.getAllWindows()[0] ?? null;
  }

  static fromId(id: number): BrowserWindow | null {
    log("BrowserWindow.fromId", [id]);
    return (
      BrowserWindow.getAllWindows().find((window) => window.id === id) ?? null
    );
  }

  static fromWebContents(webContents: unknown): BrowserWindow | null {
    log("BrowserWindow.fromWebContents", [webContents]);
    return (
      BrowserWindow.getAllWindows().find(
        (window) => window.webContents === webContents,
      ) ?? null
    );
  }

  on(event: string, listener: StubListener): unknown {
    return this.emitter.on(event, listener);
  }

  once(event: string, listener: StubListener): unknown {
    return this.emitter.once(event, listener);
  }

  off(event: string, listener: StubListener): unknown {
    return this.emitter.off(event, listener);
  }

  removeListener(event: string, listener: StubListener): unknown {
    return this.emitter.removeListener(event, listener);
  }

  close(): void {
    log(`BrowserWindow#${this.id}.close`, []);
    this.emitter.emit("close", {
      preventDefault: () => undefined,
    });
    this.destroy();
  }

  destroy(): void {
    log(`BrowserWindow#${this.id}.destroy`, []);
    this.destroyed = true;
    if (BrowserWindow.focusedWindow === this) {
      BrowserWindow.focusedWindow = null;
    }
    this.emitter.emit("closed");
  }

  isDestroyed(): boolean {
    log(`BrowserWindow#${this.id}.isDestroyed`, []);
    return this.destroyed;
  }

  removeMenu(): void {
    log(`BrowserWindow#${this.id}.removeMenu`, []);
  }

  getTitle(): string {
    log(`BrowserWindow#${this.id}.getTitle`, []);
    return this.title;
  }

  setTitle(nextTitle: string): void {
    log(`BrowserWindow#${this.id}.setTitle`, [nextTitle]);
    this.title = nextTitle;
  }

  getBounds(): { height: number; width: number; x: number; y: number } {
    log(`BrowserWindow#${this.id}.getBounds`, []);
    return { ...this.bounds };
  }

  setBounds(nextBounds: {
    height?: number;
    width?: number;
    x?: number;
    y?: number;
  }): void {
    log(`BrowserWindow#${this.id}.setBounds`, [nextBounds]);
    this.bounds = {
      x: nextBounds.x ?? this.bounds.x,
      y: nextBounds.y ?? this.bounds.y,
      width: nextBounds.width ?? this.bounds.width,
      height: nextBounds.height ?? this.bounds.height,
    };
  }

  show(): void {
    log(`BrowserWindow#${this.id}.show`, []);
  }

  hide(): void {
    log(`BrowserWindow#${this.id}.hide`, []);
  }

  focus(): void {
    log(`BrowserWindow#${this.id}.focus`, []);
    BrowserWindow.focusedWindow = this;
    this.emitter.emit("focus");
  }
}

class WebContentsView {
  constructor(...args: unknown[]) {
    log("new WebContentsView", args);
  }
}

class Menu {
  static applicationMenu: Menu | null = null;
  items: MenuItem[] = [];

  constructor(items: MenuItem[] = []) {
    this.items = items;
  }

  static buildFromTemplate(template: unknown[]): Menu {
    log("Menu.buildFromTemplate", [template]);
    const items = template.map((entry) => new MenuItem(entry));
    return new Menu(items);
  }

  static setApplicationMenu(menu: Menu | null): void {
    log("Menu.setApplicationMenu", [menu]);
    Menu.applicationMenu = menu;
  }

  static getApplicationMenu(): Menu | null {
    log("Menu.getApplicationMenu", []);
    return Menu.applicationMenu;
  }

  getMenuItemById(id: string): MenuItem | undefined {
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

  append(item: MenuItem): void {
    log("Menu.append", [item]);
    this.items.push(item);
  }

  insert(pos: number, item: MenuItem): void {
    log("Menu.insert", [pos, item]);
    const index = Math.max(0, Math.min(pos, this.items.length));
    this.items.splice(index, 0, item);
  }

  popup(...args: unknown[]): void {
    log("Menu.popup", args);
  }
}

class MenuItem {
  checked?: boolean;
  click?: (...args: unknown[]) => unknown;
  enabled?: boolean;
  id?: string;
  label?: string;
  role?: string;
  submenu?: Menu;
  type?: string;
  visible?: boolean;

  constructor(...args: unknown[]) {
    log("new MenuItem", args);
    const [options] = args as [Record<string, unknown>?];
    if (!options || typeof options !== "object") {
      return;
    }
    this.checked =
      typeof options.checked === "boolean" ? options.checked : undefined;
    this.click =
      typeof options.click === "function"
        ? (options.click as (...args: unknown[]) => unknown)
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

class Tray {
  constructor(...args: unknown[]) {
    log("new Tray", args);
  }
}

class Notification {
  constructor(...args: unknown[]) {
    log("new Notification", args);
  }

  show(): void {
    log("Notification.show", []);
  }
}

const dialog = {
  async showMessageBox(...args: unknown[]): Promise<{ response: number }> {
    log("dialog.showMessageBox", args);
    return { response: 0 };
  },
};

const crashReporter = {
  start(...args: unknown[]): void {
    log("crashReporter.start", args);
  },
};

const net = {
  async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    // log("net.fetch", [input, init]);
    if (String(input).startsWith("sentry-ipc:")) {
      return new Response(null, { status: 204 });
    }
    if (typeof globalThis.fetch === "function") {
      return globalThis.fetch(input as URL | RequestInfo, init);
    }
    return new Response(null, { status: 204 });
  },
  request(...args: unknown[]): {
    getHeader: (name: string) => string | undefined;
    once: (event: string, listener: StubListener) => unknown;
    setHeader: (name: string, value: string) => void;
  } {
    // log("net.request", args);
    const headers = new Map<string, string>();
    const request = {
      setHeader(name: string, value: string): void {
        // log("net.request.setHeader", [name, value]);
        headers.set(name.toLowerCase(), value);
      },
      getHeader(name: string): string | undefined {
        // log("net.request.getHeader", [name]);
        return headers.get(name.toLowerCase());
      },
      once(event: string, listener: StubListener): unknown {
        // log("net.request.once", [event, listener]);
        return request;
      },
    };
    return request;
  },
};

const autoUpdater = createEmitterStub("autoUpdater");
const ipcMain = createIpcMainStub();
const nativeTheme = {
  ...createEmitterStub("nativeTheme"),
  shouldUseDarkColors: false,
  shouldUseHighContrastColors: false,
  shouldUseInvertedColorScheme: false,
  themeSource: "system",
};
const nativeImage = {
  createEmpty(): { isEmpty: () => boolean } {
    log("nativeImage.createEmpty", []);
    return {
      isEmpty: () => true,
    };
  },
  createFromPath(imagePath: string): { isEmpty: () => boolean } {
    log("nativeImage.createFromPath", [imagePath]);
    return {
      isEmpty: () => !imagePath,
    };
  },
};
const powerMonitor = createEmitterStub("powerMonitor");
const screen = {
  ...createEmitterStub("screen"),
  getAllDisplays(): Array<{
    id: number;
    scaleFactor: number;
    size: { height: number; width: number };
    workArea: { height: number; width: number; x: number; y: number };
    workAreaSize: { height: number; width: number };
    bounds: { height: number; width: number; x: number; y: number };
  }> {
    log("screen.getAllDisplays", []);
    return [this.getPrimaryDisplay()];
  },
  getDisplayMatching(): {
    id: number;
    scaleFactor: number;
    size: { height: number; width: number };
    workArea: { height: number; width: number; x: number; y: number };
    workAreaSize: { height: number; width: number };
    bounds: { height: number; width: number; x: number; y: number };
  } {
    log("screen.getDisplayMatching", []);
    return this.getPrimaryDisplay();
  },
  getPrimaryDisplay(): {
    id: number;
    scaleFactor: number;
    size: { height: number; width: number };
    workArea: { height: number; width: number; x: number; y: number };
    workAreaSize: { height: number; width: number };
    bounds: { height: number; width: number; x: number; y: number };
  } {
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
const protocol = {
  registerSchemesAsPrivileged(...args: unknown[]): void {
    log("protocol.registerSchemesAsPrivileged", args);
  },
  handle(...args: unknown[]): void {
    log("protocol.handle", args);
  },
  registerStringProtocol(...args: unknown[]): void {
    log("protocol.registerStringProtocol", args);
  },
};
function createSessionStub(label: string): {
  getUserAgent: () => string;
  loadExtension: (extensionPath: string) => Promise<{
    id: string;
    name: string;
    path: string;
    version: string;
  }>;
  off: (event: string, listener: StubListener) => unknown;
  on: (event: string, listener: StubListener) => unknown;
  once: (event: string, listener: StubListener) => unknown;
  protocol: typeof protocol;
  removeListener: (event: string, listener: StubListener) => unknown;
  setPermissionCheckHandler: (...args: unknown[]) => void;
  setPermissionRequestHandler: (...args: unknown[]) => void;
  webRequest: {
    onBeforeRequest: (...args: unknown[]) => void;
    onBeforeSendHeaders: (...args: unknown[]) => void;
  };
} {
  const emitter = createEmitterStub(label);
  return {
    async loadExtension(extensionPath: string): Promise<{
      id: string;
      name: string;
      path: string;
      version: string;
    }> {
      log(`${label}.loadExtension`, [extensionPath]);
      return {
        id: "stub-extension",
        name: "Stub Extension",
        path: extensionPath,
        version: "0.0.0",
      };
    },
    getUserAgent(): string {
      log(`${label}.getUserAgent`, []);
      return "Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36";
    },
    off: emitter.off,
    on: emitter.on,
    once: emitter.once,
    protocol,
    removeListener: emitter.removeListener,
    setPermissionCheckHandler(...args: unknown[]): void {
      log(`${label}.setPermissionCheckHandler`, args);
    },
    setPermissionRequestHandler(...args: unknown[]): void {
      log(`${label}.setPermissionRequestHandler`, args);
    },
    webRequest: {
      onBeforeRequest(...args: unknown[]): void {
        log(`${label}.webRequest.onBeforeRequest`, args);
      },
      onBeforeSendHeaders(...args: unknown[]): void {
        log(`${label}.webRequest.onBeforeSendHeaders`, args);
      },
    },
  };
}
const partitionSessions = new Map<
  string,
  ReturnType<typeof createSessionStub>
>();
const session = {
  defaultSession: createSessionStub("session.defaultSession"),
  fromPartition(partition: string): ReturnType<typeof createSessionStub> {
    log("session.fromPartition", [partition]);
    let partitionSession = partitionSessions.get(partition);
    if (!partitionSession) {
      partitionSession = createSessionStub(
        `session.fromPartition(${partition})`,
      );
      partitionSessions.set(partition, partitionSession);
    }
    return partitionSession;
  },
};
const utilityProcess = {
  fork: undefined,
};
const webContents = {
  fromId(id: number): Record<string, unknown> | undefined {
    log("webContents.fromId", [id]);
    return BrowserWindow.getAllWindows().find(
      (window) => window.webContents.id === id,
    )?.webContents;
  },
  getAllWebContents(): Array<Record<string, unknown>> {
    log("webContents.getAllWebContents", []);
    return BrowserWindow.getAllWindows().map((window) => window.webContents);
  },
  getFocusedWebContents(): Record<string, unknown> | null {
    log("webContents.getFocusedWebContents", []);
    return BrowserWindow.getFocusedWindow()?.webContents ?? null;
  },
};
class MessageChannelMain {
  port1 = createMessagePortStub("MessageChannelMain.port1");
  port2 = createMessagePortStub("MessageChannelMain.port2");
}

const electronModule = new Proxy(
  {
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
  } as Record<string, unknown>,
  {
    get(target, prop) {
      if (prop in target) {
        return target[prop as keyof typeof target];
      }

      return createDeepStub(`electron.${String(prop)}`);
    },
  },
);

export {
  app,
  autoUpdater,
  BrowserWindow,
  ipcMain,
  Menu,
  MenuItem,
  MessageChannelMain,
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
  crashReporter,
  dialog,
};
export default electronModule;
