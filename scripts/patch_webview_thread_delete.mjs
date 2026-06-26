#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DELETE_CONFIRM_DIALOG_NAME = "function codexWebDeleteThreadConfirmDialog";
const DELETE_HELPER_NAME = "function codexWebDeleteThread";
const THREAD_MENU_PATTERN = /^thread-overflow-menu-[\w-]+\.js$/;

function patchModernThreadDeleteMenuSource(source) {
  if (source.includes(DELETE_HELPER_NAME)) {
    return source;
  }

  let patched = source;
  if (source.includes("...B.archiveThread")) {
    const helper =
      "async function codexWebDeleteThread({conversationId:e,hostId:t,onDeleteStart:n,scope:r,intl:i}){if(e==null||!globalThis.confirm(i.formatMessage({id:`threadHeader.deleteThreadConfirm.body`,defaultMessage:`This will permanently remove this chat from Codex.`,description:`Confirmation body for permanently removing a chat`})))return!1;n?.();try{return await E(`send-cli-request-for-host`,{hostId:t??`local`,method:`thread/delete`,params:{threadId:e}}),!0}catch(e){return r.get(ve).danger(i.formatMessage({id:`threadHeader.deleteThreadError`,defaultMessage:`Failed to remove chat`,description:`Error message shown when deleting a local thread fails`})),!1}}";
    patched = patched.replace("function mt(", `${helper}function mt(`);

    if (!patched.includes(DELETE_HELPER_NAME)) {
      throw new Error("Unable to add thread delete helper");
    }

    const archiveItemPattern =
      /\(0,\$\.jsx\)\(k\.Item,\{onSelect:\(\)=>K\(p\),LeftIcon:at,keyboardShortcut:je,children:\(0,\$\.jsx\)\(j,\{\.\.\.B\.archiveThread\}\)\}\),null,/;
    const deleteItem =
      "(0,$.jsx)(k.Item,{onSelect:()=>{codexWebDeleteThread({conversationId:e,hostId:Se,onDeleteStart:f===`home`?()=>{C(`/`,{replace:!0,state:{focusComposerNonce:Date.now(),prefillCwd:i}})}:void 0,scope:g,intl:v})},LeftIcon:at,children:(0,$.jsx)(j,{id:`threadHeader.deleteThread`,defaultMessage:`Remove chat`,description:`Menu item to permanently remove a local thread`})}),null,";
    patched = patched.replace(
      archiveItemPattern,
      (archiveItem) => `${archiveItem}${deleteItem}`,
    );

    if (!patched.includes("id:`threadHeader.deleteThread`")) {
      throw new Error("Unable to add thread delete menu item");
    }

    return patched;
  }

  const helper =
    "async function codexWebDeleteThread({conversationId:e,hostId:t,onDeleteStart:n,scope:r,intl:i}){if(e==null||!globalThis.confirm(i.formatMessage({id:`threadHeader.deleteThreadConfirm.body`,defaultMessage:`This will permanently remove this chat from Codex.`,description:`Confirmation body for permanently removing a chat`})))return!1;n?.();try{return await d(`send-cli-request-for-host`,{hostId:t??`local`,method:`thread/delete`,params:{threadId:e}}),!0}catch(e){return r.get(je).danger(i.formatMessage({id:`threadHeader.deleteThreadError`,defaultMessage:`Failed to remove chat`,description:`Error message shown when deleting a local thread fails`})),!1}}";
  patched = patched.replace("function mt(", `${helper}function mt(`);

  if (!patched.includes(DELETE_HELPER_NAME)) {
    throw new Error("Unable to add thread delete helper");
  }

  const archiveItem =
    "(0,$.jsx)(G.Item,{onSelect:()=>q(g),LeftIcon:Re,keyboardShortcut:R,children:(0,$.jsx)(S,{...N.archiveThread})}),null,";
  const deleteItem =
    "(0,$.jsx)(G.Item,{onSelect:()=>{codexWebDeleteThread({conversationId:e,hostId:F,onDeleteStart:h===`home`?()=>{E(`/`,{replace:!0,state:{focusComposerNonce:Date.now(),prefillCwd:a}})}:void 0,scope:v,intl:y})},LeftIcon:Re,children:(0,$.jsx)(S,{id:`threadHeader.deleteThread`,defaultMessage:`Remove chat`,description:`Menu item to permanently remove a local thread`})}),null,";
  patched = patched.replace(archiveItem, `${archiveItem}${deleteItem}`);

  if (!patched.includes("id:`threadHeader.deleteThread`")) {
    throw new Error("Unable to add thread delete menu item");
  }

  return patched;
}

