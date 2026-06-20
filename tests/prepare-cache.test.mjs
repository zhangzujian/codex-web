import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";

const appVersion = "26.616.32156";
const archiveName = `Codex-darwin-arm64-${appVersion}.zip`;

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
