import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpenFileCommand,
  createOpenInTargetsPayload,
  handleNativeOpenFetchMessage,
} from "../src/server/native-open.js";

test("createOpenInTargetsPayload exposes host-side file manager and default app targets", async () => {
  const payload = await createOpenInTargetsPayload({
    commandExists: async (command) => command === "xdg-open",
    platform: "linux",
  });

  assert.deepEqual(payload.availableTargets, ["systemDefault", "fileManager"]);
  assert.equal(payload.preferredTarget, "systemDefault");
  assert.deepEqual(
    payload.targets.map(({ id, label, target }) => ({ id, label, target })),
    [
      {
        id: "system-default",
        label: "Default app",
        target: "systemDefault",
      },
      {
        id: "file-manager",
        label: "File manager",
        target: "fileManager",
      },
    ],
  );
});

test("createOpenInTargetsPayload prefers VS Code when a code command is available", async () => {
  const payload = await createOpenInTargetsPayload({
    commandExists: async (command) => command === "code",
    platform: "linux",
  });

  assert.equal(payload.preferredTarget, "workspace");
  assert.equal(payload.targets[0].id, "vscode");
  assert.equal(payload.targets[0].label, "VS Code");
  assert.equal(payload.targets[0].target, "workspace");
  assert.equal(payload.targets[0].appPath, "code");
  assert.equal(payload.availableTargets.includes("workspace"), true);
});

test("createOpenInTargetsPayload exposes Xftp when xsftp is available", async () => {
  const payload = await createOpenInTargetsPayload({
    commandExists: async (command) => command === "xsftp",
    platform: "linux",
  });

  assert.equal(payload.targets[0].id, "xsftp");
  assert.equal(payload.targets[0].label, "Xftp");
  assert.equal(payload.targets[0].target, "xsftp");
  assert.equal(payload.targets[0].appPath, "xsftp");
  assert.equal(payload.availableTargets.includes("xsftp"), true);
});

test("createOpenInTargetsPayload exposes GitHub for GitHub remotes", async () => {
  const payload = await createOpenInTargetsPayload(
    {
      commandExists: async (command) => command === "xdg-open",
      gitBranch: async () => "main",
      gitRemoteUrl: async () => "git@github.com:owner/repo.git",
      gitRoot: async () => "/repo",
      platform: "linux",
    },
    {
      cwd: "/repo",
      path: "/repo/src/index.ts",
    },
  );

  assert.equal(payload.targets[0].id, "github");
  assert.equal(payload.targets[0].label, "GitHub");
  assert.equal(payload.targets[0].target, "github");
  assert.equal(payload.availableTargets.includes("github"), true);
});

test("createOpenInTargetsPayload exposes GitLab for GitLab remotes", async () => {
  const payload = await createOpenInTargetsPayload(
    {
      commandExists: async (command) => command === "xdg-open",
      gitBranch: async () => "main",
      gitRemoteUrl: async () => "https://gitlab.example.com/group/repo.git",
      gitRoot: async () => "/repo",
      platform: "linux",
    },
    {
      cwd: "/repo",
      path: "/repo/src/index.ts",
    },
  );

  assert.equal(payload.targets[0].id, "gitlab");
  assert.equal(payload.targets[0].label, "GitLab");
  assert.equal(payload.targets[0].target, "gitlab");
  assert.equal(payload.availableTargets.includes("gitlab"), true);
});

test("createOpenInTargetsPayload exposes configured self-hosted GitLab remotes", async () => {
  const payload = await createOpenInTargetsPayload(
    {
      commandExists: async (command) => command === "xdg-open",
      gitBranch: async () => "main",
      gitLabHosts: ["code.company.com"],
      gitRemoteUrl: async () => "https://code.company.com/group/repo.git",
      gitRoot: async () => "/repo",
      platform: "linux",
    },
    {
      cwd: "/repo",
      path: "/repo/src/index.ts",
    },
  );

  assert.equal(payload.targets[0].id, "gitlab");
  assert.equal(payload.targets[0].label, "GitLab");
  assert.equal(payload.targets[0].target, "gitlab");
  assert.equal(payload.availableTargets.includes("gitlab"), true);
});

