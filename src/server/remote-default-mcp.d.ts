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
export declare function handleRemoteDefaultMcpMessage(message: unknown, environment?: RemoteDefaultMcpEnvironment): Promise<boolean>;
export declare function canHandleRemoteDefaultMcpMessage(message: unknown): message is McpRequestMessage;
export {};
//# sourceMappingURL=remote-default-mcp.d.ts.map