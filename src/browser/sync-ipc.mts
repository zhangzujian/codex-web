export type SyncIpcEnvironment = {
  appVersion: string;
  buildFlavor: string;
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
  remote_control_connections: unknown[];
  remote_control_connections_state: {
    authRequired: boolean;
    available: boolean;
  };
  statsig_default_enable_features: Record<string, boolean>;
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
    return sharedObjectSnapshot();
  }

  if (channel === "codex_desktop:get-system-theme-variant") {
    return env.getSystemThemeVariant();
  }

  throw new Error(`Unsupported ipcRenderer.sendSync channel: ${channel}`);
}

function sharedObjectSnapshot(): SharedObjectSnapshot {
  return {
    host_config: {
      id: "local",
      display_name: "Local",
      kind: "local",
    },
    remote_connections: [],
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
      memories: false,
      realtime_conversation: false,
    },
  };
}
