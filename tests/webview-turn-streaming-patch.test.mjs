import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchWebviewTurnStreamingAssets,
  patchWebviewTurnStreamingSource,
} from "../scripts/patch_webview_turn_streaming.mjs";

const turnSource = [
  "ne;t[0]!==R||t[1]!==a||t[2]!==L||t[3]!==c||t[4]!==s?(ne=s??A(a,c??Iy,{isBackgroundSubagentsEnabled:R,preserveServerUserMessages:L}),t[0]=R,t[1]=a,t[2]=L,t[3]=c,t[4]=s,t[5]=ne):ne=t[5];let re=ne,",
  "let B=a.status===`in_progress`,V=a.status===`cancelled`,ee=r??n,W=ee==null?void 0:Yy(e,ee),ne=o(Hu,W),re=dt(`3194650870`),ie=tn(),ae=u??ie,se=ie===nn,ce=g&&ae===`STEPS_PROSE`,le=C&&!0,ue=le?(0,Y.jsx)(wv,{conversationId:e,hostId:t,items:a.items,resolvedApps:S}):null,de=In(),fe=(0,X.useMemo)(()=>{let e=a.items;return j?My(e):e},[!1,j,a.items]),{userItems:he,assistantItem:ge,toolOutputItems:_e,systemEventItem:ve,agentItems:ye,automationUpdateItems:be,unifiedDiffItem:G,todoListItem:xe,proposedPlanItem:Se,approvalItem:Ce,userInputItem:we,mcpServerElicitationItems:Te,permissionRequestItems:Ee,postAssistantItems:De,remoteTaskCreatedItems:Oe,personalityChangedItems:ke,forkedFromConversationItems:Ae,modelChangedItems:je,modelReroutedItems:Me}=(0,X.useMemo)(()=>Qa(fe,a.status),[fe,a.status]),Ne=(0,X.useMemo)(()=>{let e=new Map;return fe.forEach((t,n)=>{if(t.type===`user-message`){e.set(t,`${n}:user`);return}t.type===`assistant-message`&&e.set(t,`${n}:assistant`)}),e},[fe]),Pe=(0,X.useMemo)(()=>wy({item:G,projectlessOutputDirectory:_}),[_,G])",
].join("");

const turnComponentSource =
  "var Ny=`var(--conversation-tool-assistant-gap, 8px)`,By=(0,X.memo)(function(e){let t=(0,J.c)(51),ne=A===void 0?!1:A,re=s??U(a,c??Iy,{isBackgroundSubagentsEnabled:L,preserveServerUserMessages:I});let ie=re,foo=1;let pe;return t[16]!==T?(pe=(0,Y.jsx)(Vy,{conversationId:n,hostId:r,turnSearchKey:i,turnId:a.turnId,mcpTurn:a,turn:ie}),t[16]=T,t[50]=pe):pe=t[50],pe});function Vy(){}";

const modernTurnComponentSource =
  "var oVn,sVn=e((()=>{oVn=(0,$4.memo)(function(e){let t=(0,Q4.c)(55),a={turnId:`turn`,status:`complete`},n,r,i,ae,w;let me;return t[16]!==w?(me=(0,e3.jsx)(GBn,{conversationId:n,hostId:r,turnSearchKey:i,turnId:a.turnId,mcpTurn:a,turn:ae}),t[16]=w,t[54]=me):me=t[54],me})}));function n3(){}function after(){}";

