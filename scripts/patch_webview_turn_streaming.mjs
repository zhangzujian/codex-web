#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RENDER_TURN_MEMO =
  "ne;t[0]!==R||t[1]!==a||t[2]!==L||t[3]!==c||t[4]!==s?(ne=s??A(a,c??Iy,{isBackgroundSubagentsEnabled:R,preserveServerUserMessages:L}),t[0]=R,t[1]=a,t[2]=L,t[3]=c,t[4]=s,t[5]=ne):ne=t[5];let re=ne,";
const RENDER_TURN_DIRECT =
  "ne=s??A(a,c??Iy,{isBackgroundSubagentsEnabled:R,preserveServerUserMessages:L});let re=ne,";
const TURN_ITEMS_MEMOS =
  "fe=(0,X.useMemo)(()=>{let e=a.items;return j?My(e):e},[!1,j,a.items]),{userItems:he,assistantItem:ge,toolOutputItems:_e,systemEventItem:ve,agentItems:ye,automationUpdateItems:be,unifiedDiffItem:G,todoListItem:xe,proposedPlanItem:Se,approvalItem:Ce,userInputItem:we,mcpServerElicitationItems:Te,permissionRequestItems:Ee,postAssistantItems:De,remoteTaskCreatedItems:Oe,personalityChangedItems:ke,forkedFromConversationItems:Ae,modelChangedItems:je,modelReroutedItems:Me}=(0,X.useMemo)(()=>Qa(fe,a.status),[fe,a.status]),Ne=(0,X.useMemo)(()=>{let e=new Map;return fe.forEach((t,n)=>{if(t.type===`user-message`){e.set(t,`${n}:user`);return}t.type===`assistant-message`&&e.set(t,`${n}:assistant`)}),e},[fe]),";
const TURN_ITEMS_DIRECT =
  "fe=j?My(a.items):a.items,{userItems:he,assistantItem:ge,toolOutputItems:_e,systemEventItem:ve,agentItems:ye,automationUpdateItems:be,unifiedDiffItem:G,todoListItem:xe,proposedPlanItem:Se,approvalItem:Ce,userInputItem:we,mcpServerElicitationItems:Te,permissionRequestItems:Ee,postAssistantItems:De,remoteTaskCreatedItems:Oe,personalityChangedItems:ke,forkedFromConversationItems:Ae,modelChangedItems:je,modelReroutedItems:Me}=Qa(fe,a.status),Ne=(()=>{let e=new Map;return fe.forEach((t,n)=>{if(t.type===`user-message`){e.set(t,`${n}:user`);return}t.type===`assistant-message`&&e.set(t,`${n}:assistant`)}),e})(),";
const TURN_COMPONENT_MEMO_START = "By=(0,X.memo)(function(e){";
const TURN_COMPONENT_DIRECT_START = "By=function(e){";

export function patchWebviewTurnStreamingSource(source, assetName = "") {
  if (assetName.startsWith("local-conversation-thread-")) {
    return patchThreadTurnElementCache(source);
  }

  if (assetName.startsWith("local-conversation-turn-")) {
    let patched = source;
    const hadTurnComponentMemo = patched.includes(TURN_COMPONENT_MEMO_START);
    patched = replaceOnceIfPresent(
      patched,
      TURN_COMPONENT_MEMO_START,
      TURN_COMPONENT_DIRECT_START,
      "turn component React memo",
    );
    patched = replaceTurnComponentElementCache(patched);
    if (hadTurnComponentMemo) {
      patched = replaceTurnComponentMemoEnd(patched);
    }
    patched = replaceOnceIfPresent(
      patched,
      RENDER_TURN_MEMO,
      RENDER_TURN_DIRECT,
      "render turn memo",
    );
    patched = replaceOnceIfPresent(
      patched,
      TURN_ITEMS_MEMOS,
      TURN_ITEMS_DIRECT,
      "turn items memo",
    );
    return patched;
  }

  return source;
}

export function patchWebviewTurnStreamingAssets(assetsDir) {
  const patchedFiles = [];
  let sawRenderTurnPatch = false;
  let sawTurnItemsPatch = false;
  let sawTurnComponentPatch = false;
  let sawThreadTurnElementPatch = false;

  for (const assetName of fs.readdirSync(assetsDir)) {
    if (!assetName.endsWith(".js")) {
      continue;
    }

    const assetPath = path.join(assetsDir, assetName);
    const source = fs.readFileSync(assetPath, "utf8");
    const patched = patchWebviewTurnStreamingSource(source, assetName);
    sawRenderTurnPatch ||= patched.includes(RENDER_TURN_DIRECT);
    sawTurnItemsPatch ||= patched.includes(TURN_ITEMS_DIRECT);
    sawTurnComponentPatch ||=
      assetName.startsWith("local-conversation-turn-") &&
      patched.includes(TURN_COMPONENT_DIRECT_START);
    sawThreadTurnElementPatch ||=
      assetName.startsWith("local-conversation-thread-") &&
      (patched.includes("let L = I,\n    R = (0, $.jsx)(Gt, {") ||
        patched.includes("let L=I,R=(0,$.jsx)(Gt,{"));

    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
      patchedFiles.push(assetPath);
    }
  }

  if (!sawRenderTurnPatch) {
    throw new Error("Unable to patch local conversation render turn memo");
  }
  if (!sawTurnItemsPatch) {
    throw new Error("Unable to patch local conversation turn items memo");
  }
  if (!sawTurnComponentPatch) {
    throw new Error("Unable to patch local conversation turn component memo");
  }
  if (!sawThreadTurnElementPatch) {
    throw new Error("Unable to patch local conversation thread turn element memo");
  }

  return patchedFiles;
}

