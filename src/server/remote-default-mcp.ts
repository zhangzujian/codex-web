type MainToRendererMessage = {
  type: "ipc-main-event";
  channel: string;
  args: unknown[];
};

type RemoteDefaultMcpEnvironment = {
  respond?: (message: MainToRendererMessage) => void;
};

export async function handleRemoteDefaultMcpMessage(
  _message: unknown,
  _environment: RemoteDefaultMcpEnvironment,
): Promise<boolean> {
  return false;
}

export function canHandleRemoteDefaultMcpMessage(
  _message: unknown,
): boolean {
  return false;
}
