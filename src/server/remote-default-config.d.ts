export declare const REMOTE_DEFAULT_HOST_ID = "remote:default";
export declare function remoteDefaultSshHost(): string;
export declare function remoteDefaultHostConfig(): {
    id: string;
    display_name: string;
    kind: string;
};
export declare function remoteDefaultConnection(): {
    hostId: string;
    displayName: string;
    source: string;
    sshHost: string;
    sshPort: null;
    sshAlias: null;
    identity: null;
    autoConnect: boolean;
};
//# sourceMappingURL=remote-default-config.d.ts.map