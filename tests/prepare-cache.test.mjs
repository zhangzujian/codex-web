import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

const patchNames = [
  "webview-remove-csp.patch",
  "webview-preload.patch",
  "webview-favicon.patch",
  "webview-pwa.patch",
];

async function writeExecutable(path, source) {
  await writeFile(path, source);
  chmodSync(path, 0o755);
}

async function createStubBin(sources) {
  const stubBin = await mkdtemp(join(tmpdir(), "codex-web-stub-bin-"));
  for (const [name, source] of Object.entries(sources)) {
    await writeExecutable(join(stubBin, name), source);
  }
  return stubBin;
}

async function createPrepareAsarFixture() {
  const fixtureDir = await mkdtemp(join(tmpdir(), "codex-web-prepare-asar-"));
  await mkdir(join(fixtureDir, "assets"), { recursive: true });
  await mkdir(join(fixtureDir, "assets/apps"), { recursive: true });
  await mkdir(join(fixtureDir, "scripts"), { recursive: true });
  await mkdir(join(fixtureDir, "patches"), { recursive: true });
  await mkdir(join(fixtureDir, "patches/asar"), { recursive: true });
  await writeFile(join(fixtureDir, "assets/favicon.svg"), "<svg />");
  await writeFile(join(fixtureDir, "assets/manifest.json"), "{}");
  await writeFile(join(fixtureDir, "assets/apps/github.svg"), "<svg />");
  await writeFile(join(fixtureDir, "assets/apps/gitlab.svg"), "<svg />");
  await copyFile(
    new URL("../scripts/prepare_asar", import.meta.url),
    join(fixtureDir, "scripts/prepare_asar"),
  );
  await copyFile(
    new URL("../scripts/resolve_decode_codex_source", import.meta.url),
    join(fixtureDir, "scripts/resolve_decode_codex_source"),
  );
  await copyFile(
    new URL("../scripts/generate_restored_runtime_chunk.mjs", import.meta.url),
    join(fixtureDir, "scripts/generate_restored_runtime_chunk.mjs"),
  );
  await copyFile(
    new URL("../scripts/derive_restored_runtime_chunk.mjs", import.meta.url),
    join(fixtureDir, "scripts/derive_restored_runtime_chunk.mjs"),
  );
  await symlink(
    new URL("../node_modules", import.meta.url),
    join(fixtureDir, "node_modules"),
    "dir",
  );
  chmodSync(join(fixtureDir, "scripts/prepare_asar"), 0o755);
  chmodSync(join(fixtureDir, "scripts/resolve_decode_codex_source"), 0o755);
  for (const patchName of patchNames) {
    await writeFile(join(fixtureDir, "patches", patchName), "");
  }
  return fixtureDir;
}

async function writeDecodedBase(sourceDir) {
  await mkdir(join(sourceDir, "webview/assets"), { recursive: true });
  await mkdir(join(sourceDir, "node_modules/better-sqlite3"), {
    recursive: true,
  });
  await mkdir(join(sourceDir, "node_modules/node-pty"), { recursive: true });
  await writeFile(join(sourceDir, "webview/assets/app-D0g8sCle.png"), "icon");
  await writeFile(join(sourceDir, "package.json"), '{"version":"local"}\n');
  await writeFile(
    join(sourceDir, "node_modules/better-sqlite3/native.node"),
    "native",
  );
  await writeFile(join(sourceDir, "node_modules/node-pty/pty.node"), "native");
}

test("prepare only delegates to prepare_asar", async () => {
  const fixtureDir = await mkdtemp(join(tmpdir(), "codex-web-prepare-"));
  const logPath = join(fixtureDir, "prepare.log");

  await mkdir(join(fixtureDir, "scripts"), { recursive: true });
  await copyFile(
    new URL("../scripts/prepare", import.meta.url),
    join(fixtureDir, "scripts/prepare"),
  );
  chmodSync(join(fixtureDir, "scripts/prepare"), 0o755);
  await writeExecutable(
    join(fixtureDir, "scripts/prepare_asar"),
    `#!/usr/bin/env sh
printf 'prepare_asar\\n' > "$PREPARE_ASAR_STUB_LOG"
`,
  );

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      PREPARE_ASAR_STUB_LOG: logPath,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await readFile(logPath, "utf8"), "prepare_asar\n");
});

test("GitLab app icon uses a cropped viewBox", async () => {
  const icon = await readFile(
    new URL("../assets/apps/gitlab.svg", import.meta.url),
    "utf8",
  );

  assert.match(icon, /viewBox="112 115 156 150"/);
});

