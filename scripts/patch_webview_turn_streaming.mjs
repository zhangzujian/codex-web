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
const MODERN_RENDER_TURN_MEMO =
  "ie;t[0]!==z||t[1]!==a||t[2]!==R||t[3]!==s||t[4]!==o?(ie=o??Rs(a,s??nVn,{isBackgroundSubagentsEnabled:z,preserveServerUserMessages:R}),t[0]=z,t[1]=a,t[2]=R,t[3]=s,t[4]=o,t[5]=ie):ie=t[5];let ae=ie,";
const MODERN_RENDER_TURN_DIRECT =
  "ie=o??Rs(a,s??nVn,{isBackgroundSubagentsEnabled:z,preserveServerUserMessages:R});let ae=ie,";
const MODERN_TURN_ITEMS_MEMO =
  "pe=(0,$4.useMemo)(()=>{let e=o?a.items:a.items.filter(e=>e.type!==`subagent-activity`);return M?UBn(e):e},[o,!1,!1,V,M,a.items]),";
const MODERN_TURN_ITEMS_DIRECT =
  "pe=(()=>{let e=o?a.items:a.items.filter(e=>e.type!==`subagent-activity`);return M?UBn(e):e})(),";
const MODERN_TURN_ITEM_GROUPS_MEMO =
  "{userItems:me,assistantItem:he,toolOutputItems:ge,systemEventItem:_e,agentItems:ve,automationUpdateItems:K,unifiedDiffItem:ye,todoListItem:be,proposedPlanItem:xe,approvalItem:Se,userInputItem:Ce,mcpServerElicitationItems:we,permissionRequestItems:Te,postAssistantItems:Ee,remoteTaskCreatedItems:De,personalityChangedItems:Oe,forkedFromConversationItems:ke,modelChangedItems:Ae,modelReroutedItems:je,subagentActivityItemGroups:Me}=(0,$4.useMemo)(()=>_Bn(pe,a.status),[pe,a.status]),";
const MODERN_TURN_ITEM_GROUPS_DIRECT =
  "{userItems:me,assistantItem:he,toolOutputItems:ge,systemEventItem:_e,agentItems:ve,automationUpdateItems:K,unifiedDiffItem:ye,todoListItem:be,proposedPlanItem:xe,approvalItem:Se,userInputItem:Ce,mcpServerElicitationItems:we,permissionRequestItems:Te,postAssistantItems:Ee,remoteTaskCreatedItems:De,personalityChangedItems:Oe,forkedFromConversationItems:ke,modelChangedItems:Ae,modelReroutedItems:je,subagentActivityItemGroups:Me}=_Bn(pe,a.status),";
const MODERN_TURN_ITEM_KEY_MAP_MEMO =
  "He=(0,$4.useMemo)(()=>{let e=new Map;return pe.forEach((t,n)=>{if(t.type===`user-message`){e.set(t,`${n}:user`);return}t.type===`assistant-message`&&e.set(t,`${n}:assistant`)}),e},[pe]),";
const MODERN_TURN_ITEM_KEY_MAP_DIRECT =
  "He=(()=>{let e=new Map;return pe.forEach((t,n)=>{if(t.type===`user-message`){e.set(t,`${n}:user`);return}t.type===`assistant-message`&&e.set(t,`${n}:assistant`)}),e})(),";
const MODERN_TURN_COMPONENT_MEMO_START = "oVn=(0,$4.memo)(function(e){";
const MODERN_TURN_COMPONENT_DIRECT_START = "oVn=function(e){";

