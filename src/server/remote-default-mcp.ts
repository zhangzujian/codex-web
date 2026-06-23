const MESSAGE_FOR_VIEW_CHANNEL = "codex_desktop:message-for-view";
const REMOTE_DEFAULT_HOST_ID = "remote:default";

type JsonRpcRequest = {
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

type McpRequestMessage = {
  type: "mcp-request";
  hostId: string;
  request: JsonRpcRequest;
};

type MainToRendererMessage = {
  type: "ipc-main-event";
  channel: string;
  args: unknown[];
};

type RemoteDefaultMcpEnvironment = {
  respond?: (message: MainToRendererMessage) => void;
};

export async function handleRemoteDefaultMcpMessage(
  message: unknown,
  environment: RemoteDefaultMcpEnvironment = {},
): Promise<boolean> {
  if (!canHandleRemoteDefaultMcpMessage(message)) {
    return false;
  }

  sendMcpResponse(environment, message.hostId, message.request.id, {
    config: {
      features: {
        remote_connections: true,
        remote_ssh_connections: true,
      },
      "features.remote_connections": true,
      "features.remote_ssh_connections": true,
    },
    origins: {},
    layers: [],
  });
  return true;
}

export function canHandleRemoteDefaultMcpMessage(
  message: unknown,
): message is McpRequestMessage {
  return (
    isRecord(message) &&
    message.type === "mcp-request" &&
    message.hostId === REMOTE_DEFAULT_HOST_ID &&
    isRecord(message.request) &&
    message.request.method === "config/read"
  );
}

function sendMcpResponse(
  { respond }: RemoteDefaultMcpEnvironment,
  hostId: string,
  requestId: unknown,
  result: unknown,
): void {
  respond?.({
    type: "ipc-main-event",
    channel: MESSAGE_FOR_VIEW_CHANNEL,
    args: [
      {
        type: "mcp-response",
        hostId,
        message: {
          jsonrpc: "2.0",
          id: requestId,
          result,
        },
      },
    ],
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
