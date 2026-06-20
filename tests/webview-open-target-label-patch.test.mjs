import assert from "node:assert/strict";
import test from "node:test";

import {
  patchContextMenuMessageValueLabelsSource,
  patchOpenTargetContextMenuLabelsSource,
  patchWorkspaceFileContextMenuLabelsSource,
} from "../scripts/patch_webview_open_target_labels.mjs";

test("context menu patch formats nested message descriptor values", () => {
  const source =
    "function m(e,t){return e.map(e=>{if(e.type===`separator`)return{...e,nativeLabel:``,submenu:void 0};let n=e.submenu?m(e.submenu,t):void 0,r=e.message?t(e.message,e.messageValues):e.id,i=e.tooltipMessage?t(e.tooltipMessage,e.tooltipMessageValues):void 0;return{...e,nativeLabel:r,nativeTooltip:i,submenu:n}})}";

  const patched = patchContextMenuMessageValueLabelsSource(source);

  assert.match(patched, /function codexFormatMessageValues\(/);
  assert.match(
    patched,
    /t\(e\.message,codexFormatMessageValues\(e\.messageValues,t\)\)/,
  );
});

test("open target context menu patch uses localized target labels", () => {
  const source =
    "function e({idPrefix:e,messages:t,onOpenInTarget:n,primaryTarget:r,visibleTargets:i}){return r==null?[]:[{id:`${e}-primary`,message:t.openInTarget,messageValues:{target:r.label},icon:r.icon,onSelect:()=>n(r.target,r.appPath)},{id:`${e}-targets`,message:t.openIn,submenu:i.map(r=>({id:`${e}-target-${r.id}`,message:t.openInTargetSubmenu,messageValues:{target:r.label},icon:r.icon,onSelect:()=>n(r.target,r.appPath)}))}]}export{e as t};";

  const patched = patchOpenTargetContextMenuLabelsSource(source);

  assert.match(patched, /function codexOpenTargetLabel\(/);
  assert.match(patched, /target:codexOpenTargetLabel\(r\)/);
});

test("workspace file context menu patch uses localized submenu labels", () => {
  const source =
    "import{t as d}from\"./open-target-context-menu-items-ClwD6vw2.js\";var g=o({openWithTarget:{id:`markdown.fileReference.openWithTarget`,defaultMessage:`{target}`}});function x(t){return D.push({id:`workspace-file-open-targets`,message:g.openWith,submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:e.label},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))})}export{x as n};\n//# sourceMappingURL=workspace-file-context-menu-BD8jqgos.js.map";

  const patched = patchWorkspaceFileContextMenuLabelsSource(source);

  assert.match(patched, /function codexOpenTargetLabel\(/);
  assert.match(patched, /target:codexOpenTargetLabel\(e\)/);
  assert.match(
    patched,
    /sourceMappingURL=workspace-file-context-menu-BD8jqgos\.js\.map\nfunction codexOpenTargetLabel/,
  );
});

test("workspace file context menu patch repairs helpers appended inside sourcemap comments", () => {
  const source =
    "submenu:E.map(e=>({id:`workspace-file-open-target-${e.id}`,message:g.openWithTarget,messageValues:{target:codexOpenTargetLabel(e)},icon:e.icon,onSelect:()=>j(e.target,e.appPath)}))}\n//# sourceMappingURL=workspace-file-context-menu-BD8jqgos.js.mapfunction codexOpenTargetLabel(e){return e.labelKey===`openTarget.systemDefault`?{id:`codex.openTarget.systemDefault`,defaultMessage:`Default app`,description:`Label for opening a file with the operating system default app`}:e.labelKey===`openTarget.fileManager`?{id:`codex.openTarget.fileManager`,defaultMessage:`File manager`,description:`Label for opening a file with the system file manager`}:e.label}";

  const patched = patchWorkspaceFileContextMenuLabelsSource(source);

  assert.match(
    patched,
    /sourceMappingURL=workspace-file-context-menu-BD8jqgos\.js\.map\nfunction codexOpenTargetLabel/,
  );
});
