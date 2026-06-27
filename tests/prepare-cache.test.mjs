import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  hasUpstreamWebviewAssets,
  patchBrowserBuildAssets,
} from "../scripts/patch_browser_build_assets.mjs";

const appVersion = "26.623.41415";
const archiveName = `Codex-darwin-arm64-${appVersion}.zip`;
const appZipPath = `Codex.app/Contents/Resources/app.asar`;
const appZipDir = `Codex.app/Contents/Resources`;
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

async function createStubBin({ curlSource, bashSource, unzipSource }) {
  const stubBin = await mkdtemp(join(tmpdir(), "codex-web-stub-bin-"));
  await writeExecutable(join(stubBin, "curl"), curlSource);
  await writeExecutable(join(stubBin, "bash"), bashSource);
  await writeExecutable(join(stubBin, "unzip"), unzipSource);
  return stubBin;
}

function runPrepare({ cacheDir, stubBin, logPath }) {
  return spawnSync("/usr/bin/bash", ["./scripts/prepare"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      CODEX_APP_CACHE_DIR: cacheDir,
      PREPARE_ASAR_STUB_LOG: logPath,
      PREPARE_UNZIP_STUB_LOG: `${logPath}.unzip`,
      PATH: `${stubBin}:${process.env.PATH}`,
    },
    encoding: "utf8",
  });
}

async function createPrepareAsarFixture() {
  const fixtureDir = await mkdtemp(join(tmpdir(), "codex-web-prepare-asar-"));
  await mkdir(join(fixtureDir, "assets"), { recursive: true });
  await mkdir(join(fixtureDir, "scripts"), { recursive: true });
  await mkdir(join(fixtureDir, "patches"), { recursive: true });
  await writeFile(join(fixtureDir, "assets/favicon.svg"), "<svg />");
  await writeFile(join(fixtureDir, "assets/manifest.json"), "{}");
  await copyFile(
    new URL("../scripts/prepare_asar", import.meta.url),
    join(fixtureDir, "scripts/prepare_asar"),
  );
  await copyFile(
    new URL("../scripts/resolve_codex_app_zip", import.meta.url),
    join(fixtureDir, "scripts/resolve_codex_app_zip"),
  );
  chmodSync(join(fixtureDir, "scripts/prepare_asar"), 0o755);
  chmodSync(join(fixtureDir, "scripts/resolve_codex_app_zip"), 0o755);
  for (const patchName of patchNames) {
    await writeFile(join(fixtureDir, "patches", patchName), "");
  }
  return fixtureDir;
}

test("prepare skips download when cached Codex zip passes integrity check", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "codex-web-cache-"));
  const zipPath = join(cacheDir, archiveName);
  const logPath = join(cacheDir, "prepare-asar.log");
  const zipContents = "cached zip";

  await writeFile(zipPath, zipContents);

  const stubBin = await createStubBin({
    curlSource: `#!/usr/bin/env sh
echo curl-called >> "$PREPARE_ASAR_STUB_LOG"
exit 42
`,
    bashSource: `#!/usr/bin/env sh
printf '%s\\n' "$HOSTED_CODEX_APP_ZIP" > "$PREPARE_ASAR_STUB_LOG"
`,
    unzipSource: `#!/usr/bin/env sh
test "$1" = "-tq"
test "$2" = "$CODEX_APP_CACHE_DIR/${archiveName}"
exit 0
`,
  });

  const result = runPrepare({ cacheDir, stubBin, logPath });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(await readFile(logPath, "utf8"), `${zipPath}\n`);
});

test("prepare downloads missing Codex zip into cache", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "codex-web-cache-"));
  const zipPath = join(cacheDir, archiveName);
  const logPath = join(cacheDir, "prepare-asar.log");
  const unzipLogPath = `${logPath}.unzip`;
  const curlOutputPath = join(cacheDir, "curl-output-path");
  const downloadedContents = "downloaded zip";

  const stubBin = await createStubBin({
    curlSource: `#!/usr/bin/env sh
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      output="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [ "$output" = "$CODEX_APP_CACHE_DIR/${archiveName}.download" ]; then
  echo "shared download path used: $output" >&2
  exit 43
fi
printf '%s' "$output" > '${curlOutputPath}'
printf '%s' '${downloadedContents}' > "$output"
`,
    bashSource: `#!/usr/bin/env sh
printf '%s\\n' "$HOSTED_CODEX_APP_ZIP" > "$PREPARE_ASAR_STUB_LOG"
`,
    unzipSource: `#!/usr/bin/env sh
test "$1" = "-tq"
printf '%s\\n' "$2" >> "$PREPARE_UNZIP_STUB_LOG"
exit 0
`,
  });

  const result = runPrepare({ cacheDir, stubBin, logPath });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const tempZipPath = await readFile(curlOutputPath, "utf8");
  assert.notEqual(tempZipPath, `${zipPath}.download`);
  assert.deepEqual((await readFile(unzipLogPath, "utf8")).trim().split("\n"), [
    tempZipPath,
  ]);
  assert.equal(await readFile(zipPath, "utf8"), downloadedContents);
  assert.equal(await readFile(logPath, "utf8"), `${zipPath}\n`);
  assert.equal((await stat(zipPath)).isFile(), true);
});