export function patchThreadDeleteMenuSource(
  source,
  removeIconAssetName = "x-BPQciCub.js",
  dialogLayoutAssetName = "dialog-layout-NIzohiuq.js",
  vscodeApiAssetName = "vscode-api-B8VvwF1m.js",
) {
  if (source.includes("function mt({conversationId:e")) {
    return patchModernThreadDeleteMenuSource(source);
  }

  if (source.includes(DELETE_CONFIRM_DIALOG_NAME)) {
    return source;
  }

  let patched = source.replace(
    /import\{t as \w+\}from"\.\/archive-[^"]+\.js";/,
    (match) =>
      `${match}import{t as codexRemoveProjectIcon}from"./${removeIconAssetName}";import{a as codexDialogBody,d as codexDialogTitle,i as codexDialogHeader,l as codexDialogRoot,n as codexDialogContent,r as codexDialogFooter,u as codexDialogDescription}from"./${dialogLayoutAssetName}";import{f as codexAutomationVscodeApi}from"./${vscodeApiAssetName}";`,
  );

  if (patched === source) {
    throw new Error("Unable to import remove icon for thread delete menu");
  }

  const threadActionsImportPattern =
    /import\{a as \w+,i as \w+,r as \w+\}from"\.\/thread-actions-[^"]+\.js";/;
  const helper = [
    "async function codexWebDeleteThread({conversationId:e,hostId:t,onDeleteStart:n,scope:r,intl:i}){if(e==null)return!1;n?.();try{return await s(`send-cli-request-for-host`,{hostId:t??`local`,method:`thread/delete`,params:{threadId:e}}),codexAutomationVscodeApi.dispatchMessage(`inbox-automation-run-delete-by-thread`,{threadId:e}),!0}catch(e){return r.get(oe).danger(i.formatMessage({id:`threadHeader.deleteThreadError`,defaultMessage:`Failed to remove chat`,description:`Error message shown when deleting a local thread fails`})),!1}}",
    "function codexWebDeleteThreadConfirmDialog({open:e,onOpenChange:t,onConfirm:n,isRemoving:r}){if(!e)return null;let i=e=>{!e&&!r&&t(!1)},a=e=>{e.preventDefault(),n()},o=()=>t(!1);return(0,b.jsx)(codexDialogRoot,{open:!0,onOpenChange:i,size:`compact`,children:(0,b.jsxs)(codexDialogContent,{as:`form`,onSubmit:a,children:[(0,b.jsx)(codexDialogBody,{children:(0,b.jsx)(codexDialogHeader,{title:(0,b.jsx)(codexDialogTitle,{className:`contents`,children:(0,b.jsx)(h,{id:`threadHeader.deleteThreadConfirm.title`,defaultMessage:`Remove chat?`,description:`Confirmation title for permanently removing a chat`})}),subtitle:(0,b.jsx)(codexDialogDescription,{className:`contents`,children:(0,b.jsx)(h,{id:`threadHeader.deleteThreadConfirm.body`,defaultMessage:`This will permanently remove this chat from Codex.`,description:`Confirmation body for permanently removing a chat`})})})}),(0,b.jsx)(codexDialogBody,{children:(0,b.jsxs)(codexDialogFooter,{children:[(0,b.jsx)(ae,{color:`ghost`,type:`button`,disabled:r,onClick:o,children:(0,b.jsx)(h,{id:`threadHeader.deleteThreadConfirm.cancel`,defaultMessage:`Cancel`,description:`Cancel button label for removing a chat`})}),(0,b.jsx)(ae,{color:`danger`,type:`submit`,disabled:r,children:r?(0,b.jsx)(h,{id:`threadHeader.deleteThreadConfirm.removing`,defaultMessage:`Removing...`,description:`In-progress button label while removing a chat`}):(0,b.jsx)(h,{id:`threadHeader.deleteThreadConfirm.confirm`,defaultMessage:`Remove`,description:`Confirm button label for removing a chat`})})]})})]})})}",
  ].join("");
  patched = patched.replace(
    threadActionsImportPattern,
    (match) => `${match}${helper}`,
  );

  if (!patched.includes(DELETE_CONFIRM_DIALOG_NAME)) {
    throw new Error("Unable to add thread delete helper");
  }

  patched = patched.replace(
    "[O,pt]=(0,$e.useState)(!1),mt=m(Re),",
    "[O,pt]=(0,$e.useState)(!1),[codexDeleteThreadDialogOpen,codexSetDeleteThreadDialogOpen]=(0,$e.useState)(!1),[codexIsDeletingThread,codexSetIsDeletingThread]=(0,$e.useState)(!1),mt=m(Re),",
  );

  if (!patched.includes("codexDeleteThreadDialogOpen")) {
    throw new Error("Unable to add thread delete dialog state");
  }

  patched = patched.replace(
    "let A=zt,Bt;",
    "let A=zt,codexOpenDeleteThreadDialog=()=>codexSetDeleteThreadDialogOpen(!0),codexConfirmDeleteThread=()=>{codexIsDeletingThread||(codexSetIsDeletingThread(!0),codexWebDeleteThread({conversationId:n,hostId:Ft,onDeleteStart:Ye===`home`?()=>{D(`/`,{replace:!0,state:{focusComposerNonce:Date.now(),prefillCwd:c}})}:void 0,scope:x,intl:S}).then(e=>{e&&codexSetDeleteThreadDialogOpen(!1)}).finally(()=>{codexSetIsDeletingThread(!1)}))},Bt;",
  );

  if (!patched.includes("codexConfirmDeleteThread")) {
    throw new Error("Unable to add thread delete confirm action");
  }

  const itemNeedle =
    "let An;t[112]===Symbol.for(`react.memo_cache_sentinel`)?(An=(0,b.jsx)(_.Separator,{}),t[112]=An):An=t[112];";
  const deleteItem =
    "let codexRemoveThread=(0,b.jsx)(_.Item,{onSelect:codexOpenDeleteThreadDialog,LeftIcon:codexRemoveProjectIcon,children:(0,b.jsx)(h,{id:`threadHeader.deleteThread`,defaultMessage:`Remove chat`,description:`Menu item to permanently remove a local thread`})});";
  patched = patched.replace(itemNeedle, `${deleteItem}${itemNeedle}`);

  if (!patched.includes("let codexRemoveThread=")) {
    throw new Error("Unable to add thread delete menu item");
  }

  const menuPattern =
    /let Q;t\[170\]!==et\|\|t\[171\]!==O\|\|t\[172\]!==N\|\|t\[173\]!==P\|\|t\[174\]!==On\|\|t\[175\]!==L\|\|t\[176\]!==R\|\|t\[177\]!==K\|\|t\[178\]!==q\|\|t\[179\]!==Y\|\|t\[180\]!==X\|\|t\[181\]!==Z\?\(Q=\(0,b\.jsxs\)\(Ee,\{open:O,onOpenChange:pt,triggerButton:N,align:et,contentWidth:`menu`,children:\[P,On,L,An,R,K,q,Y,X,Z\]\}\),t\[170\]=et,t\[171\]=O,t\[172\]=N,t\[173\]=P,t\[174\]=On,t\[175\]=L,t\[176\]=R,t\[177\]=K,t\[178\]=q,t\[179\]=Y,t\[180\]=X,t\[181\]=Z,t\[182\]=Q\):Q=t\[182\];/;
  patched = patched.replace(
    menuPattern,
    "let Q=(0,b.jsxs)(Ee,{open:O,onOpenChange:pt,triggerButton:N,align:et,contentWidth:`menu`,children:[P,On,L,codexRemoveThread,An,R,K,q,Y,X,Z]});",
  );

  if (!patched.includes("children:[P,On,L,codexRemoveThread,An")) {
    throw new Error("Unable to place thread delete item below archive");
  }

  const returnPattern =
    /let Ln;return t\[191\]!==Q\|\|t\[192\]!==In\|\|t\[193\]!==\$\?\(Ln=\(0,b\.jsxs\)\(b\.Fragment,\{children:\[Q,In,\$\]\}\),t\[191\]=Q,t\[192\]=In,t\[193\]=\$,t\[194\]=Ln\):Ln=t\[194\],Ln/;
  patched = patched.replace(
    returnPattern,
    "let codexDeleteThreadDialog=(0,b.jsx)(codexWebDeleteThreadConfirmDialog,{open:codexDeleteThreadDialogOpen,onOpenChange:codexSetDeleteThreadDialogOpen,onConfirm:codexConfirmDeleteThread,isRemoving:codexIsDeletingThread});return(0,b.jsxs)(b.Fragment,{children:[Q,In,$,codexDeleteThreadDialog]})",
  );

  if (!patched.includes("children:[Q,In,$,codexDeleteThreadDialog]")) {
    throw new Error("Unable to render thread delete confirmation dialog");
  }

  return patched;
}