const currentModernTurnSource = [
  "var aQ,m7e=e((()=>{",
  "aQ=(0,eQ.memo)(function(e){let t=(0,$Z.c)(55),{conversationId:n,hostId:r,turnSearchKey:i,turn:a,turnState:o,turnRequests:s,preserveServerUserMessages:c,isBackgroundSubagentsEnabled:l}=e,R=c===void 0?!1:c,z=l===void 0?!1:l,te;",
  "t[0]!==z||t[1]!==a||t[2]!==R||t[3]!==s||t[4]!==o?(te=o??or(a,s??f7e,{isBackgroundSubagentsEnabled:z,preserveServerUserMessages:R}),t[0]=z,t[1]=a,t[2]=R,t[3]=s,t[4]=o,t[5]=te):te=t[5];let ne=te;",
  "let de;return t[16]!==w||t[17]!==u?(de=(0,tQ.jsx)(t7e,{conversationId:n,hostId:r,turnSearchKey:i,turnId:a.turnId,mcpTurn:a,turn:ne}),t[16]=w,t[17]=u,t[54]=de):de=t[54],de})}));",
  "function t7e({mcpTurn:i,turn:a,isBackgroundSubagentsEnabled:o=!1,startAfterTurnIntro:A=!1,showFullTranscript:R=!1}){let le=(0,eQ.useMemo)(()=>{let e=o?a.items:a.items.filter(e=>e.type!==`subagent-activity`);return A?$5e(e):e},[o,!1,!1,R,A,a.items]),{userItems:J,assistantItem:ue,subagentActivityItemGroups:ke}=(0,eQ.useMemo)(()=>k5e(le,a.status),[le,a.status]),ze=(0,eQ.useMemo)(()=>{let e=new Map;return le.forEach((t,n)=>{if(t.type===`user-message`){e.set(t,`${n}:user`);return}t.type===`assistant-message`&&e.set(t,`${n}:assistant`)}),e},[le]);return ze}",
  "function oQ(){}",
].join("");

const threadSource = `let L = I,
    R;
  t[5] !== _ ||
  t[29] !== T ||
  t[32] !== E
    ? ((R = (0, $.jsx)(Gt, {
        conversationId: i,
        hostId: o,
        turnSearchKey: k,
        turn: T,
        turnState: E,
        turnRequests: S,
      })),
      (t[5] = _),
      (t[29] = T),
      (t[32] = E),
      (t[33] = R))
    : (R = t[33]);
  let z;`;

const minifiedThreadSource =
  "let L=I,R;t[5]!==_||t[29]!==T||t[32]!==E?(R=(0,$.jsx)(Gt,{conversationId:i,hostId:o,turnSearchKey:k,turn:T,turnState:E,turnRequests:S,preserveServerUserMessages:b}),t[5]=_,t[29]=T,t[32]=E,t[33]=R):R=t[33];let z;";

const currentDirectThreadSource =
  "function Zb({entry:e}){let{conversationId:n,hostId:i,turnSearchKey:O,turn:w,turnState:T,requests:x,preserveServerUserMessages:y}=e;return Y(()=>{}),(0,tx.jsx)(fs,{children:(0,tx.jsx)(Uc,{conversationId:n,hostId:i,turnSearchKey:O,turn:w,turnState:T,turnRequests:x,preserveServerUserMessages:y})})}";

const currentDirectThreadSourceWithMatchingNames = [
  "function unrelated(){let L=I,R;t[36]===c?R=t[37]:(R=ky(c),t[36]=c,t[37]=R);let z=R;return z}",
  "function Zb({entry:e}){let{conversationId:n,hostId:i,turnSearchKey:O,turn:w,turnState:E,requests:S,preserveServerUserMessages:y}=e;return Y(()=>{}),(0,tx.jsx)(fs,{children:(0,tx.jsx)(Uc,{conversationId:n,hostId:i,turnSearchKey:O,turn:w,turnState:E,turnRequests:S,preserveServerUserMessages:y})})}",
].join("");

