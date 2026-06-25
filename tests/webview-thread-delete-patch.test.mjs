import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchThreadDeleteMenuSource,
  patchWebviewThreadDeleteAssets,
} from "../scripts/patch_webview_thread_delete.mjs";

const threadOverflowMenuSource = [
  'import{t as je}from"./archive-BZrfC04n.js";',
  'import{f as vscodeApi}from"./vscode-api-B8VvwF1m.js";',
  'import{a as Me,i as Ne,r as v}from"./thread-actions-DFoNjmfj.js";',
  "function et(){let t=(0,Qe.c)(195),[O,pt]=(0,$e.useState)(!1),mt=m(Re),zt;let A=zt,Bt;let An;t[112]===Symbol.for(`react.memo_cache_sentinel`)?(An=(0,b.jsx)(_.Separator,{}),t[112]=An):An=t[112];let Q;t[170]!==et||t[171]!==O||t[172]!==N||t[173]!==P||t[174]!==On||t[175]!==L||t[176]!==R||t[177]!==K||t[178]!==q||t[179]!==Y||t[180]!==X||t[181]!==Z?(Q=(0,b.jsxs)(Ee,{open:O,onOpenChange:pt,triggerButton:N,align:et,contentWidth:`menu`,children:[P,On,L,An,R,K,q,Y,X,Z]}),t[170]=et,t[171]=O,t[172]=N,t[173]=P,t[174]=On,t[175]=L,t[176]=R,t[177]=K,t[178]=q,t[179]=Y,t[180]=X,t[181]=Z,t[182]=Q):Q=t[182];let In,$;let Ln;return t[191]!==Q||t[192]!==In||t[193]!==$?(Ln=(0,b.jsxs)(b.Fragment,{children:[Q,In,$]}),t[191]=Q,t[192]=In,t[193]=$,t[194]=Ln):Ln=t[194],Ln}",
].join("");

test("thread delete patch adds a confirmed remove chat action below archive", () => {
  assert.doesNotMatch(
    threadOverflowMenuSource,
    /function codexWebDeleteThreadConfirmDialog/,
  );

  const patched = patchThreadDeleteMenuSource(
    threadOverflowMenuSource,
    "x-BPQciCub.js",
  );

  assert.match(patched, /function codexWebDeleteThreadConfirmDialog/);
  assert.match(patched, /method:`thread\/delete`/);
  assert.match(patched, /inbox-automation-run-delete-by-thread/);
  assert.match(patched, /id:`threadHeader\.deleteThread`/);
  assert.match(patched, /children:\[P,On,L,codexRemoveThread,An/);
});

test("thread delete patch tolerates renamed thread action import aliases", () => {
  const patched = patchThreadDeleteMenuSource(
    threadOverflowMenuSource.replace(
      'import{a as Me,i as Ne,r as v}from"./thread-actions-DFoNjmfj.js";',
      'import{a as Aa,i as Ii,r as messages}from"./thread-actions-renamed.js";',
    ),
    "x-BPQciCub.js",
  );

  assert.match(patched, /function codexWebDeleteThreadConfirmDialog/);
  assert.match(patched, /id:`threadHeader\.deleteThread`/);
});

test("thread delete asset patch locates menu and icon chunks", () => {
  const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "thread-delete-"));

  try {
    fs.writeFileSync(path.join(assetsDir, "x-BPQciCub.js"), "export{};");
    fs.writeFileSync(
      path.join(assetsDir, "vscode-api-B8VvwF1m.js"),
      "export{};",
    );
    fs.writeFileSync(
      path.join(assetsDir, "dialog-layout-NIzohiuq.js"),
      "export{};",
    );
    fs.writeFileSync(
      path.join(assetsDir, "thread-overflow-menu-DhpM07Ze.js"),
      threadOverflowMenuSource,
    );

    assert.deepEqual(patchWebviewThreadDeleteAssets(assetsDir), [
      path.join(assetsDir, "thread-overflow-menu-DhpM07Ze.js"),
    ]);
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});