test("prepare redownloads cached Codex zip when integrity check fails", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "codex-web-cache-"));
  const zipPath = join(cacheDir, archiveName);
  const logPath = join(cacheDir, "prepare-asar.log");
  const unzipLogPath = `${logPath}.unzip`;
  const curlOutputPath = join(cacheDir, "curl-output-path");
  const downloadedContents = "replacement zip";

  await writeFile(zipPath, "corrupt zip");

  const stubBin = await createStubBin({
    curlSource: `#!/usr/bin/env sh
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o)
      output="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
if [ "$output" = "$CODEX_APP_CACHE_DIR/${archiveName}.download" ]; then
  echo "shared download path used: $output" >&2
  exit 43
fi
printf '%s' "$output" > '${curlOutputPath}'
printf '%s' '${downloadedContents}' > "$output"
`,
    bashSource: `#!/usr/bin/env sh
printf '%s\\n' "$HOSTED_CODEX_APP_ZIP" > "$PREPARE_ASAR_STUB_LOG"
`,
    unzipSource: `#!/usr/bin/env sh
test "$1" = "-tq"
printf '%s\\n' "$2" >> "$PREPARE_UNZIP_STUB_LOG"
if [ "$(cat "$CODEX_APP_CACHE_DIR/unzip-count" 2>/dev/null || printf 0)" = "0" ]; then
  printf 1 > "$CODEX_APP_CACHE_DIR/unzip-count"
  exit 1
fi
exit 0
`,
  });

  const result = runPrepare({ cacheDir, stubBin, logPath });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const tempZipPath = await readFile(curlOutputPath, "utf8");
  assert.notEqual(tempZipPath, `${zipPath}.download`);
  assert.deepEqual((await readFile(unzipLogPath, "utf8")).trim().split("\n"), [
    zipPath,
    tempZipPath,
  ]);
  assert.equal(await readFile(zipPath, "utf8"), downloadedContents);
  assert.equal(await readFile(logPath, "utf8"), `${zipPath}\n`);
});

test("prepare_asar resolves the cached Codex zip when HOSTED_CODEX_APP_ZIP is unset", async () => {
  const fixtureDir = await createPrepareAsarFixture();
  const cacheDir = join(fixtureDir, ".cache/codex-app");
  const zipPath = join(cacheDir, archiveName);
  const logPath = join(fixtureDir, "prepare-asar.log");

  await mkdir(cacheDir, { recursive: true });
  await writeFile(zipPath, "cached zip");
  await mkdir(join(fixtureDir, "scratch/asar/webview/assets"), {
    recursive: true,
  });
  await writeFile(
    join(fixtureDir, "scratch/asar/webview/assets/terminal-page.js"),
    "stale terminal",
  );

  const stubBin = await createStubBin({
    curlSource: `#!/usr/bin/env sh
echo unexpected curl >&2
exit 42
`,
    bashSource: `#!/usr/bin/env sh
exec /usr/bin/bash "$@"
`,
    unzipSource: `#!/usr/bin/env sh
printf 'unzip %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
if [ "$1" = "-o" ]; then
  mkdir -p scratch/${appZipDir}
  printf 'asar' > scratch/${appZipPath}
fi
exit 0
`,
  });
  await writeExecutable(
    join(stubBin, "asar"),
    `#!/usr/bin/env sh
printf 'asar %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
mkdir -p "$3/webview/assets"
mkdir -p "$3/node_modules/better-sqlite3" "$3/node_modules/node-pty"
printf 'icon' > "$3/webview/assets/app-D0g8sCle.png"
printf 'native' > "$3/node_modules/better-sqlite3/native.node"
printf 'native' > "$3/node_modules/node-pty/pty.node"
`,
  );
  for (const command of ["sharp", "prettier", "patch", "node"]) {
    await writeExecutable(
      join(stubBin, command),
      `#!/usr/bin/env sh
printf '${command} %s\\n' "$*" >> "$PREPARE_ASAR_STUB_LOG"
exit 0
`,
    );
  }

  const result = spawnSync("/usr/bin/bash", ["./scripts/prepare_asar"], {
    cwd: fixtureDir,
    env: {
      ...process.env,
      CODEX_APP_CACHE_DIR: cacheDir,
      PREPARE_ASAR_STUB_LOG: logPath,
      PATH: `${stubBin}:${process.env.PATH}`,
      HOSTED_CODEX_APP_ZIP: undefined,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const prepareLog = await readFile(logPath, "utf8");
  assert.match(prepareLog, new RegExp(`unzip -tq ${zipPath}`));
  assert.match(prepareLog, new RegExp(`unzip -o ${zipPath}`));
  assert.match(
    prepareLog,
    /node scripts\/patch_webview_assets\.mjs scratch\/asar\/webview\/assets/,
  );
  assert.match(
    prepareLog,
    /node scripts\/adapt_preload_hook\.mjs scratch\/asar patches\/webview-preload\.patch scratch\/preload-hook-report\.json/,
  );
  assert.ok(
    prepareLog.indexOf("node scripts/adapt_preload_hook.mjs") <
      prepareLog.indexOf("patch --batch --forward --strip 1 --directory scratch/asar"),
  );
  await assert.rejects(
    stat(join(fixtureDir, "scratch/asar/node_modules/node-pty")),
  );
  await assert.rejects(
    stat(join(fixtureDir, "scratch/asar/node_modules/better-sqlite3")),
  );
  await assert.rejects(
    stat(join(fixtureDir, "scratch/asar/webview/assets/terminal-page.js")),
  );
});

test("build:browser uses the browser build asset patch wrapper", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageJson.scripts["build:browser"],
    "vite build --config vite.browser.config.ts && node scripts/patch_browser_build_assets.mjs scratch/asar/webview/assets",
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

test("browser build asset patch skips incomplete upstream webview assets", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "codex-web-browser-assets-"));

  await writeFile(join(assetsDir, "placeholder.js"), "export{};");

  assert.equal(hasUpstreamWebviewAssets(assetsDir), false);
  assert.deepEqual(patchBrowserBuildAssets(assetsDir), []);
});
