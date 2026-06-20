import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findTerminalSidePanelAsset,
  patchTerminalSidePanelAsset,
  patchTerminalSidePanelSource,
} from "../scripts/patch_terminal_side_panel.mjs";

const sourceChunk = [
  "function gs(e,t,n){st(e,t,{routeKind:un(e.value.routeKind)})}",
  "function wf(){let a=s(ft),b=l(_r),c=a.value.routeKind===`local-thread`?a.value.conversationId:null;return b}",
  "function zu(){let x=l(Or),h=l(kr),f={cwd:x,hostConfig:h};return f}",
  "function Rp(e,t){return t}",
  "function nm(e,t,n=!0,r=`right`){return t==null||e.value.routeKind,!1}",
  "function rm(e,t,n=!0){return t==null||e.value.routeKind,!1}",
  "export {",
  "  nm as d,",
  "  rm as i,",
  "  Rp as s,",
  "};",
].join("");

const reexportChunk =
  'import{d as n,i,s as u}from"./thread-side-panel-tabs-source.js";export{i as openSessionSandboxSidePanel,n as openThreadBrowserSidePanelTabWithoutAnimation,u as openThreadBrowserSidePanelTabWithPendingState};';

test("patchTerminalSidePanelSource replaces the openSessionSandboxSidePanel stub", () => {
  const patched = patchTerminalSidePanelSource(sourceChunk, {
    functionName: "rm",
    openBrowserPanelFunctionName: "Rp",
  });

  assert.match(patched, /initialUrl:`\/__terminal\?cwd=\$\{encodeURIComponent/);
  assert.match(patched, /initiator:`side_panel_terminal`/);
  assert.match(patched, /cwd:r\?\?void 0/);
  assert.doesNotMatch(
    patched,
    /function rm\(e,t,n=!0\)\{return t==null\|\|e\.value\.routeKind,!1\}/,
  );
});

test("findTerminalSidePanelAsset follows the public re-export to the source chunk", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-side-panel-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-entry.js"),
    reexportChunk,
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-source.js"),
    sourceChunk,
  );

  const result = findTerminalSidePanelAsset(assetsDir);

  assert.equal(
    path.basename(result.assetPath),
    "thread-side-panel-tabs-source.js",
  );
  assert.equal(result.functionName, "rm");
  assert.equal(result.openBrowserPanelFunctionName, "Rp");
});

test("patchTerminalSidePanelAsset patches the discovered source chunk", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-side-panel-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-entry.js"),
    reexportChunk,
  );
  const sourcePath = path.join(assetsDir, "thread-side-panel-tabs-source.js");
  fs.writeFileSync(sourcePath, sourceChunk);

  const patchedPath = patchTerminalSidePanelAsset(assetsDir);
  const patched = fs.readFileSync(sourcePath, "utf8");

  assert.equal(patchedPath, sourcePath);
  assert.match(patched, /\/__terminal\?cwd=/);
});
