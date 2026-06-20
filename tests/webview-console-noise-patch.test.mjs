import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchWebviewConsoleNoiseAssets,
  patchWebviewConsoleNoiseSource,
} from "../scripts/patch_webview_console_noise.mjs";

const statsigHookSource =
  "function o(){let{client:e,renderVersion:n,isLoading:o}=(0,t.useContext)(a.default),s=(0,t.useMemo)(()=>(0,i.isNoopClient)(e)?(r.Log.warn(`Attempting to retrieve a StatsigClient but none was set.`),i.NoopEvaluationsClient):e,[e,n]),c=[s,n];return s}";

const queryClientSource =
  "refetchQueries(e,t={}){let n={...t,cancelRefetch:t.cancelRefetch??!0},r=h.batch(()=>this.#e.findAll(e).filter(e=>!e.isDisabled()&&!e.isStatic()).map(e=>{let t=e.fetch(void 0,n);return n.throwOnError||(t=t.catch(l)),e.state.fetchStatus===`paused`?Promise.resolve():t}));return Promise.all(r).then(l)}";

const queryFetchSource =
  "async fetch(e,t){if(this.state.fetchStatus!==`idle`&&this.#i?.status()!==`rejected`){if(this.state.data!==void 0&&t?.cancelRefetch)this.cancel({silent:!0});else if(this.#i)return this.#i.continueRetry(),this.#i.promise}return this.#i.promise}";

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

test("console noise patch silences React Query cancelled retryer rejections", () => {
  const patched = patchWebviewConsoleNoiseSource(
    queryFetchSource,
    "app-scope-CWE-zIhQ.js",
  );

  assert.match(
    patched,
    /let e=this\.#i\?\.promise;this\.cancel\(\{silent:!0\}\),e\?\.catch\(\(\)=>\{\}\)/,
  );
  assert.match(
    patched,
    /else if\(this\.#i\)return this\.#i\.continueRetry\(\)/,
  );
});

test("console noise asset patch fails when React Query cancel branch is absent", () => {
  const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-web-assets-"));

  try {
    fs.writeFileSync(
      path.join(assetsDir, "statsig-C09DmQ8J.js"),
      statsigHookSource,
    );
    fs.writeFileSync(
      path.join(assetsDir, "app-scope-CWE-zIhQ.js"),
      "var ge=class extends Error{constructor(e){super(`CancelledError`)}};",
    );

    assert.throws(
      () => patchWebviewConsoleNoiseAssets(assetsDir),
      /Unable to patch React Query silent cancel branch/,
    );
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});
