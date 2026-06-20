import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertTrackedZhCnPatchKeysStillMissing,
  collectWebviewDefaultMessages,
  patchWebviewI18nAssets,
  patchWebviewI18nSource,
} from "../scripts/patch_webview_i18n.mjs";

const dynamicConfigFactorySource =
  "function a(e,t,n){let i=n?.value??{};return Object.assign(Object.assign({},r(e,t,n,i)),{idType:n?.id_type??null,get:u(e,n?.value)})}e._makeDynamicConfig=a;";
const layerFactorySource =
  "function s(e,t,n,i){return Object.assign(Object.assign({},r(e,t,n,void 0)),{get:u(e,n?.value,i),groupName:n?.group_name??null,__value:n?.value??{}})}e._makeLayer=s;";
const statsigFactorySource = dynamicConfigFactorySource + layerFactorySource;

test("i18n patch makes the Statsig no-op dynamic config enable localized text", () => {
  const patched = patchWebviewI18nSource(
    statsigFactorySource,
    "statsig-C09DmQ8J.js",
  );

  assert.match(patched, /e===`72216192`/);
  assert.match(patched, /enable_i18n:!0/);
  assert.match(patched, /locale_source:i\.locale_source\?\?`IDE`/);
  assert.match(patched, /get:u\(e,i\)/);
});

test("i18n patch makes the Statsig no-op layer enable localized text", () => {
  const patched = patchWebviewI18nSource(
    statsigFactorySource,
    "statsig-C09DmQ8J.js",
  );

  assert.match(patched, /e===`72216192`/);
  assert.match(patched, /enable_i18n:!0/);
  assert.match(patched, /locale_source:a\.locale_source\?\?`IDE`/);
  assert.match(patched, /get:u\(e,a,i\)/);
  assert.match(patched, /__value:a/);
});

test("i18n patch fails when the Statsig dynamic config factory shape changes", () => {
  assert.throws(
    () => patchWebviewI18nSource("function a(){}", "statsig-C09DmQ8J.js"),
    /Unable to patch Statsig dynamic config factory/,
  );
});

