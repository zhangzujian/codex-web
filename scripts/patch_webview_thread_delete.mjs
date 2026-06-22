#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DELETE_CONFIRM_DIALOG_NAME =
  "function codexWebDeleteThreadConfirmDialog";
const THREAD_MENU_PATTERN = /^thread-overflow-menu-[\w-]+\.js$/;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function patchThreadDeleteMenuSource(
  source,
  removeIconAssetName = "x-BPQciCub.js",
) {
  if (source.includes(DELETE_CONFIRM_DIALOG_NAME)) {
    return source;
  }

  let patched = source.replace(
    /import\{t as Ae\}from"\.\/archive-[^"]+\.js";/,
    (match) =>
      `${match}import{t as codexRemoveProjectIcon}from"./${removeIconAssetName}";import{a as codexDialogBody,d as codexDialogTitle,i as codexDialogHeader,l as codexDialogRoot,n as codexDialogContent,r as codexDialogFooter,u as codexDialogDescription}from"./dialog-layout-2m8u9XTF.js";`,
  );

  if (patched === source) {
    throw new Error("Unable to import remove icon for thread delete menu");
  }

  const importNeedle = `import{a as je,i as Me,r as y}from"./thread-actions-B-rJt4eH.js";`;
  const helper = [
    "async function codexWebDeleteThread({conversationId:e,hostId:t,onDeleteStart:n,scope:r,intl:i}){if(e==null)return!1;n?.();try{return await s(`send-cli-request-for-host`,{hostId:t??`local`,method:`thread/delete`,params:{threadId:e}}),!0}catch(e){return r.get(ae).danger(i.formatMessage({id:`threadHeader.deleteThreadError`,defaultMessage:`Failed to remove chat`,description:`Error message shown when deleting a local thread fails`})),!1}}",
    "function codexWebDeleteThreadConfirmDialog({open:e,onOpenChange:t,onConfirm:n,isRemoving:r}){if(!e)return null;let i=e=>{!e&&!r&&t(!1)},a=e=>{e.preventDefault(),n()},o=()=>t(!1);return(0,x.jsx)(codexDialogRoot,{open:!0,onOpenChange:i,size:`compact`,children:(0,x.jsxs)(codexDialogContent,{as:`form`,onSubmit:a,children:[(0,x.jsx)(codexDialogBody,{children:(0,x.jsx)(codexDialogHeader,{title:(0,x.jsx)(codexDialogTitle,{className:`contents`,children:(0,x.jsx)(g,{id:`threadHeader.deleteThreadConfirm.title`,defaultMessage:`Remove chat?`,description:`Confirmation title for permanently removing a chat`})}),subtitle:(0,x.jsx)(codexDialogDescription,{className:`contents`,children:(0,x.jsx)(g,{id:`threadHeader.deleteThreadConfirm.body`,defaultMessage:`This will permanently remove this chat from Codex.`,description:`Confirmation body for permanently removing a chat`})})})}),(0,x.jsx)(codexDialogBody,{children:(0,x.jsxs)(codexDialogFooter,{children:[(0,x.jsx)(ie,{color:`ghost`,type:`button`,disabled:r,onClick:o,children:(0,x.jsx)(g,{id:`threadHeader.deleteThreadConfirm.cancel`,defaultMessage:`Cancel`,description:`Cancel button label for removing a chat`})}),(0,x.jsx)(ie,{color:`danger`,type:`submit`,disabled:r,children:r?(0,x.jsx)(g,{id:`threadHeader.deleteThreadConfirm.removing`,defaultMessage:`Removing…`,description:`In-progress button label while removing a chat`}):(0,x.jsx)(g,{id:`threadHeader.deleteThreadConfirm.confirm`,defaultMessage:`Remove`,description:`Confirm button label for removing a chat`})})]})})]})})}",
  ].join("");
  patched = patched.replace(importNeedle, `${importNeedle}${helper}`);

  if (!patched.includes(DELETE_CONFIRM_DIALOG_NAME)) {
    throw new Error("Unable to add thread delete helper");
  }

  patched = patched.replace(
    "[k,ft]=(0,Qe.useState)(!1),pt=h(Le),",
    "[k,ft]=(0,Qe.useState)(!1),[codexDeleteThreadDialogOpen,codexSetDeleteThreadDialogOpen]=(0,Qe.useState)(!1),[codexIsDeletingThread,codexSetIsDeletingThread]=(0,Qe.useState)(!1),pt=h(Le),",
  );

  if (!patched.includes("codexDeleteThreadDialogOpen")) {
    throw new Error("Unable to add thread delete dialog state");
  }

  patched = patched.replace(
    ";let j=Rt,zt;",
    ";let j=Rt,codexOpenDeleteThreadDialog=()=>codexSetDeleteThreadDialogOpen(!0),codexConfirmDeleteThread=()=>{codexIsDeletingThread||(codexSetIsDeletingThread(!0),codexWebDeleteThread({conversationId:n,hostId:Pt,onDeleteStart:Je===`home`?()=>{O(`/`,{replace:!0,state:{focusComposerNonce:Date.now(),prefillCwd:c}})}:void 0,scope:S,intl:C}).then(e=>{e&&codexSetDeleteThreadDialogOpen(!1)}).finally(()=>{codexSetIsDeletingThread(!1)}))},zt;",
  );

  if (!patched.includes("codexConfirmDeleteThread")) {
    throw new Error("Unable to add thread delete confirm action");
  }

  const itemNeedle =
    "let kn;t[112]===Symbol.for(`react.memo_cache_sentinel`)?(kn=(0,x.jsx)(v.Separator,{}),t[112]=kn):kn=t[112];";
  const deleteItem =
    "let codexRemoveThread=(0,x.jsx)(v.Item,{onSelect:codexOpenDeleteThreadDialog,LeftIcon:codexRemoveProjectIcon,children:(0,x.jsx)(g,{id:`threadHeader.deleteThread`,defaultMessage:`Remove chat`,description:`Menu item to permanently remove a local thread`})});";
  patched = patched.replace(itemNeedle, `${deleteItem}${itemNeedle}`);

  if (!patched.includes("let codexRemoveThread=")) {
    throw new Error("Unable to add thread delete menu item");
  }

  const menuPattern =
    /let Fn;t\[170\]!==\$e\|\|t\[171\]!==k\|\|t\[172\]!==P\|\|t\[173\]!==F\|\|t\[174\]!==Dn\|\|t\[175\]!==R\|\|t\[176\]!==z\|\|t\[177\]!==q\|\|t\[178\]!==J\|\|t\[179\]!==X\|\|t\[180\]!==Z\|\|t\[181\]!==Q\?\(Fn=\(0,x\.jsxs\)\(Te,\{open:k,onOpenChange:ft,triggerButton:P,align:\$e,contentWidth:`menu`,children:\[F,Dn,R,kn,z,q,J,X,Z,Q\]\}\),t\[170\]=\$e,t\[171\]=k,t\[172\]=P,t\[173\]=F,t\[174\]=Dn,t\[175\]=R,t\[176\]=z,t\[177\]=q,t\[178\]=J,t\[179\]=X,t\[180\]=Z,t\[181\]=Q,t\[182\]=Fn\):Fn=t\[182\];/;
  patched = patched.replace(
    menuPattern,
    "let Fn=(0,x.jsxs)(Te,{open:k,onOpenChange:ft,triggerButton:P,align:$e,contentWidth:`menu`,children:[F,Dn,R,codexRemoveThread,kn,z,q,J,X,Z,Q]});",
  );

  if (!patched.includes("children:[F,Dn,R,codexRemoveThread,kn")) {
    throw new Error("Unable to place thread delete item below archive");
  }

  const returnPattern =
    /let Ln;return t\[191\]!==Fn\|\|t\[192\]!==In\|\|t\[193\]!==\$\?\(Ln=\(0,x\.jsxs\)\(x\.Fragment,\{children:\[Fn,In,\$\]\}\),t\[191\]=Fn,t\[192\]=In,t\[193\]=\$,t\[194\]=Ln\):Ln=t\[194\],Ln/;
  patched = patched.replace(
    returnPattern,
    "let codexDeleteThreadDialog=(0,x.jsx)(codexWebDeleteThreadConfirmDialog,{open:codexDeleteThreadDialogOpen,onOpenChange:codexSetDeleteThreadDialogOpen,onConfirm:codexConfirmDeleteThread,isRemoving:codexIsDeletingThread});return(0,x.jsxs)(x.Fragment,{children:[Fn,In,$,codexDeleteThreadDialog]})",
  );

  if (!patched.includes("children:[Fn,In,$,codexDeleteThreadDialog]")) {
    throw new Error("Unable to render thread delete confirmation dialog");
  }

  return patched;
}

export function patchWebviewThreadDeleteAssets(assetsDir) {
  const assetName = fs.readdirSync(assetsDir).find((name) => THREAD_MENU_PATTERN.test(name));

  if (assetName == null) {
    throw new Error("Unable to find thread overflow menu asset");
  }

  const removeIconAssetName = fs
    .readdirSync(assetsDir)
    .find((name) => /^x-[\w-]+\.js$/.test(name));

  if (removeIconAssetName == null) {
    throw new Error("Unable to find project remove icon asset");
  }

  const assetPath = path.join(assetsDir, assetName);
  const source = fs.readFileSync(assetPath, "utf8");
  const patched = patchThreadDeleteMenuSource(source, removeIconAssetName);

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
