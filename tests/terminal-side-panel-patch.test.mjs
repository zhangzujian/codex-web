import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findTerminalActionAsset,
  findTerminalSidePanelAsset,
  patchTerminalActionSource,
  patchTerminalSidePanelAsset,
  patchTerminalSidePanelSource,
  patchTerminalSidePanelSupport,
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

const sidePanelActionChunk = [
  'import{a as Bs,i as js,s as Ks}from"./thread-side-panel-tabs-source.js";',
  'import{t as Md}from"./terminal-icon.js";',
  "function tt(){",
  "  let Pe=()=>{js(a,P)&&n?.()};",
  "  let Re=()=>{De(a,r),n?.()};",
  "  return [{id:`terminal`,Icon:Md,onSelect:Re,title:(0,Q.jsx)(T,{id:`thread.sidePanel.newTab.terminal.title`,defaultMessage:`Terminal`})}];",
  "}",
].join("");

test("patchTerminalSidePanelSource replaces the openSessionSandboxSidePanel stub", () => {
  const patched = patchTerminalSidePanelSource(sourceChunk, {
    functionName: "rm",
    openBrowserPanelFunctionName: "Rp",
  });

  assert.match(
    patched,
    /initialUrl:`\$\{globalThis\.location\.origin\}\/__terminal\?cwd=\$\{encodeURIComponent/,
  );
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
  assert.match(patched, /\$\{globalThis\.location\.origin\}\/__terminal\?cwd=/);
});

test("patchTerminalActionSource points Terminal at the side panel opener", () => {
  const patched = patchTerminalActionSource(sidePanelActionChunk, {
    terminalActionFunctionName: "Pe",
  });

  assert.match(patched, /let Re=\(\)=>\{De\(a,r\),n\?\.\(\)\}/);
  assert.match(patched, /id:`terminal`,Icon:Md,onSelect:Pe,title:/);
});

test("findTerminalActionAsset finds the side panel Terminal action importer", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-action-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-source.js"),
    sourceChunk,
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-app-shell-chrome.js"),
    sidePanelActionChunk,
  );

  const result = findTerminalActionAsset(assetsDir, {
    assetPath: path.join(assetsDir, "thread-side-panel-tabs-source.js"),
    functionName: "rm",
  });

  assert.equal(path.basename(result.assetPath), "thread-app-shell-chrome.js");
  assert.equal(result.terminalActionFunctionName, "Pe");
});

test("patchTerminalSidePanelSupport patches the source and Terminal action", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-terminal-support-assets-"),
  );
  fs.writeFileSync(
    path.join(assetsDir, "thread-side-panel-tabs-entry.js"),
    reexportChunk,
  );
  const sourcePath = path.join(assetsDir, "thread-side-panel-tabs-source.js");
  fs.writeFileSync(sourcePath, sourceChunk);
  const actionPath = path.join(assetsDir, "thread-app-shell-chrome.js");
  fs.writeFileSync(actionPath, sidePanelActionChunk);

  const patchedPaths = patchTerminalSidePanelSupport(assetsDir);

  assert.deepEqual(patchedPaths, [sourcePath, actionPath]);
  assert.match(
    fs.readFileSync(sourcePath, "utf8"),
    /\$\{globalThis\.location\.origin\}\/__terminal\?cwd=/,
  );
  assert.match(fs.readFileSync(actionPath, "utf8"), /onSelect:Pe,title:/);
});