test("resolve_decode_codex_source accepts an explicit decoded source", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const sourceRoot = join(fixtureDir, "decode-codex");

  await mkdir(join(sourceRoot, "ref"), { recursive: true });
  await mkdir(join(sourceRoot, "restored"), { recursive: true });

  const result = spawnSync(
    "/usr/bin/bash",
    ["./scripts/resolve_decode_codex_source"],
    {
      cwd: fixtureDir,
      env: {
        ...process.env,
        CODEX_DECODE_CODEX_DIR: sourceRoot,
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), sourceRoot);
});

test("prepare_asar requires a decoded Codex app base", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const sourceDir = join(fixtureDir, "missing-decode-codex");

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare_asar"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CODEX_DECODE_CODEX_DIR: sourceDir,
      CODEX_APP_BASE_DIR: "",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing decode-codex ref\/restored/);
});

test("prepare_asar does not allow CODEX_APP_BASE_DIR without restored", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const sourceDir = join(fixtureDir, "ref-only");

  await writeDecodedBase(sourceDir);

  const stubBin = await createStubBin({
    sharp: `#!/usr/bin/env sh
exit 0
`,
    prettier: `#!/usr/bin/env sh
exit 0
`,
    patch: `#!/usr/bin/env sh
exit 0
`,
  });

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare_asar"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CODEX_APP_BASE_DIR: sourceDir,
      CODEX_DECODE_CODEX_DIR: "",
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing decode-codex restored/);
});

test("prepare_asar works without restored patches for decoded Codex app trees", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const sourceRoot = join(fixtureDir, "decode-codex");
  const sourceDir = join(sourceRoot, "ref");
  const logPath = join(fixtureDir, "prepare-asar.log");

  await writeDecodedBase(sourceDir);
  await mkdir(join(sourceRoot, "restored"), { recursive: true });

  const stubBin = await createStubBin({
    sharp: `#!/usr/bin/env sh
printf 'sharp %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    prettier: `#!/usr/bin/env sh
printf 'prettier %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    patch: `#!/usr/bin/env sh
printf 'patch %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    node: `#!/usr/bin/env sh
printf 'node %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
  });

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare_asar"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CODEX_DECODE_CODEX_DIR: sourceRoot,
      PREPARE_ASAR_STUB_LOG: logPath,
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const prepareLog = await readFile(logPath, "utf8");
  assert.doesNotMatch(prepareLog, /node scripts\/patch_/);
  assert.doesNotMatch(prepareLog, /git apply/);
});