test("createOpenInTargetsPayload hides Git web targets without a system opener", async () => {
  const payload = await createOpenInTargetsPayload(
    {
      commandExists: async () => false,
      gitBranch: async () => "main",
      gitRemoteUrl: async () => "https://gitlab.example.com/group/repo.git",
      gitRoot: async () => "/repo",
      platform: "linux",
    },
    {
      cwd: "/repo",
      path: "/repo/src/index.ts",
    },
  );

  assert.equal(payload.availableTargets.includes("gitlab"), false);
  assert.equal(
    payload.targets.some((target) => target.id === "gitlab"),
    false,
  );
});

test("createOpenFileCommand opens GitHub file URLs in the browser", async () => {
  const command = await createOpenFileCommand(
    {
      cwd: "/repo",
      line: 12,
      path: "/repo/src/index.ts",
      target: "github",
    },
    {
      gitBranch: async () => "main",
      gitRemoteUrl: async () => "git@github.com:owner/repo.git",
      gitRoot: async () => "/repo",
      platform: "linux",
    },
  );

  assert.deepEqual(command, {
    command: "xdg-open",
    args: ["https://github.com/owner/repo/blob/main/src/index.ts#L12"],
  });
});

test("createOpenFileCommand opens GitLab file URLs in the browser", async () => {
  const command = await createOpenFileCommand(
    {
      cwd: "/repo",
      line: 12,
      path: "/repo/src/index.ts",
      target: "gitlab",
    },
    {
      gitBranch: async () => "main",
      gitRemoteUrl: async () => "https://gitlab.example.com/group/repo.git",
      gitRoot: async () => "/repo",
      platform: "linux",
    },
  );

  assert.deepEqual(command, {
    command: "xdg-open",
    args: [
      "https://gitlab.example.com/group/repo/-/blob/main/src/index.ts#L12",
    ],
  });
});

test("createOpenFileCommand drops SSH ports from GitLab web URLs", async () => {
  const command = await createOpenFileCommand(
    {
      cwd: "/repo",
      path: "/repo/src/index.ts",
      target: "gitlab",
    },
    {
      gitBranch: async () => "main",
      gitLabHosts: ["git.example.com"],
      gitRemoteUrl: async () => "ssh://git@git.example.com:2222/group/repo.git",
      gitRoot: async () => "/repo",
      platform: "linux",
    },
  );

  assert.deepEqual(command, {
    command: "xdg-open",
    args: ["https://git.example.com/group/repo/-/blob/main/src/index.ts"],
  });
});

test("createOpenFileCommand opens GitLab directory URLs with tree", async () => {
  const command = await createOpenFileCommand(
    {
      cwd: "/repo",
      path: "/repo/src",
      target: "gitlab",
    },
    {
      gitBranch: async () => "main",
      gitRemoteUrl: async () => "https://gitlab.example.com/group/repo.git",
      gitRoot: async () => "/repo",
      isDirectory: async () => true,
      platform: "linux",
    },
  );

  assert.deepEqual(command, {
    command: "xdg-open",
    args: ["https://gitlab.example.com/group/repo/-/tree/main/src"],
  });
});

test("createOpenFileCommand omits line fragments for GitLab directory URLs", async () => {
  const command = await createOpenFileCommand(
    {
      cwd: "/repo",
      line: 12,
      path: "/repo/src",
      target: "gitlab",
    },
    {
      gitBranch: async () => "main",
      gitRemoteUrl: async () => "https://gitlab.example.com/group/repo.git",
      gitRoot: async () => "/repo",
      isDirectory: async () => true,
      platform: "linux",
    },
  );

  assert.deepEqual(command, {
    command: "xdg-open",
    args: ["https://gitlab.example.com/group/repo/-/tree/main/src"],
  });
});

test("createOpenFileCommand opens non-editor app targets with the raw path", async () => {
  const command = await createOpenFileCommand(
    {
      path: "/repo/src/index.ts",
      target: "xsftp",
    },
    {
      commandExists: async (command) => command === "xsftp",
      isDirectory: async () => false,
      platform: "linux",
    },
  );

  assert.deepEqual(command, {
    command: "xsftp",
    args: ["/repo/src/index.ts"],
  });
});

