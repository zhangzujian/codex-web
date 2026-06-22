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
  'import{t as Ae}from"./archive-BZrfC04n.js";',
  'import{a as je,i as Me,r as y}from"./thread-actions-B-rJt4eH.js";',
  'var x=n(),Qe=e(t(),1);function $e(e){let t=(0,Ze.c)(195),{conversationId:n,cwd:c,archiveNavigation:se}=e,Je=se===void 0?`home`:se,S=a(le),C=te(),O=ce(),[k,ft]=(0,Qe.useState)(!1),pt=h(Le),Pt=i(d,n),Rt;t[6]!==Je||t[7]!==nt||t[8]!==n||t[9]!==c||t[10]!==O?(Rt=e=>{n!=null&&nt({conversationId:n,source:e,onArchiveStart:Je===`home`?()=>{O(`/`,{replace:!0,state:{focusComposerNonce:Date.now(),prefillCwd:c}})}:void 0})},t[6]=Je,t[7]=nt,t[8]=n,t[9]=c,t[10]=O,t[11]=Rt):Rt=t[11];let j=Rt,zt;if(!n)return null;let R;t[109]!==xt||t[110]!==L?(R=(0,x.jsx)(v.Item,{onSelect:L,LeftIcon:Ae,keyboardShortcut:xt,children:On}),t[109]=xt,t[110]=L,t[111]=R):R=t[111];let kn;t[112]===Symbol.for(`react.memo_cache_sentinel`)?(kn=(0,x.jsx)(v.Separator,{}),t[112]=kn):kn=t[112];let z,q,J,X,Z,Q;let Fn;t[170]!==$e||t[171]!==k||t[172]!==P||t[173]!==F||t[174]!==Dn||t[175]!==R||t[176]!==z||t[177]!==q||t[178]!==J||t[179]!==X||t[180]!==Z||t[181]!==Q?(Fn=(0,x.jsxs)(Te,{open:k,onOpenChange:ft,triggerButton:P,align:$e,contentWidth:`menu`,children:[F,Dn,R,kn,z,q,J,X,Z,Q]}),t[170]=$e,t[171]=k,t[172]=P,t[173]=F,t[174]=Dn,t[175]=R,t[176]=z,t[177]=q,t[178]=J,t[179]=X,t[180]=Z,t[181]=Q,t[182]=Fn):Fn=t[182];let In,$;let Ln;return t[191]!==Fn||t[192]!==In||t[193]!==$?(Ln=(0,x.jsxs)(x.Fragment,{children:[Fn,In,$]}),t[191]=Fn,t[192]=In,t[193]=$,t[194]=Ln):Ln=t[194],Ln}',
].join("");

test("thread delete patch adds a confirmed remove chat action below archive", () => {
  const patched = patchThreadDeleteMenuSource(
    threadOverflowMenuSource,
    "x-BPQciCub.js",
  );

  assert.match(patched, /from"\.\/x-BPQciCub\.js"/);
  assert.match(patched, /from"\.\/dialog-layout-2m8u9XTF\.js"/);
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
  assert.match(patched, /children:\[F,Dn,R,codexRemoveThread,kn/);
  assert.match(patched, /children:\[Fn,In,\$,codexDeleteThreadDialog\]/);
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
