"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REMOTE_DEFAULT_HOST_ID = void 0;
exports.remoteDefaultSshHost = remoteDefaultSshHost;
exports.remoteDefaultHostConfig = remoteDefaultHostConfig;
exports.remoteDefaultConnection = remoteDefaultConnection;
const node_os_1 = __importDefault(require("node:os"));
exports.REMOTE_DEFAULT_HOST_ID = "remote:default";
function remoteDefaultSshHost() {
    return (process.env.CODEX_WEB_REMOTE_SSH_HOST?.trim() || node_os_1.default.hostname() || "remote");
}
function remoteDefaultHostConfig() {
    return {
        id: exports.REMOTE_DEFAULT_HOST_ID,
        display_name: remoteDefaultSshHost(),
        kind: "ssh",
    };
}
function remoteDefaultConnection() {
    const sshHost = remoteDefaultSshHost();
    return {
        hostId: exports.REMOTE_DEFAULT_HOST_ID,
        displayName: sshHost,
        source: "codex-managed",
        sshHost,
        sshPort: null,
        sshAlias: null,
        identity: null,
        autoConnect: true,
    };
}
//# sourceMappingURL=remote-default-config.js.map