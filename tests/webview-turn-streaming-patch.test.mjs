import assert from "node:assert/strict";
import test from "node:test";

import { patchWebviewTurnStreamingSource } from "../scripts/patch_webview_turn_streaming.mjs";

const turnSource = [
  "ne;t[0]!==R||t[1]!==a||t[2]!==L||t[3]!==c||t[4]!==s?(ne=s??A(a,c??Iy,{isBackgroundSubagentsEnabled:R,preserveServerUserMessages:L}),t[0]=R,t[1]=a,t[2]=L,t[3]=c,t[4]=s,t[5]=ne):ne=t[5];let re=ne,",
  "let B=a.status===`in_progress`,V=a.status===`cancelled`,ee=r??n,W=ee==null?void 0:Yy(e,ee),ne=o(Hu,W),re=dt(`3194650870`),ie=tn(),ae=u??ie,se=ie===nn,ce=g&&ae===`STEPS_PROSE`,le=C&&!0,ue=le?(0,Y.jsx)(wv,{conversationId:e,hostId:t,items:a.items,resolvedApps:S}):null,de=In(),fe=(0,X.useMemo)(()=>{let e=a.items;return j?My(e):e},[!1,j,a.items]),{userItems:he,assistantItem:ge,toolOutputItems:_e,systemEventItem:ve,agentItems:ye,automationUpdateItems:be,unifiedDiffItem:G,todoListItem:xe,proposedPlanItem:Se,approvalItem:Ce,userInputItem:we,mcpServerElicitationItems:Te,permissionRequestItems:Ee,postAssistantItems:De,remoteTaskCreatedItems:Oe,personalityChangedItems:ke,forkedFromConversationItems:Ae,modelChangedItems:je,modelReroutedItems:Me}=(0,X.useMemo)(()=>Qa(fe,a.status),[fe,a.status]),Ne=(0,X.useMemo)(()=>{let e=new Map;return fe.forEach((t,n)=>{if(t.type===`user-message`){e.set(t,`${n}:user`);return}t.type===`assistant-message`&&e.set(t,`${n}:assistant`)}),e},[fe]),Pe=(0,X.useMemo)(()=>wy({item:G,projectlessOutputDirectory:_}),[_,G])",
].join("");

const turnComponentSource =
  "var Ny=`var(--conversation-tool-assistant-gap, 8px)`,By=(0,X.memo)(function(e){let t=(0,J.c)(51),ne=A===void 0?!1:A,re=s??U(a,c??Iy,{isBackgroundSubagentsEnabled:L,preserveServerUserMessages:I});let ie=re,foo=1;let pe;return t[16]!==T?(pe=(0,Y.jsx)(Vy,{conversationId:n,hostId:r,turnSearchKey:i,turnId:a.turnId,mcpTurn:a,turn:ie}),t[16]=T,t[50]=pe):pe=t[50],pe});function Vy(){}";

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

test("turn streaming patch avoids memoizing mutable turn items", () => {
  const patched = patchWebviewTurnStreamingSource(
    turnSource,
    "local-conversation-turn-DmxvNsqR.js",
  );

  assert.match(patched, /fe=j\?My\(a\.items\):a\.items/);
  assert.match(patched, /\}=Qa\(fe,a\.status\),Ne=\(\(\)=>\{let e=new Map/);
  assert.match(patched, /ne=s\?\?A\(a,c\?\?Iy,\{isBackgroundSubagentsEnabled:R,preserveServerUserMessages:L\}\);let re=ne/);
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