test("createOpenFileCommand opens Windows system default without a command shell", async () => {
  const command = await createOpenFileCommand(
    {
      path: "/repo/file & calc.txt",
      target: "systemDefault",
    },
    {
      platform: "win32",
    },
  );

  assert.deepEqual(command, {
    command: "rundll32.exe",
    args: ["url.dll,FileProtocolHandler", "/repo/file & calc.txt"],
  });
});

test("createOpenFileCommand ignores client-supplied appPath for native targets", async () => {
  const command = await createOpenFileCommand(
    {
      appPath: "touch",
      path: "/repo/src/index.ts",
      target: "xsftp",
    },
    {
      commandExists: async (command) => command === "xsftp",
      isDirectory: async () => false,
      platform: "linux",
    },
  );

  assert.deepEqual(command, {
    command: "xsftp",
    args: ["/repo/src/index.ts"],
  });
});

test("createOpenFileCommand rejects unavailable app targets even when appPath is supplied", async () => {
  await assert.rejects(
    createOpenFileCommand(
      {
        appPath: "touch",
        path: "/repo/src/index.ts",
        target: "xsftp",
      },
      {
        commandExists: async () => false,
        isDirectory: async () => false,
        platform: "linux",
      },
    ),
    /Open target is not available: xsftp/,
  );
});

test("createOpenFileCommand rejects unknown targets", async () => {
  await assert.rejects(
    createOpenFileCommand(
      {
        path: "/repo/src/index.ts",
        target: "not-a-real-target",
      },
      {
        commandExists: async (command) => command === "xdg-open",
        isDirectory: async () => false,
        platform: "linux",
      },
    ),
    /Open target is not available: not-a-real-target/,
  );
});

test("createOpenFileCommand rejects Git web targets without a system opener", async () => {
  await assert.rejects(
    createOpenFileCommand(
      {
        cwd: "/repo",
        path: "/repo/src/index.ts",
        target: "gitlab",
      },
      {
        commandExists: async () => false,
        gitBranch: async () => "main",
        gitRemoteUrl: async () => "https://gitlab.example.com/group/repo.git",
        gitRoot: async () => "/repo",
        isDirectory: async () => false,
        platform: "linux",
      },
    ),
    /Open target is not available: gitlab/,
  );
});

test("createOpenFileCommand opens VS Code at a file line and column", async () => {
  const command = await createOpenFileCommand(
    {
      column: 7,
      cwd: "/repo",
      line: 12,
      path: "src/index.ts",
      target: "workspace",
    },
    {
      commandExists: async (command) => command === "code",
      isDirectory: async () => false,
      platform: "linux",
    },
  );

  assert.deepEqual(command, {
    command: "code",
    args: ["-g", "/repo/src/index.ts:12:7"],
  });
});

test("createOpenFileCommand reveals a file in its containing folder on Linux", async () => {
  const command = await createOpenFileCommand(
    {
      path: "/repo/src/index.ts",
      target: "fileManager",
    },
    {
      isDirectory: async () => false,
      platform: "linux",
    },
  );

  assert.deepEqual(command, {
    command: "xdg-open",
    args: ["/repo/src"],
  });
});

test("handleNativeOpenFetchMessage responds to open-in-targets requests", async () => {
  const responses = [];
  const handled = await handleNativeOpenFetchMessage(
    {
      body: JSON.stringify({ cwd: "/repo", path: "src/index.ts" }),
      method: "POST",
      requestId: "request-1",
      type: "fetch",
      url: "vscode://codex/open-in-targets",
    },
    {
      commandExists: async (command) => command === "xdg-open",
      platform: "linux",
      respond: (message) => responses.push(message),
    },
  );

  assert.equal(handled, true);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].type, "ipc-main-event");
  assert.equal(responses[0].channel, "codex_desktop:message-for-view");
  const payload = responses[0].args[0];
  assert.equal(payload.type, "fetch-response");
  assert.equal(payload.requestId, "request-1");
  assert.equal(payload.responseType, "success");
  assert.equal(payload.status, 200);
  assert.equal(JSON.parse(payload.bodyJsonString).targets.length, 2);
});
