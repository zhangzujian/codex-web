import assert from "node:assert/strict";
import test from "node:test";

import { patchWebviewConsoleNoiseSource } from "../scripts/patch_webview_console_noise.mjs";

const statsigHookSource =
  "function o(){let{client:e,renderVersion:n,isLoading:o}=(0,t.useContext)(a.default),s=(0,t.useMemo)(()=>(0,i.isNoopClient)(e)?(r.Log.warn(`Attempting to retrieve a StatsigClient but none was set.`),i.NoopEvaluationsClient):e,[e,n]),c=[s,n];return s}";

const queryClientSource =
  "refetchQueries(e,t={}){let n={...t,cancelRefetch:t.cancelRefetch??!0},r=h.batch(()=>this.#e.findAll(e).filter(e=>!e.isDisabled()&&!e.isStatic()).map(e=>{let t=e.fetch(void 0,n);return n.throwOnError||(t=t.catch(l)),e.state.fetchStatus===`paused`?Promise.resolve():t}));return Promise.all(r).then(l)}";

test("console noise patch silences missing Statsig client hook warning", () => {
  const patched = patchWebviewConsoleNoiseSource(
    statsigHookSource,
    "statsig-C09DmQ8J.js",
  );

  assert.doesNotMatch(
    patched,
    /Attempting to retrieve a StatsigClient but none was set/,
  );
  assert.match(
    patched,
    /\(0,i\.isNoopClient\)\(e\)\?i\.NoopEvaluationsClient:e/,
  );
});

test("console noise patch does not change React Query refetch behavior", () => {
  const patched = patchWebviewConsoleNoiseSource(
    queryClientSource,
    "app-DdaJlruG.js",
  );

  assert.equal(patched, queryClientSource);
});
