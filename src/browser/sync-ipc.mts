export type SyncIpcEnvironment = {
  appVersion: string;
  buildFlavor: string;
  getCurrentRoute?: () => string;
  getSystemThemeVariant: () => "dark" | "light" | string;
};

export type SharedObjectSnapshot = {
  host_config: {
    display_name: string;
    id: string;
    kind: string;
  };
  pending_worktrees: unknown[];
  remote_connections: unknown[];
  remote_ssh_connections: unknown[];
  remote_control_connections: unknown[];
  remote_control_connections_state: {
    authRequired: boolean;
    available: boolean;
  };
  statsig_default_enable_features: Record<string, boolean>;
};

type BrowserLocalFetchEnvironment = {
  locale: string;
  getSettingEntries?: () => Iterable<readonly [string, unknown]>;
  getSetting: (key: string) => unknown;
  setSetting: (key: string, value: unknown) => void;
};

type FetchResponseMessage = {
  type: "fetch-response";
  requestId: string;
  responseType: "success";
  status: number;
  headers: Record<string, string>;
  bodyJsonString: string;
};

export const LOCAL_HOST_CONFIG = {
  id: "local",
  display_name: "Local",
  kind: "local",
};

export function handleSyncIpc(
  channel: string,
  env: SyncIpcEnvironment,
): unknown {
  if (channel === "codex_desktop:get-sentry-init-options") {
    return {
      codexAppSessionId: "42626fde-7064-471f-b44d-b1a7ad849c7f",
      buildFlavor: env.buildFlavor,
      buildNumber: null,
      appVersion: env.appVersion,
      enabled: false,
    };
  }

  if (channel === "codex_desktop:get-build-flavor") {
    return env.buildFlavor;
  }

  if (channel === "codex_desktop:get-uses-owl-app-shell") {
    return false;
  }

  if (channel === "codex_desktop:get-shared-object-snapshot") {
    return sharedObjectSnapshot(env.getCurrentRoute?.());
  }

  if (channel === "codex_desktop:get-system-theme-variant") {
    return env.getSystemThemeVariant();
  }

  throw new Error(`Unsupported ipcRenderer.sendSync channel: ${channel}`);
}

export function hostConfigForRoute(route: string | undefined): {
  display_name: string;
  id: string;
  kind: string;
} {
  return { ...LOCAL_HOST_CONFIG };
}

export function normalizeSharedObjectUpdateForRoute(
  message: unknown,
  route: string | undefined,
): unknown {
  if (
    !isRecord(message) ||
    message.type !== "shared-object-updated" ||
    message.key !== "host_config"
  ) {
    return message;
  }

  return {
    ...message,
    value: hostConfigForRoute(route),
  };
}

export function isReadConfigForHostFetchMessage(
  message: unknown,
): message is { requestId: string; type: "fetch"; url: string } {
  if (
    !isRecord(message) ||
    message.type !== "fetch" ||
    typeof message.requestId !== "string" ||
    typeof message.url !== "string"
  ) {
    return false;
  }

  try {
    const url = new URL(message.url);
    return (
      url.protocol === "vscode:" &&
      url.href === "vscode://codex/read-config-for-host"
    );
  } catch {
    return false;
  }
}

export function localBrowserFetchResponse(
  message: unknown,
  env: BrowserLocalFetchEnvironment,
): FetchResponseMessage | null {
  if (
    !isRecord(message) ||
    message.type !== "fetch" ||
    typeof message.requestId !== "string" ||
    typeof message.url !== "string"
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(message.url);
  } catch {
    return null;
  }
  if (url.protocol !== "vscode:" || url.hostname !== "codex") {
    return null;
  }

  if (url.pathname === "/locale-info") {
    const locale = effectiveBrowserLocale(env);
    return fetchResponse(message.requestId, {
      ideLocale: locale,
      systemLocale: locale,
    });
  }

  if (url.pathname === "/get-settings") {
    const values = Object.fromEntries(readStoredSettingEntries(env));
    return fetchResponse(message.requestId, {
      configuredValues: values,
      values,
    });
  }

  if (url.pathname === "/get-setting") {
    const { key } = readFetchParams(message.body);
    return typeof key === "string"
      ? fetchResponse(message.requestId, { value: env.getSetting(key) ?? null })
      : null;
  }

  if (url.pathname === "/set-setting") {
    const { key, value } = readFetchParams(message.body);
    if (typeof key !== "string") {
      return null;
    }
    env.setSetting(key, value ?? null);
    return fetchResponse(message.requestId, { value: value ?? null });
  }

  return null;
}

