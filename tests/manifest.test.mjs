import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("web app manifest share target declares a valid enctype", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../assets/manifest.json", import.meta.url), "utf8"),
  );

  assert.equal(
    manifest.share_target.enctype,
    "application/x-www-form-urlencoded",
  );
});
