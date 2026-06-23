import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { patchWebviewThreadDeleteI18nAssets } from "../scripts/patch_webview_thread_delete_i18n.mjs";

test("thread delete i18n patch adds zh-CN strings", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "thread-delete-i18n-"),
  );

  try {
    const localePath = path.join(assetsDir, "zh-CN-test.js");
    fs.writeFileSync(
      localePath,
      'var e=`备用`,t={"threadHeader.copyActions":`复制`};export{t as default,e as greeting};',
    );

    assert.deepEqual(patchWebviewThreadDeleteI18nAssets(assetsDir), [
      localePath,
    ]);

    const patched = fs.readFileSync(localePath, "utf8");
    assert.match(patched, /"threadHeader\.deleteThread":`移除对话`/);
    assert.match(
      patched,
      /"threadHeader\.deleteThreadConfirm\.removing":`正在移除…`/,
    );
    assert.equal(patchWebviewThreadDeleteI18nAssets(assetsDir).length, 0);
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});