test("i18n asset patch fills missing zh-CN messages discovered in webview chunks", () => {
  const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-web-i18n-"));

  try {
    fs.writeFileSync(
      path.join(assetsDir, "statsig-C09DmQ8J.js"),
      statsigFactorySource,
    );
    fs.writeFileSync(
      path.join(assetsDir, "local-conversation-turn.js"),
      [
        "t.formatMessage({id:`localConversation.toolActivitySummary.loadedTools.leading`,defaultMessage:`{count, plural, one {Loaded a tool} other {Loaded # tools}}`})",
        "t.formatMessage({id:`localConversation.toolActivitySummary.loadingTools`,defaultMessage:`{count, plural, one {loading a tool} other {loading # tools}}`})",
        "t.formatMessage({id:`settings.cloudEnvironments.editor.create`,defaultMessage:`Create environment`})",
        "t.formatMessage({id:`downloads.popover.title`,defaultMessage:`Downloads`})",
        "t.formatMessage({\n  id: `threadPage.runAction.environment.create`,\n  defaultMessage: `Create environment`,\n})",
      ].join(";"),
    );
    fs.writeFileSync(
      path.join(assetsDir, "zh-CN-test.js"),
      "var e=`备用`,t={\"existing.key\":`已有`,\"downloads.popover.title\":`上游下载`};export{t as default,e as greeting};",
    );
    const expectedZhCnMissingIds = [
      "localConversation.toolActivitySummary.loadedTools.leading",
      "localConversation.toolActivitySummary.loadingTools",
      "settings.cloudEnvironments.editor.create",
      "threadPage.runAction.environment.create",
    ];

    patchWebviewI18nAssets(assetsDir, { expectedZhCnMissingIds });

    const patchedLocale = fs.readFileSync(
      path.join(assetsDir, "zh-CN-test.js"),
      "utf8",
    );
    assert.match(patchedLocale, /\/\*codex-web-zh-cn-missing-start\*\//);
    assert.doesNotThrow(() =>
      assertTrackedZhCnPatchKeysStillMissing(
        patchedLocale,
        collectWebviewDefaultMessages(assetsDir),
        { expectedZhCnMissingIds },
      ),
    );
    assert.match(
      patchedLocale,
      /"localConversation\.toolActivitySummary\.loadedTools\.leading":`\{count, plural, one \{已加载一个工具\} other \{已加载 # 个工具\}\}`/,
    );
    assert.match(
      patchedLocale,
      /"localConversation\.toolActivitySummary\.loadingTools":`\{count, plural, one \{正在加载一个工具\} other \{正在加载 # 个工具\}\}`/,
    );
    assert.match(
      patchedLocale,
      /"settings\.cloudEnvironments\.editor\.create":`创建环境`/,
    );
    assert.match(
      patchedLocale,
      /"threadPage\.runAction\.environment\.create":`创建环境`/,
    );
    assert.match(patchedLocale, /"downloads\.popover\.title":`上游下载`/);
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});

test("i18n missing-key sentinel fails when upstream provides any tracked zh-CN key", () => {
  const partiallyFixedUpstreamLocale =
    "var e=`备用`,t={\"appgenPage.createMenu.trigger\":`上游创建`,/*codex-web-zh-cn-missing-start*/\"localConversation.toolActivitySummary.loadedTools.leading\":`{count, plural, one {已加载一个工具} other {已加载 # 个工具}}`/*codex-web-zh-cn-missing-end*/};export{t as default,e as greeting};";
  const defaultMessages = new Map([
    ["appgenPage.createMenu.trigger", "Create"],
    [
      "localConversation.toolActivitySummary.loadedTools.leading",
      "{count, plural, one {Loaded a tool} other {Loaded # tools}}",
    ],
  ]);

  assert.throws(
    () =>
      assertTrackedZhCnPatchKeysStillMissing(
        partiallyFixedUpstreamLocale,
        defaultMessages,
        {
          expectedZhCnMissingIds: [
            "appgenPage.createMenu.trigger",
            "localConversation.toolActivitySummary.loadedTools.leading",
          ],
        },
      ),
    /Upstream zh-CN missing key set changed/,
  );
});

test("i18n asset patch fails when upstream provides any tracked zh-CN key", () => {
  const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-web-i18n-"));

  try {
    fs.writeFileSync(
      path.join(assetsDir, "statsig-C09DmQ8J.js"),
      statsigFactorySource,
    );
    fs.writeFileSync(
      path.join(assetsDir, "local-conversation-turn.js"),
      [
        "t.formatMessage({id:`appgenPage.createMenu.trigger`,defaultMessage:`Create`})",
        "t.formatMessage({id:`localConversation.toolActivitySummary.loadedTools.leading`,defaultMessage:`{count, plural, one {Loaded a tool} other {Loaded # tools}}`})",
      ].join(";"),
    );
    fs.writeFileSync(
      path.join(assetsDir, "zh-CN-test.js"),
      "var e=`备用`,t={\"appgenPage.createMenu.trigger\":`上游创建`};export{t as default,e as greeting};",
    );

    assert.throws(
      () =>
        patchWebviewI18nAssets(assetsDir, {
          expectedZhCnMissingIds: [
            "appgenPage.createMenu.trigger",
            "localConversation.toolActivitySummary.loadedTools.leading",
          ],
        }),
      /Upstream zh-CN missing key set changed/,
    );

    const locale = fs.readFileSync(
      path.join(assetsDir, "zh-CN-test.js"),
      "utf8",
    );
    assert.doesNotMatch(
      locale,
      /"localConversation\.toolActivitySummary\.loadedTools\.leading"/,
    );
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});

test("i18n asset patch preserves upstream zh-CN keys while still adding missing keys", () => {
  const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-web-i18n-"));

  try {
    fs.writeFileSync(
      path.join(assetsDir, "statsig-C09DmQ8J.js"),
      statsigFactorySource,
    );
    fs.writeFileSync(
      path.join(assetsDir, "local-conversation-turn.js"),
      [
        "t.formatMessage({id:`downloads.popover.title`,defaultMessage:`Downloads`})",
        "t.formatMessage({id:`localConversation.toolActivitySummary.loadedTools.leading`,defaultMessage:`{count, plural, one {Loaded a tool} other {Loaded # tools}}`})",
      ].join(";"),
    );
    fs.writeFileSync(
      path.join(assetsDir, "zh-CN-test.js"),
      "var e=`备用`,t={\"downloads.popover.title\":`上游下载`};export{t as default,e as greeting};",
    );
    const expectedZhCnMissingIds = [
      "localConversation.toolActivitySummary.loadedTools.leading",
    ];

    patchWebviewI18nAssets(assetsDir, { expectedZhCnMissingIds });

    const patchedLocale = fs.readFileSync(
      path.join(assetsDir, "zh-CN-test.js"),
      "utf8",
    );
    assert.match(
      patchedLocale,
      /"downloads\.popover\.title":`上游下载`/,
    );
    assert.match(
      patchedLocale,
      /"localConversation\.toolActivitySummary\.loadedTools\.leading":`\{count, plural, one \{已加载一个工具\} other \{已加载 # 个工具\}\}`/,
    );
    assert.doesNotThrow(
      () =>
        assertTrackedZhCnPatchKeysStillMissing(
          patchedLocale,
          collectWebviewDefaultMessages(assetsDir),
          { expectedZhCnMissingIds },
        ),
    );
  } finally {
    fs.rmSync(assetsDir, { force: true, recursive: true });
  }
});

test("i18n missing-key sentinel passes while tracked zh-CN keys are still absent", () => {
  const currentUpstreamLocale =
    "var e=`备用`,t={\"existing.key\":`已有`};export{t as default,e as greeting};";
  const defaultMessages = new Map([
    [
      "localConversation.toolActivitySummary.loadedTools.leading",
      "{count, plural, one {Loaded a tool} other {Loaded # tools}}",
    ],
  ]);

  assert.doesNotThrow(() =>
    assertTrackedZhCnPatchKeysStillMissing(
      currentUpstreamLocale,
      defaultMessages,
      {
        expectedZhCnMissingIds: [
          "localConversation.toolActivitySummary.loadedTools.leading",
        ],
      },
    ),
  );
});
