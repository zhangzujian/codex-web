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
type OpenTarget = {
    id: string;
    label: string;
    labelKey?: string;
    target: string;
    appPath?: string;
    icon?: string;
    kind?: "editor" | "native";
};
type OpenInTargetsPayload = {
    availableTargets: string[];
    mode: "editor";
    preferredTarget: string | null;
    targets: OpenTarget[];
};
type OpenFileRequest = {
    appPath?: unknown;
    column?: unknown;
    cwd?: unknown;
    hostId?: unknown;
    line?: unknown;
    locale?: unknown;
    openMode?: unknown;
    path?: unknown;
    remoteAuthority?: unknown;
    sshHost?: unknown;
    target?: unknown;
};
type OpenFileCommand = {
    command: string;
    args: string[];
};
type NativeOpenEnvironment = {
    codeCommand?: string;
    commandExists?: (command: string) => Promise<boolean>;
    gitBranch?: (request: OpenFileRequest) => Promise<string | null>;
    gitLabHosts?: string[];
    gitRemoteUrl?: (request: OpenFileRequest) => Promise<string | null>;
    gitRoot?: (request: OpenFileRequest) => Promise<string | null>;
    isDirectory?: (targetPath: string) => Promise<boolean>;
    platform?: NodeJS.Platform;
    respond?: (message: MainToRendererMessage) => void;
    spawnDetached?: (command: string, args: string[]) => void;
};
export declare function createOpenInTargetsPayload(environment?: NativeOpenEnvironment, request?: OpenFileRequest): Promise<OpenInTargetsPayload>;
export declare function createOpenFileCommand(request: OpenFileRequest, environment?: NativeOpenEnvironment): Promise<OpenFileCommand>;
export declare function handleNativeOpenFetchMessage(message: unknown, environment?: NativeOpenEnvironment): Promise<boolean>;
export declare function canHandleNativeOpenFetchMessage(message: unknown): message is FetchMessage;
export {};
//# sourceMappingURL=native-open.d.ts.map