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
  'import{a as Me,i as Ne,r as v}from"./thread-actions-DFoNjmfj.js";',
  'function et(){let t=(0,Qe.c)(195),[O,pt]=(0,$e.useState)(!1),mt=m(Re),zt;let A=zt,Bt;let An;t[112]===Symbol.for(`react.memo_cache_sentinel`)?(An=(0,b.jsx)(_.Separator,{}),t[112]=An):An=t[112];let Q;t[170]!==et||t[171]!==O||t[172]!==N||t[173]!==P||t[174]!==On||t[175]!==L||t[176]!==R||t[177]!==K||t[178]!==q||t[179]!==Y||t[180]!==X||t[181]!==Z?(Q=(0,b.jsxs)(Ee,{open:O,onOpenChange:pt,triggerButton:N,align:et,contentWidth:`menu`,children:[P,On,L,An,R,K,q,Y,X,Z]}),t[170]=et,t[171]=O,t[172]=N,t[173]=P,t[174]=On,t[175]=L,t[176]=R,t[177]=K,t[178]=q,t[179]=Y,t[180]=X,t[181]=Z,t[182]=Q):Q=t[182];let In,$;let Ln;return t[191]!==Q||t[192]!==In||t[193]!==$?(Ln=(0,b.jsxs)(b.Fragment,{children:[Q,In,$]}),t[191]=Q,t[192]=In,t[193]=$,t[194]=Ln):Ln=t[194],Ln}',
].join("");

test("thread delete patch adds a confirmed remove chat action below archive", () => {
  const patched = patchThreadDeleteMenuSource(
    threadOverflowMenuSource,
    "x-BPQciCub.js",
  );

  assert.match(patched, /from"\.\/x-BPQciCub\.js"/);
  assert.match(patched, /from"\.\/dialog-layout-NIzohiuq\.js"/);
  assert.match(patched, /function codexWebDeleteThread/);
  assert.match(patched, /function codexWebDeleteThreadConfirmDialog/);
  assert.match(patched, /method:`thread\/delete`/);
  assert.match(patched, /id:`threadHeader\.deleteThread`/);
  assert.match(patched, /id:`threadHeader\.deleteThreadConfirm\.title`/);
  assert.match(patched, /id:`threadHeader\.deleteThreadConfirm\.body`/);
  assert.match(patched, /id:`threadHeader\.deleteThreadConfirm\.cancel`/);
  assert.match(patched, /id:`threadHeader\.deleteThreadConfirm\.confirm`/);
  assert.match(patched, /id:`threadHeader\.deleteThreadConfirm\.removing`/);
  assert.match(patched, /onSelect:codexOpenDeleteThreadDialog/);
  assert.match(patched, /children:\[P,On,L,codexRemoveThread,An/);
  assert.match(patched, /children:\[Q,In,\$,codexDeleteThreadDialog\]/);
});

test("thread delete patch is idempotent", () => {
  const patched = patchThreadDeleteMenuSource(
    threadOverflowMenuSource,
    "x-BPQciCub.js",
  );

  assert.equal(
    patchThreadDeleteMenuSource(patched, "x-BPQciCub.js"),
    patched,
  );
});

test("thread delete asset patch locates menu and project remove icon chunks", () => {
  const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "thread-delete-"));

  try {
    fs.writeFileSync(path.join(assetsDir, "x-BPQciCub.js"), "export{};");
    fs.writeFileSync(
      path.join(assetsDir, "dialog-layout-NIzohiuq.js"),
      "export{};",
    );
    fs.writeFileSync(
      path.join(assetsDir, "thread-overflow-menu-DhpM07Ze.js"),
      threadOverflowMenuSource,
    );

    const patchedFiles = patchWebviewThreadDeleteAssets(assetsDir);

    assert.deepEqual(patchedFiles, [
      path.join(assetsDir, "thread-overflow-menu-DhpM07Ze.js"),
    ]);
    assert.match(
      fs.readFileSync(
        path.join(assetsDir, "thread-overflow-menu-DhpM07Ze.js"),
        "utf8",
      ),
      /threadHeader\.deleteThreadConfirm\.title/,
    );
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});
