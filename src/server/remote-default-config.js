"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REMOTE_DEFAULT_HOST_ID = void 0;
exports.remoteDefaultHostConfig = remoteDefaultHostConfig;
exports.REMOTE_DEFAULT_HOST_ID = "local";
function remoteDefaultHostConfig() {
    return {
        id: exports.REMOTE_DEFAULT_HOST_ID,
        display_name: "Local",
        kind: "local",
    };
}
//# sourceMappingURL=remote-default-config.js.map