export function patchWebviewThreadDeleteAssets(assetsDir) {
  const assetName = fs
    .readdirSync(assetsDir)
    .find((name) => THREAD_MENU_PATTERN.test(name));

  if (assetName == null) {
    throw new Error("Unable to find thread overflow menu asset");
  }

  const removeIconAssetName = fs
    .readdirSync(assetsDir)
    .find((name) => /^x-[\w-]+\.js$/.test(name));

  const assetPath = path.join(assetsDir, assetName);
  const source = fs.readFileSync(assetPath, "utf8");
  const modernMenu = source.includes("function mt({conversationId:e");

  const vscodeApiAssetName = modernMenu
    ? null
    : fs.readdirSync(assetsDir).find((name) =>
        /^vscode-api-[\w-]+\.js$/.test(name),
      );

  if (vscodeApiAssetName == null && !modernMenu) {
    throw new Error("Unable to find vscode api asset");
  }

  const dialogLayoutAssetName = modernMenu
    ? null
    : fs.readdirSync(assetsDir).find((name) =>
        /^dialog-layout-[\w-]+\.js$/.test(name),
      );

  if (dialogLayoutAssetName == null && !modernMenu) {
    throw new Error("Unable to find dialog layout asset");
  }

  const patched = patchThreadDeleteMenuSource(
    source,
    removeIconAssetName,
    dialogLayoutAssetName,
    vscodeApiAssetName,
  );

  if (patched === source) {
    return [];
  }

  fs.writeFileSync(assetPath, patched);
  return [assetPath];
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewThreadDeleteAssets(assetsDir);
  console.log(`Patched thread delete menu in ${patchedFiles.length} asset(s)`);
}