function replaceTurnComponentElementCache(source) {
  if (
    source.includes(
      "return (0,Y.jsx)(Vy,{conversationId:n,hostId:r,turnSearchKey:i,turnId:a.turnId,mcpTurn:a,turn:ie",
    )
  ) {
    return source;
  }

  const marker = "turnId:a.turnId,mcpTurn:a,turn:ie";
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    return source;
  }

  const start = source.lastIndexOf("let pe;return", markerIndex);
  if (start === -1) {
    return source;
  }
  const jsxStartMarker = "?(pe=";
  const jsxStart = source.indexOf(jsxStartMarker, start);
  const jsxEnd = source.indexOf(",t[16]=T", jsxStart);
  const blockEnd = source.indexOf("});function Vy", jsxEnd);
  if (jsxStart === -1 || jsxEnd === -1 || blockEnd === -1) {
    throw new Error("Unable to patch local conversation turn element memo");
  }

  const jsx = source.slice(jsxStart + jsxStartMarker.length, jsxEnd);
  return source.slice(0, start) + `return ${jsx}` + source.slice(blockEnd);
}

function replaceTurnComponentMemoEnd(source) {
  const marker = "function Vy";
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    return source;
  }

  const end = source.lastIndexOf("});", markerIndex);
  if (end === -1) {
    return source;
  }
  return source.slice(0, end) + "};" + source.slice(end + "});".length);
}

function patchThreadTurnElementCache(source) {
  const patchedStart = "let L = I,\n    R = (0, $.jsx)(Gt, {";
  if (source.includes(patchedStart)) {
    return fixMalformedThreadTurnElementPatch(source, patchedStart);
  }
  if (source.includes("let L=I,R=(0,$.jsx)(Gt,{")) {
    return source;
  }

  const marker = "turnState: E,\n        turnRequests: S,";
  const markerIndex = source.indexOf(marker);
  if (markerIndex !== -1) {
    return patchFormattedThreadTurnElementCache(source, markerIndex);
  }

  const minifiedMarker = "turnState:E,turnRequests:S,";
  const minifiedMarkerIndex = source.indexOf(minifiedMarker);
  if (minifiedMarkerIndex !== -1) {
    return patchMinifiedThreadTurnElementCache(source, minifiedMarkerIndex);
  }

  return source;
}

function patchFormattedThreadTurnElementCache(source, markerIndex) {
  if (markerIndex === -1) {
    return source;
  }

  const start = source.lastIndexOf("let L = I,\n    R;", markerIndex);
  if (start === -1) {
    return source;
  }
  const jsxStartMarker = "? ((R = ";
  const jsxStart = source.indexOf(jsxStartMarker, start);
  const jsxEnd = source.indexOf(")),\n      (t[5] = _)", jsxStart);
  const blockEnd = source.indexOf("  let z;", jsxEnd);
  if (jsxStart === -1 || jsxEnd === -1 || blockEnd === -1) {
    throw new Error("Unable to patch local conversation thread turn element memo");
  }

  const jsx = source.slice(jsxStart + jsxStartMarker.length, jsxEnd);
  return source.slice(0, start) + `let L = I,\n    R = ${jsx});\n` + source.slice(blockEnd);
}

function patchMinifiedThreadTurnElementCache(source, markerIndex) {
  const start = source.lastIndexOf("let L=I,R;", markerIndex);
  if (start === -1) {
    return source;
  }
  const jsxStartMarker = "?(R=";
  const jsxStart = source.indexOf(jsxStartMarker, start);
  const jsxEnd = source.indexOf(",t[5]=", jsxStart);
  const blockEnd = source.indexOf("let z;", jsxEnd);
  if (jsxStart === -1 || jsxEnd === -1 || blockEnd === -1) {
    throw new Error("Unable to patch local conversation thread turn element memo");
  }

  const jsx = source.slice(jsxStart + jsxStartMarker.length, jsxEnd);
  return source.slice(0, start) + `let L=I,R=${jsx};` + source.slice(blockEnd);
}

function fixMalformedThreadTurnElementPatch(source, patchedStart) {
  const start = source.indexOf(patchedStart);
  const blockEnd = source.indexOf("let z;", start);
  if (blockEnd === -1) {
    return source;
  }

  const closeStart = source.lastIndexOf("};", blockEnd);
  if (closeStart === -1 || source.lastIndexOf("});", blockEnd) > closeStart) {
    return source;
  }

  return source.slice(0, closeStart) + "});" + source.slice(closeStart + 2);
}

function replaceOnceIfPresent(source, before, after, label) {
  if (source.includes(after)) {
    return source;
  }

  const first = source.indexOf(before);
  if (first === -1) {
    return source;
  }
  const second = source.indexOf(before, first + before.length);
  if (second !== -1) {
    throw new Error(`Expected one ${label}, found multiple`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewTurnStreamingAssets(assetsDir);
  console.log(`Patched webview turn streaming in ${patchedFiles.length} asset(s)`);
}
