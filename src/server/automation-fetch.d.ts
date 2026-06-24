type FetchMessage = {
    type: "fetch";
    requestId: string;
    method?: unknown;
    url?: unknown;
    body?: unknown;
};
type DispatchMessage = {
    type: string;
    [key: string]: unknown;
};
type MainToRendererMessage = {
    type: "ipc-main-event";
    channel: string;
    args: unknown[];
};
type AutomationAppServerClient = {
    rpc: (method: string, params: unknown) => Promise<unknown>;
};
type AutomationFetchEnvironment = {
    appServerClient?: AutomationAppServerClient;
    createId?: () => string;
    now?: () => Date;
    respond?: (message: MainToRendererMessage) => void;
    storePath?: string;
};
type AutomationDispatchRoute = "inbox-automation-runs-mark-all-read" | "inbox-item-set-read-state";
export type DynamicToolCallParams = {
    arguments?: unknown;
    tool?: unknown;
    threadId?: unknown;
};
type DynamicToolCallResponse = {
    contentItems: Array<{
        type: "inputText";
        text: string;
    }>;
    success: boolean;
};
export declare function handleAutomationFetchMessage(message: unknown, environment?: AutomationFetchEnvironment): Promise<boolean>;
export declare function canHandleAutomationFetchMessage(message: unknown): message is FetchMessage;
export declare function handleAutomationDispatchMessage(message: unknown, environment?: AutomationFetchEnvironment): Promise<boolean>;
export declare function canHandleAutomationDispatchMessage(message: unknown): message is DispatchMessage & {
    type: AutomationDispatchRoute;
};
export declare function handleAutomationDynamicToolCall(params: DynamicToolCallParams, environment?: AutomationFetchEnvironment): Promise<DynamicToolCallResponse>;
export declare function runDueAutomations(environment?: AutomationFetchEnvironment): Promise<number>;
export declare function startAutomationScheduler(appServerClient: AutomationAppServerClient, intervalMs?: number): {
    dispose: () => void;
};
export {};
//# sourceMappingURL=automation-fetch.d.ts.map