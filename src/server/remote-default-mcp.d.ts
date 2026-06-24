type MainToRendererMessage = {
    type: "ipc-main-event";
    channel: string;
    args: unknown[];
};
type RemoteDefaultMcpEnvironment = {
    respond?: (message: MainToRendererMessage) => void;
};
export declare function handleRemoteDefaultMcpMessage(_message: unknown, _environment: RemoteDefaultMcpEnvironment): Promise<boolean>;
export declare function canHandleRemoteDefaultMcpMessage(_message: unknown): boolean;
export {};
//# sourceMappingURL=remote-default-mcp.d.ts.map