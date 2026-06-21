import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchCopyToClipboardAssetSource,
  patchUserMessageClipboardAssetSource,
  patchUserMessageClipboardAssets,
} from "../scripts/patch_webview_clipboard.mjs";

const copyToClipboardSource =
  "function e(e,t){let{navigator:n}=t?.target?.ownerDocument?.defaultView??window;return new Promise((t,r)=>{if(!n?.clipboard){r(Error(`Clipboard API unavailable`));return}try{if(typeof e!=`string`&&`write`in n.clipboard&&typeof ClipboardItem<`u`&&`supports`in ClipboardItem){let i=new ClipboardItem(Object.fromEntries(Object.entries(e).map(([e,t])=>[e,typeof t==`string`?new Blob([t],{type:e}):t])));n.clipboard.write([i]).then(()=>t(!0),()=>{r(Error(`Failed to copy to clipboard`))})}else{let i=typeof e==`string`?e:e[`text/plain`]??``;n.clipboard.writeText(i).then(()=>t(!0),()=>{r(Error(`Failed to copy to clipboard`))})}}catch{r(Error(`Failed to copy to clipboard`))}})}export{e as t};";
const userMessageAttachmentsSource =
  "de=()=>{S!=null&&w!=null&&oe.submitCodexAnalyticsEvent?.({action:`copy`,eventKind:`action`,metadata:{surface:`user_message`},threadId:S,turnId:w}),navigator.clipboard.writeText(p(V)).then(()=>{ae(!0),setTimeout(()=>ae(!1),1500)})}";
const legacyClipboardHelper =
  "function codexWebWriteTextToClipboard(e){if(globalThis.navigator?.clipboard?.writeText)return globalThis.navigator.clipboard.writeText(e);let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,``),t.style.position=`fixed`,t.style.top=`0`,t.style.left=`0`,t.style.opacity=`0`,document.body.appendChild(t),t.focus(),t.select();try{return document.execCommand(`copy`)?Promise.resolve():Promise.reject(new Error(`Unable to copy text`))}finally{t.remove()}}";

test("user message clipboard patch falls back when the Clipboard API is unavailable", () => {
  const patched = patchUserMessageClipboardAssetSource(
    userMessageAttachmentsSource,
  );

  assert.doesNotMatch(patched, /navigator\.clipboard\.writeText\(p\(V\)\)/);
  assert.match(patched, /codexWebWriteTextToClipboard\(p\(V\)\)/);
  assert.match(patched, /function codexWebWriteTextToClipboard/);
  assert.match(patched, /document\.execCommand\(`copy`\)/);
});

test("user message clipboard patch falls back when the Clipboard API rejects", () => {
  const patched = patchUserMessageClipboardAssetSource(
    userMessageAttachmentsSource,
  );

  assert.match(
    patched,
    /globalThis\.navigator\.clipboard\.writeText\(e\)\.catch\(\(\)=>codexWebExecCommandCopy\(e\)\)/,
  );
});

test("copy-to-clipboard patch falls back to execCommand for code blocks", () => {
  const patched = patchCopyToClipboardAssetSource(copyToClipboardSource);

  assert.match(patched, /function codexWebExecCommandCopy/);
  assert.match(patched, /\.execCommand\(`copy`\)/);
  assert.match(patched, /codexWebCopyPlainText\(/);
  assert.match(
    patched,
    /n\.clipboard\.writeText\(a\)\.then\(\(\)=>t\(!0\),\(\)=>codexWebCopyPlainText\(i,a,t,r\)\)/,
  );
  assert.match(
    patched,
    /if\(!n\?\.clipboard\)\{codexWebCopyPlainText\(i,e,t,r\);return\}/,
  );
});

test("user message clipboard patch upgrades the older helper", () => {
  const patched = patchUserMessageClipboardAssetSource(
    `${legacyClipboardHelper}codexWebWriteTextToClipboard(p(V))`,
  );

  assert.doesNotMatch(
    patched,
    /return globalThis\.navigator\.clipboard\.writeText\(e\);/,
  );
  assert.match(
    patched,
    /globalThis\.navigator\.clipboard\.writeText\(e\)\.catch\(\(\)=>codexWebExecCommandCopy\(e\)\)/,
  );
});

test("user message clipboard asset patch updates the bundled attachments chunk", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-clipboard-"),
  );

  try {
    fs.writeFileSync(
      path.join(assetsDir, "user-message-attachments-test.js"),
      userMessageAttachmentsSource,
    );

    const patchedFiles = patchUserMessageClipboardAssets(assetsDir);

    assert.deepEqual(
      patchedFiles.map((filePath) => path.basename(filePath)),
      ["user-message-attachments-test.js"],
    );
    assert.match(
      fs.readFileSync(
        path.join(assetsDir, "user-message-attachments-test.js"),
        "utf8",
      ),
      /codexWebWriteTextToClipboard\(p\(V\)\)/,
    );
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});