export function normalizeReadConfigForHostFetchResponse(
  message: unknown,
  locale?: string,
): unknown {
  if (
    !isRecord(message) ||
    message.type !== "fetch-response" ||
    message.responseType !== "success" ||
    typeof message.bodyJsonString !== "string"
  ) {
    return message;
  }

  let body: unknown;
  try {
    body = JSON.parse(message.bodyJsonString);
  } catch {
    return message;
  }

  if (!isRecord(body) || !isRecord(body.config)) {
    return message;
  }

  const features = isRecord(body.config.features) ? body.config.features : {};
  const localeConfig =
    typeof locale === "string" && locale.trim().length > 0
      ? {
          ideLocale: body.config.ideLocale ?? locale,
          systemLocale: body.config.systemLocale ?? locale,
        }
      : {};
  return {
    ...message,
    bodyJsonString: JSON.stringify({
      ...body,
      config: {
        ...body.config,
        ...localeConfig,
        features: {
          ...features,
          remote_connections: false,
          remote_ssh_connections: false,
        },
      },
    }),
  };
}

export function openInBrowserUrlFromFetchResponse(message: unknown): string | null {
  if (
    !isRecord(message) ||
    message.type !== "fetch-response" ||
    message.responseType !== "success" ||
    typeof message.bodyJsonString !== "string"
  ) {
    return null;
  }

  try {
    const body: unknown = JSON.parse(message.bodyJsonString);
    return isRecord(body) &&
      body.openInBrowser === true &&
      typeof body.url === "string"
      ? body.url
      : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fetchResponse(requestId: string, body: unknown): FetchResponseMessage {
  return {
    type: "fetch-response",
    requestId,
    responseType: "success",
    status: 200,
    headers: {},
    bodyJsonString: JSON.stringify(body),
  };
}

function readFetchParams(body: unknown): Record<string, unknown> {
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

function effectiveBrowserLocale(env: BrowserLocalFetchEnvironment): string {
  const override = env.getSetting("localeOverride");
  return typeof override === "string" && override.trim().length > 0
    ? override
    : env.locale;
}

function readStoredSettingEntries(env: BrowserLocalFetchEnvironment) {
  if (env.getSettingEntries) {
    return Array.from(env.getSettingEntries()).filter(
      (entry): entry is readonly [string, NonNullable<unknown>] =>
        entry[1] != null,
    );
  }

  return ["localeOverride"]
    .map((key) => [key, env.getSetting(key)] as const)
    .filter((entry): entry is readonly [string, NonNullable<unknown>] =>
      entry[1] != null,
    );
}

function sharedObjectSnapshot(route?: string): SharedObjectSnapshot {
  return {
    host_config: hostConfigForRoute(route),
    remote_connections: [],
    remote_ssh_connections: [],
    remote_control_connections: [],
    remote_control_connections_state: {
      available: false,
      authRequired: false,
    },
    pending_worktrees: [],
    statsig_default_enable_features: {
      enable_request_compression: true,
      collaboration_modes: true,
      personality: true,
      request_rule: true,
      fast_mode: true,
      image_generation: true,
      image_detail_original: true,
      workspace_dependencies: true,
      guardian_approval: true,
      apps: true,
      plugins: true,
      tool_search: true,
      tool_suggest: false,
      tool_call_mcp_elicitation: true,
      remote_connections: false,
      remote_ssh_connections: false,
      memories: false,
      realtime_conversation: false,
      enable_i18n: true,
    },
  };
}
