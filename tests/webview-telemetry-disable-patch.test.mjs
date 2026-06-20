import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const patchPath = new URL(
  "../patches/webview-statsig-override-adapter.patch",
  import.meta.url,
);

test("webview Statsig patch disables analytics and network telemetry", async () => {
  const patch = await readFile(patchPath, "utf8");

  assert.match(patch, /\+\s+disableLogging: true,/);
  assert.match(patch, /\+\s+preventAllNetworkTraffic: true,/);
  assert.match(patch, /\+\s+o = false,/);
});
