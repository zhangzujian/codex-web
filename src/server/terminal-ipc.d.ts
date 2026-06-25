import type { TerminalSessionFactory } from "./terminal";
type TerminalEvent = {
    type: "terminal-attached";
    sessionId: string;
    cwd: string;
    shell: string;
} | {
    type: "terminal-data";
    sessionId: string;
    data: string;
} | {
    type: "terminal-exit";
    sessionId: string;
    code: number | null;
    signal: number | null;
} | {
    type: "terminal-error";
    sessionId: string;
    message: string;
};
type TerminalIpcOptions = {
    resolveCwd?: (requestedCwd: string | undefined) => string;
    respond: (message: TerminalEvent) => void;
};
export declare function createTerminalIpcMessageHandler(factory: TerminalSessionFactory, { resolveCwd, respond }: TerminalIpcOptions): (message: unknown) => boolean;
export {};
//# sourceMappingURL=terminal-ipc.d.ts.map