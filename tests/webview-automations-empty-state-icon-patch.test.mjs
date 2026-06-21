import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchWebviewAutomationsEmptyStateIconAssets,
  patchWebviewAutomationsEmptyStateIconSource,
} from "../scripts/patch_webview_automations_empty_state_icon.mjs";

const automationsPageSource =
  "function tn(e){let t=(0,Q.c)(30),{isLoading:n,onSelectSuggestedAutomation:r}=e,i=D();if(n)return (0,$.jsxs)(`div`,{children:[(0,$.jsx)(wt,{animation:`automation`,size:`sm`})]});let s;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(s=(0,$.jsx)(wt,{animation:`automation`,showFallbackWhileLoading:!1,size:`fill`}),t[3]=s):s=t[3];let c;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,$.jsx)(k,{id:`inbox.automations.emptyCreateFirst`,defaultMessage:`Create your first automation`}),t[4]=c):c=t[4];return (0,$.jsx)(xt,{className:`min-h-0 flex-1 text-token-foreground`,illustration:s,illustrationSize:`hero`,title:c,titleSize:`lg`})}function rn(e){return null}";

test("Automations empty state icon patch keeps the illustration square", () => {
  const patched =
    patchWebviewAutomationsEmptyStateIconSource(automationsPageSource);

  assert.match(patched, /showFallbackWhileLoading:!1,size:192/);
  assert.doesNotMatch(patched, /showFallbackWhileLoading:!1,size:`fill`/);
  assert.doesNotMatch(patched, /illustrationSize:`hero`/);
  assert.match(patched, /animation:`automation`,size:`sm`/);
  assert.match(patched, /inbox\.automations\.emptyCreateFirst/);
});

test("Automations empty state icon patch is idempotent", () => {
  const once = patchWebviewAutomationsEmptyStateIconSource(
    automationsPageSource,
  );
  const twice = patchWebviewAutomationsEmptyStateIconSource(once);

  assert.equal(twice, once);
});

test("Automations empty state icon patch handles reordered icon props", () => {
  const source =
    "function tn(e){let t=(0,Q.c)(30);let s;t[3]===Symbol.for(`react.memo_cache_sentinel`)?(s=(0,$.jsx)(wt,{animation:`automation`,size:`fill`,showFallbackWhileLoading:!1}),t[3]=s):s=t[3];let c;t[4]===Symbol.for(`react.memo_cache_sentinel`)?(c=(0,$.jsx)(k,{id:`inbox.automations.emptyCreateFirst`,defaultMessage:`Create your first automation`}),t[4]=c):c=t[4];return (0,$.jsx)(xt,{className:`min-h-0 flex-1 text-token-foreground`,illustration:s,title:c,titleSize:`lg`})}function rn(e){return null}";

  const patched = patchWebviewAutomationsEmptyStateIconSource(source);

  assert.match(patched, /showFallbackWhileLoading:!1/);
  assert.match(patched, /size:192/);
  assert.doesNotMatch(patched, /size:`fill`/);
});

test("Automations empty state icon asset patch updates the bundled page chunk", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-automations-empty-state-icon-"),
  );

  try {
    fs.writeFileSync(
      path.join(assetsDir, "automations-page-test.js"),
      automationsPageSource,
    );

    const patchedFiles =
      patchWebviewAutomationsEmptyStateIconAssets(assetsDir);

    assert.deepEqual(
      patchedFiles.map((filePath) => path.basename(filePath)),
      ["automations-page-test.js"],
    );
    const patched = fs.readFileSync(
      path.join(assetsDir, "automations-page-test.js"),
      "utf8",
    );
    assert.match(patched, /showFallbackWhileLoading:!1,size:192/);
    assert.doesNotMatch(patched, /illustrationSize:`hero`/);
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});
