import type { WebSocket } from "ws";
export type TerminalClientMessage = {
    type: "create";
    cwd?: string;
    cols?: number;
    rows?: number;
} | {
    type: "input";
    data: string;
} | {
    type: "resize";
    cols: number;
    rows: number;
} | {
    type: "close";
};
export type TerminalServerMessage = {
    type: "created";
    sessionId: string;
} | {
    type: "output";
    data: string;
} | {
    type: "exit";
    exitCode: number | null;
    signal: number | null;
} | {
    type: "error";
    message: string;
};
export type TerminalSession = {
    id: string;
    close: () => void;
    onData: (listener: (data: string) => void) => void;
    onExit: (listener: (event: {
        exitCode: number | null;
        signal?: number | null;
    }) => void) => void;
    resize: (cols: number, rows: number) => void;
    write: (data: string) => void;
};
export type TerminalSessionOptions = {
    cols: number;
    cwd: string;
    rows: number;
};
export type TerminalSessionFactory = {
    createSession: (options: TerminalSessionOptions) => TerminalSession;
};
export declare function parseTerminalClientMessage(value: unknown): TerminalClientMessage;
export declare function resolveTerminalCwd(requestedCwd: string | undefined): string;
export declare function createTerminalSocketHandler(factory: TerminalSessionFactory): (socket: Pick<WebSocket, "on" | "send" | "close" | "readyState">) => void;
export declare function createNodePtyTerminalSessionFactory(): TerminalSessionFactory;
export declare function defaultTerminalCwd(): string;
export declare function terminalStylesheetHrefs(assetFiles: string[]): string[];
//# sourceMappingURL=terminal.d.ts.map