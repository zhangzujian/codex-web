export type AppServerNotification = {
    method: string;
    params: unknown;
};
export type AppServerRequest = {
    id: number | string;
    method: string;
    params: unknown;
};
export type AppServerJsonRpcClient = {
    dispose: () => void;
    onNotification: (listener: (notification: AppServerNotification) => void) => () => void;
    rpc: (method: string, params: unknown, options?: {
        timeoutMs?: number | null;
    }) => Promise<unknown>;
};
export declare function createCodexAppServerClient(env?: NodeJS.ProcessEnv, requestHandler?: (request: AppServerRequest) => Promise<unknown> | unknown): AppServerJsonRpcClient;
export declare function createAppServerJsonRpcClient({ args, command, env, requestHandler, requestTimeoutMs, }: {
    args: string[];
    command: string;
    env?: NodeJS.ProcessEnv;
    requestHandler?: (request: AppServerRequest) => Promise<unknown> | unknown;
    requestTimeoutMs?: number;
}): AppServerJsonRpcClient;
//# sourceMappingURL=app-server-client.d.ts.map