export function patchWebviewTurnStreamingSource(source, assetName = "") {
  if (assetName.startsWith("local-conversation-thread-")) {
    return patchThreadTurnElementCache(source);
  }

  if (isModernTurnSource(source)) {
    return patchModernTurnStreamingSource(source);
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
    sawRenderTurnPatch ||= patched.includes(MODERN_RENDER_TURN_DIRECT);
    sawRenderTurnPatch ||=
      /[$A-Za-z_][\w$]*=o\?\?[$A-Za-z_][\w$]*\(a,s\?\?[$A-Za-z_][\w$]*,\{isBackgroundSubagentsEnabled:[$A-Za-z_][\w$]*,preserveServerUserMessages:[$A-Za-z_][\w$]*\}\);let [$A-Za-z_][\w$]*=[$A-Za-z_][\w$]*/.test(
        patched,
      );
    sawTurnItemsPatch ||=
      patched.includes(TURN_ITEMS_DIRECT) ||
      patched.includes(MODERN_TURN_ITEMS_DIRECT) ||
      /[$A-Za-z_][\w$]*=\(\(\)=>\{let e=[$A-Za-z_][\w$]*\?a\.items:a\.items\.filter\(e=>e\.type!==`subagent-activity`\)/.test(
        patched,
      );
    sawTurnComponentPatch ||=
      (assetName.startsWith("local-conversation-turn-") &&
        patched.includes(TURN_COMPONENT_DIRECT_START)) ||
      patched.includes(MODERN_TURN_COMPONENT_DIRECT_START) ||
      /[$A-Za-z_][\w$]*=function\(e\)\{[\s\S]{0,2400}?return \(0,[$A-Za-z_][\w$]*\.jsx\)\([$A-Za-z_][\w$]*,\{conversationId:[\s\S]{0,220}?mcpTurn:a,turn:/.test(
        patched,
      );
    sawThreadTurnElementPatch ||=
      assetName.startsWith("local-conversation-thread-") &&
      (patched.includes("let L = I,\n    R = (0, $.jsx)(Gt, {") ||
        patched.includes("let L=I,R=(0,$.jsx)(Gt,{") ||
        /children:\(0,[$A-Za-z_][\w$]*\.jsx\)\([$A-Za-z_][\w$]*,\{conversationId:[\s\S]{0,240}?turnState:[^,]+,turnRequests:/.test(
          patched,
        ));
    sawThreadTurnElementPatch ||= patched.includes(
      "return (0,e3.jsx)(GBn,{conversationId:n,hostId:r,turnSearchKey:i,turnId:a.turnId,mcpTurn:a,turn:ae",
    );

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

function isModernTurnSource(source) {
  return (
    source.includes(MODERN_TURN_COMPONENT_MEMO_START) ||
    source.includes(MODERN_TURN_COMPONENT_DIRECT_START) ||
    (source.includes("preserveServerUserMessages") &&
      source.includes("mcpTurn:a,turn:") &&
      source.includes("subagentActivityItemGroups"))
  );
}

function patchModernTurnStreamingSource(source) {
  let patched = source;
  const hadTurnComponentMemo = patched.includes(
    MODERN_TURN_COMPONENT_MEMO_START,
  );
  patched = replaceOnceIfPresent(
    patched,
    MODERN_TURN_COMPONENT_MEMO_START,
    MODERN_TURN_COMPONENT_DIRECT_START,
    "modern turn component React memo",
  );
  patched = replaceModernTurnComponentElementCache(patched);
  patched = replaceOnceIfPresent(
    patched,
    MODERN_RENDER_TURN_MEMO,
    MODERN_RENDER_TURN_DIRECT,
    "modern render turn memo",
  );
  patched = replaceOnceIfPresent(
    patched,
    MODERN_TURN_ITEMS_MEMO,
    MODERN_TURN_ITEMS_DIRECT,
    "modern turn items memo",
  );
  patched = replaceOnceIfPresent(
    patched,
    MODERN_TURN_ITEM_GROUPS_MEMO,
    MODERN_TURN_ITEM_GROUPS_DIRECT,
    "modern turn item groups memo",
  );
  patched = replaceOnceIfPresent(
    patched,
    MODERN_TURN_ITEM_KEY_MAP_MEMO,
    MODERN_TURN_ITEM_KEY_MAP_DIRECT,
    "modern turn item key map memo",
  );
  patched = replaceModernTurnComponentMemoStart(patched);
  patched = replaceModernRenderTurnMemo(patched);
  patched = replaceModernTurnComponentElementCacheDynamic(patched);
  patched = replaceModernTurnItemsMemoDynamic(patched);
  patched = replaceModernTurnItemGroupsMemoDynamic(patched);
  patched = replaceModernTurnItemKeyMapMemoDynamic(patched);
  return patched;
}

function replaceModernTurnComponentMemoStart(source) {
  const markerIndex = source.indexOf("mcpTurn:a,turn:");
  if (markerIndex === -1) {
    return source;
  }
  const match = findLastTurnComponentStartBefore(source, markerIndex);
  if (match == null || match.kind === "direct") {
    return source;
  }
  return (
    source.slice(0, match.index) +
    `${match.name}=function(e){` +
    source.slice(match.index + match.text.length)
  );
}

function replaceModernRenderTurnMemo(source) {
  return source.replace(
    /([$A-Za-z_][\w$]*);t\[0\]!==([$A-Za-z_][\w$]*)\|\|t\[1\]!==a\|\|t\[2\]!==([$A-Za-z_][\w$]*)\|\|t\[3\]!==s\|\|t\[4\]!==o\?\(\1=o\?\?([$A-Za-z_][\w$]*)\(a,s\?\?([$A-Za-z_][\w$]*),\{isBackgroundSubagentsEnabled:\2,preserveServerUserMessages:\3\}\),t\[0\]=\2,t\[1\]=a,t\[2\]=\3,t\[3\]=s,t\[4\]=o,t\[5\]=\1\):\1=t\[5\];let ([$A-Za-z_][\w$]*)=\1([,;])/,
    "$1=o??$4(a,s??$5,{isBackgroundSubagentsEnabled:$2,preserveServerUserMessages:$3});let $6=$1$7",
  );
}

function replaceModernTurnComponentElementCacheDynamic(source) {
  if (/return \(0,[$A-Za-z_][\w$]*\.jsx\)\([$A-Za-z_][\w$]*,\{conversationId:[\s\S]{0,160}?mcpTurn:a,turn:/.test(source)) {
    return source;
  }

  const markerIndex = source.indexOf("mcpTurn:a,turn:");
  if (markerIndex === -1) {
    return source;
  }
  const startMatch = findLastMatchBefore(
    source,
    /let ([$A-Za-z_][\w$]*);return/g,
    markerIndex,
  );
  if (startMatch == null) {
    return source;
  }

  const cacheVar = startMatch[1];
  const start = startMatch.index;
  const jsxStartMarker = `?(${cacheVar}=`;
  const jsxStart = source.indexOf(jsxStartMarker, start);
  const jsxEnd = source.indexOf(",t[16]=", jsxStart);
  const memoEnd = source.indexOf("})}));function", jsxEnd);
  if (jsxStart === -1 || jsxEnd === -1 || memoEnd === -1) {
    return source;
  }

  const jsx = source.slice(jsxStart + jsxStartMarker.length, jsxEnd);
  return (
    source.slice(0, start) +
    `return ${jsx}}}));function` +
    source.slice(memoEnd + "})}));function".length)
  );
}

function replaceModernTurnItemsMemoDynamic(source) {
  return source.replace(
    /([$A-Za-z_][\w$]*)=\(0,([$A-Za-z_][\w$]*)\.useMemo\)\(\(\)=>\{let e=([$A-Za-z_][\w$]*)\?a\.items:a\.items\.filter\(e=>e\.type!==`subagent-activity`\);return ([$A-Za-z_][\w$]*)\?([$A-Za-z_][\w$]*)\(e\):e\},\[\3,!1,!1,[$A-Za-z_][\w$]*,\4,a\.items\]\),/,
    "$1=(()=>{let e=$3?a.items:a.items.filter(e=>e.type!==`subagent-activity`);return $4?$5(e):e})(),",
  );
}

function replaceModernTurnItemGroupsMemoDynamic(source) {
  return source.replace(
    /(\{userItems:[\s\S]{0,420}?subagentActivityItemGroups:[$A-Za-z_][\w$]*\})=\(0,[$A-Za-z_][\w$]*\.useMemo\)\(\(\)=>([$A-Za-z_][\w$]*)\(([$A-Za-z_][\w$]*),a\.status\),\[\3,a\.status\]\),/,
    "$1=$2($3,a.status),",
  );
}

function replaceModernTurnItemKeyMapMemoDynamic(source) {
  return source.replace(
    /([$A-Za-z_][\w$]*)=\(0,[$A-Za-z_][\w$]*\.useMemo\)\(\(\)=>\{let e=new Map;return ([$A-Za-z_][\w$]*)\.forEach\(\(t,n\)=>\{if\(t\.type===`user-message`\)\{e\.set\(t,`\$\{n\}:user`\);return\}t\.type===`assistant-message`&&e\.set\(t,`\$\{n\}:assistant`\)\}\),e\},\[\2\]\)([,;])/,
    "$1=(()=>{let e=new Map;return $2.forEach((t,n)=>{if(t.type===`user-message`){e.set(t,`${n}:user`);return}t.type===`assistant-message`&&e.set(t,`${n}:assistant`)}),e})()$3",
  );
}

function replaceModernTurnComponentElementCache(source) {
  source = fixMalformedModernTurnComponentElementPatch(source);
  if (
    source.includes(
      "return (0,e3.jsx)(GBn,{conversationId:n,hostId:r,turnSearchKey:i,turnId:a.turnId,mcpTurn:a,turn:ae",
    )
  ) {
    return source;
  }

  const marker = "turnId:a.turnId,mcpTurn:a,turn:ae";
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    return source;
  }

  const start = source.lastIndexOf("let me;return", markerIndex);
  if (start === -1) {
    return source;
  }
  const jsxStartMarker = "?(me=";
  const jsxStart = source.indexOf(jsxStartMarker, start);
  const jsxEnd = source.indexOf(",t[16]=w", jsxStart);
  const blockEnd = source.indexOf("})}));function", jsxEnd);
  if (jsxStart === -1 || jsxEnd === -1 || blockEnd === -1) {
    throw new Error("Unable to patch modern local conversation turn element memo");
  }

  const jsx = source.slice(jsxStart + jsxStartMarker.length, jsxEnd);
  return (
    source.slice(0, start) +
    "return " +
    jsx +
    "}}));function" +
    source.slice(blockEnd + "})}));function".length)
  );
}

function fixMalformedModernTurnComponentElementPatch(source) {
  const marker =
    "return (0,e3.jsx)(GBn,{conversationId:n,hostId:r,turnSearchKey:i,turnId:a.turnId,mcpTurn:a,turn:ae";
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    return source;
  }

  const malformedEnd = source.indexOf("};function", markerIndex);
  const validEnd = source.indexOf("}));function", markerIndex);
  if (malformedEnd === -1 || (validEnd !== -1 && validEnd < malformedEnd)) {
    return source;
  }

  return (
    source.slice(0, malformedEnd) +
    "}}));function" +
    source.slice(malformedEnd + "};function".length)
  );
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

function findLastMatchBefore(source, pattern, index) {
  let result = null;
  for (const match of source.matchAll(pattern)) {
    if (match.index == null || match.index >= index) {
      break;
    }
    result = match;
  }
  return result;
}

function findLastTurnComponentStartBefore(source, index) {
  let result = null;
  const pattern =
    /([$A-Za-z_][\w$]*)=\(0,([$A-Za-z_][\w$]*)\.memo\)\(function\(e\)\{|([$A-Za-z_][\w$]*)=function\(e\)\{/g;
  for (const match of source.matchAll(pattern)) {
    if (match.index == null || match.index >= index) {
      break;
    }
    result = {
      index: match.index,
      kind: match[1] == null ? "direct" : "memo",
      name: match[1] ?? match[3],
      text: match[0],
    };
  }
  return result;
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