test("prepare_asar applies restored patches and materializes matching runtime files", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const sourceRoot = join(fixtureDir, "decode-codex");
  const sourceDir = join(sourceRoot, "ref");
  const logPath = join(fixtureDir, "prepare-asar.log");

  await writeDecodedBase(sourceDir);
  await mkdir(join(sourceRoot, "restored"), { recursive: true });
  await writeFile(join(sourceRoot, "restored", "package.json"), '{"version":"local"}\n');
  await mkdir(join(fixtureDir, "patches/restored"), { recursive: true });
  await writeFile(
    join(fixtureDir, "patches/restored/local.patch"),
    `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1 +1 @@
-{"version":"local"}
+{"version":"patched"}
`,
  );

  const stubBin = await createStubBin({
    sharp: `#!/usr/bin/env sh
printf 'sharp %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    prettier: `#!/usr/bin/env sh
printf 'prettier %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    patch: `#!/usr/bin/env sh
printf 'patch %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    node: `#!/usr/bin/env sh
printf 'node %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    git: `#!/usr/bin/env sh
printf 'git %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exec /usr/bin/git "$@"
`,
  });

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare_asar"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CODEX_DECODE_CODEX_DIR: sourceRoot,
      PREPARE_ASAR_STUB_LOG: logPath,
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    await readFile(join(fixtureDir, "scratch/restored/package.json"), "utf8"),
    '{"version":"patched"}\n',
  );
  assert.equal(
    await readFile(join(fixtureDir, "scratch/asar/package.json"), "utf8"),
    '{"version":"patched"}\n',
  );
  const prepareLog = await readFile(logPath, "utf8");
  assert.match(
    prepareLog,
    /git apply --directory scratch\/restored patches\/restored\/local\.patch/,
  );
  assert.doesNotMatch(prepareLog, /node scripts\/patch_/);
  await assert.rejects(
    stat(join(fixtureDir, "scratch/asar/node_modules/node-pty")),
  );
  await assert.rejects(
    stat(join(fixtureDir, "scratch/asar/node_modules/better-sqlite3")),
  );
});

test("prepare_asar regenerates runtime chunks from patched restored sources", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const sourceRoot = join(fixtureDir, "decode-codex");
  const sourceDir = join(sourceRoot, "ref");
  const targetAsset = join(
    sourceDir,
    "webview/assets/derived-sidebar-runtime.js",
  );
  const logPath = join(fixtureDir, "prepare-asar.log");

  await writeDecodedBase(sourceDir);
  await mkdir(join(sourceDir, "webview/assets"), { recursive: true });
  await writeFile(
    targetAsset,
    "function S5e(){`sidebar_trigger`;`sidebar_forward`;`sidebar_back`;`app.sidebar.tooltip`;return {children:[j,V]}} export {S5e as t};\n",
  );
  await writeFile(
    join(sourceDir, "webview/assets/distractor.js"),
    "function nope(){`sidebar_trigger`;return {children:[j,V]}}\n",
  );
  await mkdir(join(sourceRoot, "restored/app-shell"), { recursive: true });
  await writeFile(
    join(sourceRoot, "restored/app-shell/sidebar-navigation-controls.tsx"),
    "export function SidebarNavigationControls(){runCommand('toggleSidebar','sidebar_trigger');runCommand('navigateForward','sidebar_forward');runCommand('navigateBack','sidebar_back');return <div>{sidebarTrigger}{navigationButtons}</div>;}\n",
  );
  await mkdir(join(fixtureDir, "patches/restored"), { recursive: true });
  await writeFile(
    join(fixtureDir, "patches/restored/local.patch"),
    `diff --git a/app-shell/sidebar-navigation-controls.tsx b/app-shell/sidebar-navigation-controls.tsx
--- a/app-shell/sidebar-navigation-controls.tsx
+++ b/app-shell/sidebar-navigation-controls.tsx
@@ -1 +1 @@
-export function SidebarNavigationControls(){runCommand('toggleSidebar','sidebar_trigger');runCommand('navigateForward','sidebar_forward');runCommand('navigateBack','sidebar_back');return <div>{sidebarTrigger}{navigationButtons}</div>;}
+export function SidebarNavigationControls(){runCommand('toggleSidebar','sidebar_trigger');runCommand('navigateForward','sidebar_forward');runCommand('navigateBack','sidebar_back');return <div>{sidebarTrigger}</div>;}
`,
  );

  const stubBin = await createStubBin({
    sharp: `#!/usr/bin/env sh
exit 0
`,
    prettier: `#!/usr/bin/env sh
exit 0
`,
    patch: `#!/usr/bin/env sh
exit 0
`,
    git: `#!/usr/bin/env sh
printf 'git %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exec /usr/bin/git "$@"
`,
  });

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare_asar"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CODEX_DECODE_CODEX_DIR: sourceRoot,
      PREPARE_ASAR_STUB_LOG: logPath,
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    await readFile(
      join(
        fixtureDir,
        "scratch/asar/webview/assets/derived-sidebar-runtime.js",
      ),
      "utf8",
    ),
    "function S5e(){`sidebar_trigger`;`sidebar_forward`;`sidebar_back`;`app.sidebar.tooltip`;return {children:[j]}} export {S5e as t};\n",
  );
  assert.doesNotMatch(
    await readFile(logPath, "utf8"),
    /git apply --directory scratch\/asar .*hide-app-header-navigation-buttons/,
  );
});

test("prepare_asar removes pets from patched settings sections runtime", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const sourceRoot = join(fixtureDir, "decode-codex");
  const sourceDir = join(sourceRoot, "ref");
  const targetAsset = join(sourceDir, "webview/assets/settings-runtime.js");

  await writeDecodedBase(sourceDir);
  await mkdir(join(sourceDir, "webview/assets"), { recursive: true });
  await writeFile(
    targetAsset,
    "var L=`general-settings.import.profile.keyboard-shortcuts.codex-micro.appshots.appearance.pets.agent.git-settings.data-controls.cloud-settings.cloud-environments.code-review.personalization.usage.browser-use.computer-use.local-environments.worktrees.environments.mcp-settings.hooks-settings.connections.plugins-settings.skills-settings`.split(`.`),S=[{slug:`general-settings`},{slug:`appearance`},{slug:`pets`},{slug:`appshots`}];\n",
  );
  await mkdir(join(sourceRoot, "restored/settings"), { recursive: true });
  await writeFile(
    join(sourceRoot, "restored/settings/settings-sections.ts"),
    `export const SETTINGS_SECTION_IDS=["general-settings","appearance","pets","agent"];
export const SETTINGS_SECTIONS=[{slug:"general-settings"},{slug:"appearance"},{slug:"pets"}];
`,
  );
  await mkdir(join(fixtureDir, "patches/restored"), { recursive: true });
  await writeFile(
    join(fixtureDir, "patches/restored/local.patch"),
    `diff --git a/settings/settings-sections.ts b/settings/settings-sections.ts
--- a/settings/settings-sections.ts
+++ b/settings/settings-sections.ts
@@ -1,2 +1,2 @@
-export const SETTINGS_SECTION_IDS=["general-settings","appearance","pets","agent"];
-export const SETTINGS_SECTIONS=[{slug:"general-settings"},{slug:"appearance"},{slug:"pets"}];
+export const SETTINGS_SECTION_IDS=["general-settings","appearance","agent"];
+export const SETTINGS_SECTIONS=[{slug:"general-settings"},{slug:"appearance"}];
`,
  );

  const stubBin = await createStubBin({
    sharp: `#!/usr/bin/env sh
exit 0
`,
    prettier: `#!/usr/bin/env sh
exit 0
`,
    patch: `#!/usr/bin/env sh
exit 0
`,
    git: `#!/usr/bin/env sh
exec /usr/bin/git "$@"
`,
  });

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare_asar"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CODEX_DECODE_CODEX_DIR: sourceRoot,
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const runtime = await readFile(
    join(fixtureDir, "scratch/asar/webview/assets/settings-runtime.js"),
    "utf8",
  );
  assert.doesNotMatch(runtime, /appearance\.pets\.agent/);
  assert.doesNotMatch(runtime, /\{slug:`pets`\}/);
});

test("prepare_asar rejects restored patches without a runtime materialization path", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const sourceRoot = join(fixtureDir, "decode-codex");
  const sourceDir = join(sourceRoot, "ref");

  await writeDecodedBase(sourceDir);
  await mkdir(join(sourceRoot, "restored"), { recursive: true });
  await writeFile(join(sourceRoot, "restored", "restored-only.ts"), "old\n");
  await mkdir(join(fixtureDir, "patches/restored"), { recursive: true });
  await writeFile(
    join(fixtureDir, "patches/restored/local.patch"),
    `diff --git a/restored-only.ts b/restored-only.ts
--- a/restored-only.ts
+++ b/restored-only.ts
@@ -1 +1 @@
-old
+new
`,
  );

  const stubBin = await createStubBin({
    sharp: `#!/usr/bin/env sh
exit 0
`,
    prettier: `#!/usr/bin/env sh
exit 0
`,
    patch: `#!/usr/bin/env sh
exit 0
`,
    git: `#!/usr/bin/env sh
exec /usr/bin/git "$@"
`,
  });

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare_asar"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CODEX_DECODE_CODEX_DIR: sourceRoot,
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /restored patch changed restored-only\.ts/);
});

test("prepare_asar applies asar patches to the runtime tree", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const sourceRoot = join(fixtureDir, "decode-codex");
  const sourceDir = join(sourceRoot, "ref");
  const logPath = join(fixtureDir, "prepare-asar.log");

  await writeDecodedBase(sourceDir);
  await mkdir(join(sourceRoot, "restored"), { recursive: true });
  await writeFile(
    join(fixtureDir, "patches/asar/local.patch"),
    `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1 +1 @@
-{"version":"local"}
+{"version":"patched"}
`,
  );

  const stubBin = await createStubBin({
    sharp: `#!/usr/bin/env sh
printf 'sharp %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    prettier: `#!/usr/bin/env sh
printf 'prettier %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    patch: `#!/usr/bin/env sh
printf 'patch %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    git: `#!/usr/bin/env sh
printf 'git %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exec /usr/bin/git "$@"
`,
  });

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare_asar"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CODEX_DECODE_CODEX_DIR: sourceRoot,
      PREPARE_ASAR_STUB_LOG: logPath,
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    await readFile(join(fixtureDir, "scratch/asar/package.json"), "utf8"),
    '{"version":"patched"}\n',
  );
  assert.match(
    await readFile(logPath, "utf8"),
    /git apply --directory scratch\/asar patches\/asar\/local\.patch/,
  );
});

test("prepare_asar rejects asar patches when restored has the same target path", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const sourceRoot = join(fixtureDir, "decode-codex");
  const sourceDir = join(sourceRoot, "ref");

  await writeDecodedBase(sourceDir);
  await mkdir(join(sourceRoot, "restored"), { recursive: true });
  await writeFile(join(sourceRoot, "restored", "package.json"), '{"version":"local"}\n');
  await writeFile(
    join(fixtureDir, "patches/asar/local.patch"),
    `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1 +1 @@
-{"version":"local"}
+{"version":"patched"}
`,
  );

  const stubBin = await createStubBin({
    sharp: `#!/usr/bin/env sh
exit 0
`,
    prettier: `#!/usr/bin/env sh
exit 0
`,
    patch: `#!/usr/bin/env sh
exit 0
`,
  });

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare_asar"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CODEX_DECODE_CODEX_DIR: sourceRoot,
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /patch patches\/restored instead/);
});

test("build:browser only builds the browser preload bundle", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageJson.scripts["build:browser"],
    "vite build --config vite.browser.config.ts",
  );
});

test("package exposes the from-zero desktop adaptation check", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageJson.scripts["check:desktop-adaptation"],
    "npm run adapt:desktop -- --prepare --smoke preflight",
  );
});

test("package scripts do not expose the static unpacked webview server", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(packageJson.scripts["launch:unpacked:server"], undefined);
});
