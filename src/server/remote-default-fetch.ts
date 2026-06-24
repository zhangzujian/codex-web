import {
  REMOTE_DEFAULT_HOST_ID,
  remoteDefaultConnection,
} from "./remote-default-config";

const MESSAGE_FOR_VIEW_CHANNEL = "codex_desktop:message-for-view";

type FetchMessage = {
  type: "fetch";
  requestId: string;
  method?: unknown;
  url?: unknown;
  body?: unknown;
};

type MainToRendererMessage = {
  type: "ipc-main-event";
  channel: string;
  args: unknown[];
};

type RemoteDefaultFetchEnvironment = {
  respond?: (message: MainToRendererMessage) => void;
};

type RemoteDefaultRoute =
  | "app-server-connection-state"
  | "discover-remote-ssh-connections"
  | "install-remote-codex"
  | "refresh-remote-connections"
  | "refresh-remote-control-connections"
  | "save-codex-managed-remote-ssh-connections"
  | "set-remote-connection-auto-connect";

export async function handleRemoteDefaultFetchMessage(
  message: unknown,
  environment: RemoteDefaultFetchEnvironment = {},
): Promise<boolean> {
  if (!canHandleRemoteDefaultFetchMessage(message)) {
    return false;
  }

  try {
    const route = routeFromFetchUrl(message.url)!;
    sendFetchResponse(environment, message.requestId, 200, responseForRoute(route));
    if (route === "refresh-remote-connections") {
      sendRemoteDefaultConnectedEvent(environment);
    }
    return true;
  } catch (error) {
    sendFetchError(environment, message.requestId, errorMessage(error));
    return true;
  }
}

export function canHandleRemoteDefaultFetchMessage(
  message: unknown,
): message is FetchMessage {
  const hostId = isFetchMessage(message) ? fetchHostId(message.body) : null;
  return (
    isFetchMessage(message) &&
    routeFromFetchUrl(message.url) != null &&
    (hostId == null || hostId === REMOTE_DEFAULT_HOST_ID)
  );
}

function responseForRoute(route: RemoteDefaultRoute): unknown {
  switch (route) {
    case "app-server-connection-state":
      return {
        state: "connected",
        error: null,
      };
    case "refresh-remote-connections":
    case "save-codex-managed-remote-ssh-connections":
      return {
        remoteConnections: [remoteDefaultConnection()],
      };
    case "discover-remote-ssh-connections":
      return {
        discoveredRemoteConnections: [],
      };
    case "set-remote-connection-auto-connect":
      return {
        remoteConnections: [remoteDefaultConnection()],
        state: "connected",
        error: null,
      };
    case "install-remote-codex":
      return {
        state: "connected",
        error: null,
      };
    case "refresh-remote-control-connections":
      return {
        remoteControlConnections: [],
      };
  }
}

function fetchHostId(body: unknown): string | null {
  if (typeof body !== "string") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed)) {
      return null;
    }
    if (typeof parsed.hostId === "string") {
      return parsed.hostId;
    }
    return isRecord(parsed.params) && typeof parsed.params.hostId === "string"
      ? parsed.params.hostId
      : null;
  } catch {
    return null;
  }
}

function isFetchMessage(value: unknown): value is FetchMessage {
  return (
    isRecord(value) &&
    value.type === "fetch" &&
    typeof value.requestId === "string"
  );
}

function routeFromFetchUrl(value: unknown): RemoteDefaultRoute | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "vscode:" || url.hostname !== "codex") {
      return null;
    }
    const route = url.pathname.slice(1);
    if (isRemoteDefaultRoute(route)) {
      return route;
    }
  } catch {
    return null;
  }

  return null;
}

function isRemoteDefaultRoute(value: string): value is RemoteDefaultRoute {
  return (
    value === "app-server-connection-state" ||
    value === "refresh-remote-connections" ||
    value === "discover-remote-ssh-connections" ||
    value === "refresh-remote-control-connections" ||
    value === "save-codex-managed-remote-ssh-connections" ||
    value === "set-remote-connection-auto-connect" ||
    value === "install-remote-codex"
  );
}

function sendFetchResponse(
  { respond }: RemoteDefaultFetchEnvironment,
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
  { respond }: RemoteDefaultFetchEnvironment,
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

function sendRemoteDefaultConnectedEvent({
  respond,
}: RemoteDefaultFetchEnvironment): void {
  respond?.({
    type: "ipc-main-event",
    channel: MESSAGE_FOR_VIEW_CHANNEL,
    args: [
      {
        type: "codex-app-server-connection-changed",
        hostId: REMOTE_DEFAULT_HOST_ID,
        state: "connected",
        error: null,
      },
    ],
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
