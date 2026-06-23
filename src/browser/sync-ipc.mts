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

export const REMOTE_DEFAULT_HOST_ID = "remote:default";
export const LOCAL_HOST_CONFIG = {
  id: "local",
  display_name: "Local",
  kind: "local",
};
export const REMOTE_DEFAULT_HOST_CONFIG = {
  id: REMOTE_DEFAULT_HOST_ID,
  display_name: "Remote",
  kind: "ssh",
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
  return isSettingsRoute(route)
    ? { ...LOCAL_HOST_CONFIG }
    : { ...REMOTE_DEFAULT_HOST_CONFIG };
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

export function normalizeReadConfigForHostFetchResponse(
  message: unknown,
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
  return {
    ...message,
    bodyJsonString: JSON.stringify({
      ...body,
      config: {
        ...body.config,
        features: {
          ...features,
          remote_connections: true,
          remote_ssh_connections: true,
        },
      },
    }),
  };
}

function isSettingsRoute(route: string | undefined): boolean {
  return route === "/settings" || route?.startsWith("/settings/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function remoteDefaultConnection() {
  return {
    hostId: REMOTE_DEFAULT_HOST_ID,
    displayName: "Remote",
    source: "codex-web",
    sshHost: "remote",
    sshPort: null,
    sshAlias: null,
    identity: null,
    autoConnect: true,
  };
}

function sharedObjectSnapshot(route?: string): SharedObjectSnapshot {
  return {
    host_config: hostConfigForRoute(route),
    remote_connections: [remoteDefaultConnection()],
    remote_ssh_connections: [remoteDefaultConnection()],
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
      remote_connections: true,
      remote_ssh_connections: true,
      memories: false,
      realtime_conversation: false,
    },
  };
}