test("turn streaming patch avoids memoizing mutable turn items", () => {
  const patched = patchWebviewTurnStreamingSource(
    turnSource,
    "local-conversation-turn-DmxvNsqR.js",
  );

  assert.match(patched, /fe=j\?My\(a\.items\):a\.items/);
  assert.match(patched, /\}=Qa\(fe,a\.status\),Ne=\(\(\)=>\{let e=new Map/);
  assert.match(
    patched,
    /ne=s\?\?A\(a,c\?\?Iy,\{isBackgroundSubagentsEnabled:R,preserveServerUserMessages:L\}\);let re=ne/,
  );
  assert.doesNotMatch(patched, /useMemo\)\(\(\)=>\{let e=a\.items/);
  assert.doesNotMatch(patched, /\[fe,a\.status\]/);
  assert.doesNotMatch(patched, /t\[1\]!==a\|\|t\[2\]!==I/);
});

test("turn streaming patch removes outer caches that can reuse stale turn elements", () => {
  const patchedTurn = patchWebviewTurnStreamingSource(
    turnComponentSource,
    "local-conversation-turn-DmxvNsqR.js",
  );
  const patchedThread = patchWebviewTurnStreamingSource(
    threadSource,
    "local-conversation-thread-CGdGhhp8.js",
  );

  assert.match(patchedTurn, /By=function\(e\)\{/);
  assert.match(patchedTurn, /return \(0,Y\.jsx\)\(Vy,\{conversationId:n/);
  assert.doesNotMatch(patchedTurn, /X\.memo/);
  assert.doesNotMatch(patchedTurn, /t\[16\]!==T/);
  assert.match(patchedThread, /R = \(0, \$\.jsx\)\(Gt, \{/);
  assert.doesNotMatch(patchedThread, /t\[29\] !== T/);
  assert.doesNotMatch(patchedThread, /t\[33\]/);
  assert.doesNotThrow(() => new Function(patchedThread));
});

test("turn streaming patch keeps modern turn bundles parseable", () => {
  const patched = patchWebviewTurnStreamingSource(modernTurnComponentSource);

  assert.match(patched, /oVn=function\(e\)\{/);
  assert.match(patched, /return \(0,e3\.jsx\)\(GBn,\{conversationId:n/);
  assert.match(patched, /\}\}\)\);function n3/);
  assert.doesNotThrow(() => new Function(patched));
});

test("turn streaming patch adapts current modern turn bundles", () => {
  const patched = patchWebviewTurnStreamingSource(currentModernTurnSource);

  assert.match(patched, /aQ=function\(e\)\{/);
  assert.match(
    patched,
    /te=o\?\?or\(a,s\?\?f7e,\{isBackgroundSubagentsEnabled:z,preserveServerUserMessages:R\}\);let ne=te/,
  );
  assert.match(patched, /return \(0,tQ\.jsx\)\(t7e,\{conversationId:n/);
  assert.match(
    patched,
    /le=\(\(\)=>\{let e=o\?a\.items:a\.items\.filter\(e=>e\.type!==`subagent-activity`\);return A\?\$5e\(e\):e\}\)\(\)/,
  );
  assert.match(patched, /\}=k5e\(le,a\.status\),ze=\(\(\)=>\{let e=new Map/);
  assert.doesNotThrow(() => new Function(patched));
  assert.equal(patchWebviewTurnStreamingSource(patched), patched);
});

test("turn streaming patch stays idempotent when unrelated memos precede an already patched turn component", () => {
  const patchedOnce = patchWebviewTurnStreamingSource(currentModernTurnSource);
  const source = patchedOnce.replace(
    "aQ=function(e){",
    "TXe=(0,Hq.memo)(function(e){return (0,Hq.jsx)(Hq.Fragment,{children:e.items})});function DXe(){}aQ=function(e){",
  );

  assert.equal(patchWebviewTurnStreamingSource(source), source);
});

test("turn streaming patch removes minified thread turn element cache", () => {
  const patched = patchWebviewTurnStreamingSource(
    minifiedThreadSource,
    "local-conversation-thread-CGdGhhp8.js",
  );

  assert.match(patched, /let L=I,R=\(0,\$\.jsx\)\(Gt,\{/);
  assert.doesNotMatch(patched, /t\[29\]!==T/);
  assert.doesNotMatch(patched, /t\[33\]/);
  assert.doesNotThrow(() => new Function(patched));
});

test("turn streaming patch is idempotent", () => {
  const patchedTurn = patchWebviewTurnStreamingSource(
    turnComponentSource,
    "local-conversation-turn-DmxvNsqR.js",
  );
  const patchedThread = patchWebviewTurnStreamingSource(
    threadSource,
    "local-conversation-thread-CGdGhhp8.js",
  );

  assert.equal(
    patchWebviewTurnStreamingSource(
      patchedTurn,
      "local-conversation-turn-DmxvNsqR.js",
    ),
    patchedTurn,
  );
  assert.equal(
    patchWebviewTurnStreamingSource(
      patchedThread,
      "local-conversation-thread-CGdGhhp8.js",
    ),
    patchedThread,
  );
});

test("turn streaming patch upgrades previous malformed thread element patch", () => {
  const malformedThread = patchWebviewTurnStreamingSource(
    threadSource,
    "local-conversation-thread-CGdGhhp8.js",
  ).replace("});\n  let z;", "};\n  let z;");

  const patched = patchWebviewTurnStreamingSource(
    malformedThread,
    "local-conversation-thread-CGdGhhp8.js",
  );

  assert.match(patched, /R = \(0, \$\.jsx\)\(Gt, \{/);
  assert.match(patched, /\}\);\n  let z;/);
  assert.doesNotThrow(() => new Function(patched));
});

test("turn streaming asset patch accepts current direct thread turn elements", () => {
  const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-web-turn-"));
  try {
    fs.writeFileSync(
      path.join(assetsDir, "app-current-turn.js"),
      currentModernTurnSource,
    );
    fs.writeFileSync(
      path.join(assetsDir, "local-conversation-thread-current.js"),
      currentDirectThreadSource,
    );

    assert.doesNotThrow(() => patchWebviewTurnStreamingAssets(assetsDir));
  } finally {
    fs.rmSync(assetsDir, { recursive: true, force: true });
  }
});

test("turn streaming patch ignores already direct thread turn elements with old marker names", () => {
  assert.doesNotThrow(() =>
    patchWebviewTurnStreamingSource(
      currentDirectThreadSourceWithMatchingNames,
      "local-conversation-thread-current.js",
    ),
  );
});

test("turn streaming asset patch rejects duplicate turn bundle targets", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-turn-dup-"),
  );
  try {
    fs.writeFileSync(
      path.join(assetsDir, "app-current-turn-a.js"),
      currentModernTurnSource,
    );
    fs.writeFileSync(
      path.join(assetsDir, "app-current-turn-b.js"),
      currentModernTurnSource,
    );
    fs.writeFileSync(
      path.join(assetsDir, "local-conversation-thread-current.js"),
      currentDirectThreadSource,
    );

    assert.throws(
      () => patchWebviewTurnStreamingAssets(assetsDir),
      /Expected one local conversation render turn asset/,
    );
  } finally {
    fs.rmSync(assetsDir, { recursive: true, force: true });
  }
});

test("turn streaming asset patch rejects duplicate thread turn element targets", () => {
  const assetsDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "codex-web-turn-dup-"),
  );
  try {
    fs.writeFileSync(
      path.join(assetsDir, "app-current-turn.js"),
      currentModernTurnSource,
    );
    fs.writeFileSync(
      path.join(assetsDir, "local-conversation-thread-a.js"),
      currentDirectThreadSource,
    );
    fs.writeFileSync(
      path.join(assetsDir, "local-conversation-thread-b.js"),
      currentDirectThreadSource,
    );

    assert.throws(
      () => patchWebviewTurnStreamingAssets(assetsDir),
      /Expected one local conversation thread turn element asset/,
    );
  } finally {
    fs.rmSync(assetsDir, { recursive: true, force: true });
  }
});
