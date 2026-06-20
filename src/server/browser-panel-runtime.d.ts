type MainToRendererMessage = {
    type: "ipc-main-event";
    channel: string;
    args: unknown[];
};
type BrowserPanelRuntimeOptions = {
    broadcastToRenderer: (message: MainToRendererMessage) => void;
};
type BrowserPanelSnapshot = {
    annotationEditorMode: "comment";
    canGoBack: boolean;
    canGoForward: boolean;
    commentModeDisabledReason: null;
    comments: unknown[];
    faviconUrl: string | null;
    interactionMode: "browse" | "comment";
    isAnnotationAddModifierPressed: boolean;
    isAudible: boolean;
    isCapturingUserMedia: boolean;
    isDesignModifierPressed: boolean;
    isLoading: boolean;
    isOriginalViewEnabled: boolean;
    isSuspended: boolean;
    isTweaksEditorOpen: boolean;
    tabType: "web";
    title: string;
    url: string;
    zoomPercent: number;
};
export type BrowserPanelRuntime = {
    handleMessageFromView: (message: unknown) => boolean;
};
export declare function createBrowserPanelRuntime({ broadcastToRenderer, }: BrowserPanelRuntimeOptions): BrowserPanelRuntime;
export declare function handleBrowserPanelRuntimeIpcMessage(browserPanelRuntime: BrowserPanelRuntime, channel: string, args: unknown[]): boolean;
export declare function createBrowserPanelSnapshot(rawUrl: string): BrowserPanelSnapshot;
export declare function normalizeBrowserPanelUrl(rawUrl: string): string;
export {};
//# sourceMappingURL=browser-panel-runtime.d.ts.map