#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DYNAMIC_CONFIG_FACTORY =
  "function a(e,t,n){let i=n?.value??{};return Object.assign(Object.assign({},r(e,t,n,i)),{idType:n?.id_type??null,get:u(e,n?.value)})}";
const I18N_DYNAMIC_CONFIG_FACTORY =
  "function a(e,t,n){let i=n?.value??{};e===`72216192`&&(i={...i,enable_i18n:!0,locale_source:i.locale_source??`IDE`});return Object.assign(Object.assign({},r(e,t,n,i)),{idType:n?.id_type??null,get:u(e,i)})}";
const LAYER_FACTORY =
  "function s(e,t,n,i){return Object.assign(Object.assign({},r(e,t,n,void 0)),{get:u(e,n?.value,i),groupName:n?.group_name??null,__value:n?.value??{}})}";
const I18N_LAYER_FACTORY =
  "function s(e,t,n,i){let a=n?.value??{};e===`72216192`&&(a={...a,enable_i18n:!0,locale_source:a.locale_source??`IDE`});return Object.assign(Object.assign({},r(e,t,n,void 0)),{get:u(e,a,i),groupName:n?.group_name??null,__value:a})}";
const LOCALE_EXPORT_PATTERN = /,t=\{([\s\S]*)\};export\{t as default/;
const ZH_CN_LOCALE_PATTERN = /^zh-CN-[\w-]+\.js$/;
const ZH_CN_PATCH_START = "/*codex-web-zh-cn-missing-start*/";
const ZH_CN_PATCH_END = "/*codex-web-zh-cn-missing-end*/";
const EXPECTED_ZH_CN_MISSING_ID_COUNT = 1038;
const EXPECTED_ZH_CN_MISSING_IDS_SHA256 =
  "3ec1587effb6ab4421c5dea92cf88b451cfc5e08931ffd4d2a5b4753092ada81";
const EXPECTED_ZH_CN_MISSING_WITH_BROWSER_ID_COUNT = 1039;
const EXPECTED_ZH_CN_MISSING_WITH_BROWSER_IDS_SHA256 =
  "f5fd046ed80ed80089f0fddba5e5da5cfd1a290deebf4761c569bc562466df3b";
const BROWSER_BUILD_ZH_CN_MISSING_IDS = Object.freeze([
  "codexWeb.terminal.title",
]);

const EXPLICIT_ZH_CN_TRANSLATIONS = new Map(
  Object.entries({
    "localConversation.toolActivitySummary.loadedTools.leading":
      "{count, plural, one {已加载一个工具} other {已加载 # 个工具}}",
    "localConversation.toolActivitySummary.loadedTools":
      "{count, plural, one {已加载一个工具} other {已加载 # 个工具}}",
    "localConversation.toolActivitySummary.loadingTools.leading":
      "{count, plural, one {正在加载一个工具} other {正在加载 # 个工具}}",
    "localConversation.toolActivitySummary.loadingTools":
      "{count, plural, one {正在加载一个工具} other {正在加载 # 个工具}}",
    "codex.diffView.applyPatchError": "无法应用更改",
    "codex.diffView.applyPatchPartialSuccess": "已部分应用更改",
    "codex.diffView.applyPatchSuccess": "已应用更改",
    "codex.openTarget.fileManager": "文件管理器",
    "codex.openTarget.systemDefault": "默认应用",
    "codex.diffView.revertPatchError": "无法还原更改",
    "codex.diffView.revertPatchPartialSuccess": "已部分还原更改",
    "codex.diffView.revertPatchSuccess": "已还原更改",
    "codex.unifiedDiff.reapplyPatchSuccess": "已重新应用更改",
    "codex.unifiedDiff.revertPatchSuccess": "已还原更改",
    "settings.cloudEnvironments.create.action": "创建环境",
    "settings.cloudEnvironments.editor.create": "创建环境",
    "settings.cloudEnvironments.create.title": "创建云环境",
    "settings.cloudEnvironments.create.error": "无法创建云环境",
    "settings.cloudEnvironments.create.success": "已创建云环境",
    "threadPage.runAction.environment.create": "创建环境",
    "threadHeader.deleteThread": "移除对话",
    "threadHeader.deleteThreadError": "无法移除对话",
    "threadHeader.deleteThreadConfirm.title": "移除对话？",
    "threadHeader.deleteThreadConfirm.body": "这会从 Codex 中永久移除该对话。",
    "threadHeader.deleteThreadConfirm.cancel": "取消",
    "threadHeader.deleteThreadConfirm.confirm": "移除",
    "threadHeader.deleteThreadConfirm.removing": "正在移除…",
  }),
);
const TRACKED_ZH_CN_PATCH_IDS = Object.freeze([
  ...EXPLICIT_ZH_CN_TRANSLATIONS.keys(),
]);

const EXACT_ZH_CN_TRANSLATIONS = new Map(
  Object.entries({
    Access: "访问权限",
    Add: "添加",
    "Add variable": "添加变量",
    "Add environment variable": "添加环境变量",
    All: "全部",
    Apps: "应用",
    Archive: "归档",
    "Archive all": "全部归档",
    Back: "返回",
    Browser: "浏览器",
    Cancel: "取消",
    Chat: "聊天",
    Chats: "聊天",
    Close: "关闭",
    "Close preview": "关闭预览",
    Connections: "连接",
    Continue: "继续",
    "Continue chat": "继续聊天",
    Create: "创建",
    "Create document": "创建文档",
    "Create environment": "创建环境",
    "Create image": "创建图像",
    "Create PDF": "创建 PDF",
    "Create presentation": "创建演示文稿",
    "Create site": "创建网站",
    "Create spreadsheet": "创建电子表格",
    "Codex for Chrome": "Codex Chrome 扩展",
    "Data Science": "数据科学",
    "Default app": "默认应用",
    Description: "描述",
    Dismiss: "关闭",
    "Dismiss dictation": "关闭听写",
    Document: "文档",
    Documents: "文档",
    Download: "下载",
    Downloads: "下载",
    Edit: "编辑",
    Engineering: "工程",
    Environment: "环境",
    "Environment description": "环境描述",
    "Environment name": "环境名称",
    "Environment variables": "环境变量",
    Failed: "失败",
    "Failed:": "失败：",
    Files: "文件",
    "Files and chats": "文件和聊天",
    "Files and folders": "文件和文件夹",
    "File manager": "文件管理器",
    Finance: "金融",
    General: "常规",
    Grid: "网格",
    "Grid view": "网格视图",
    Image: "图像",
    Images: "图像",
    Import: "导入",
    Library: "资料库",
    "Library type": "资料库类型",
    "Library view": "资料库视图",
    List: "列表",
    "List view": "列表视图",
    Listening: "正在聆听",
    Loading: "正在加载",
    "Loading preview…": "正在加载预览…",
    "Loading sites…": "正在加载网站…",
    Machine: "机器",
    Marketing: "市场营销",
    Modified: "已修改",
    Name: "名称",
    "No files yet": "还没有文件",
    "No images yet": "还没有图像",
    "No downloads yet": "还没有下载",
    "No projects": "没有项目",
    "No sources": "没有来源",
    "Nothing here yet": "这里还没有内容",
    "Open preview": "打开预览",
    Operations: "运营",
    Other: "其他",
    PDF: "PDF",
    PDFs: "PDF",
    Pause: "暂停",
    Paused: "已暂停",
    Pending: "待处理",
    "Pending:": "待处理：",
    Personal: "个人",
    Pets: "宠物",
    Presentation: "演示文稿",
    Presentations: "演示文稿",
    Private: "私有",
    Project: "项目",
    Projects: "项目",
    Public: "公开",
    Publish: "发布",
    Refresh: "刷新",
    "Refresh library": "刷新资料库",
    Repository: "代码库",
    Resume: "恢复",
    Save: "保存",
    "Save changes": "保存更改",
    Search: "搜索",
    "Search library": "搜索资料库",
    "Select the kind of work you do": "选择你的工作类型",
    Secrets: "密钥",
    Shared: "已共享",
    Sharing: "共享",
    Site: "网站",
    Sites: "网站",
    Spreadsheet: "电子表格",
    Spreadsheets: "电子表格",
    Starting: "正在开始",
    Stop: "停止",
    Stopped: "已停止",
    Student: "学生",
    "Something else": "其他",
    "Try again": "重试",
    Type: "类型",
    "Type to search files or chats": "输入文字以搜索文件或聊天",
    Unarchive: "取消归档",
    Updated: "已更新",
    View: "视图",
    "View PR": "查看 PR",
    Visibility: "可见性",
    Workspace: "工作区",
    "You’re all set": "你已完成设置",
    now: "现在",
    starting: "正在开始",
    "v{version}": "v{version}",
  }),
);

function patchUniqueFactory({
  source,
  original,
  patched,
  missingMessage,
  multipleMessage,
}) {
  if (source.includes(patched)) {
    return source;
  }

  const first = source.indexOf(original);
  if (first === -1) {
    throw new Error(missingMessage);
  }

  const second = source.indexOf(original, first + original.length);
  if (second !== -1) {
    throw new Error(multipleMessage);
  }

  return (
    source.slice(0, first) +
    patched +
    source.slice(first + original.length)
  );
}

export function patchWebviewI18nSource(source, assetName = "") {
  if (!assetName.includes("statsig")) {
    return source;
  }

  let patched = patchUniqueFactory({
    source,
    original: DYNAMIC_CONFIG_FACTORY,
    patched: I18N_DYNAMIC_CONFIG_FACTORY,
    missingMessage: "Unable to patch Statsig dynamic config factory",
    multipleMessage: "Expected one Statsig dynamic config factory, found multiple",
  });

  patched = patchUniqueFactory({
    source: patched,
    original: LAYER_FACTORY,
    patched: I18N_LAYER_FACTORY,
    missingMessage: "Unable to patch Statsig layer factory",
    multipleMessage: "Expected one Statsig layer factory, found multiple",
  });

  return patched;
}

export function patchWebviewI18nAssets(assetsDir, options = {}) {
  const patchedFiles = [];
  let sawStatsigAsset = false;
  let sawI18nFactories = false;

  for (const assetName of fs.readdirSync(assetsDir)) {
    if (!assetName.endsWith(".js") || !assetName.includes("statsig")) {
      continue;
    }

    sawStatsigAsset = true;
    const assetPath = path.join(assetsDir, assetName);
    const source = fs.readFileSync(assetPath, "utf8");
    if (
      !source.includes(DYNAMIC_CONFIG_FACTORY) &&
      !source.includes(I18N_DYNAMIC_CONFIG_FACTORY) &&
      !source.includes(LAYER_FACTORY) &&
      !source.includes(I18N_LAYER_FACTORY)
    ) {
      continue;
    }

    sawI18nFactories = true;
    const patched = patchWebviewI18nSource(source, assetName);

    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
      patchedFiles.push(assetPath);
    }
  }

  for (const assetPath of patchZhCnLocaleAssets(assetsDir, options)) {
    patchedFiles.push(assetPath);
  }

  if (!sawStatsigAsset) {
    throw new Error("Unable to find Statsig asset");
  }
  if (!sawI18nFactories) {
    throw new Error("Unable to patch Statsig i18n factories");
  }

  return patchedFiles;
}

export function collectWebviewDefaultMessages(assetsDir) {
  const messages = new Map();

  for (const assetName of fs.readdirSync(assetsDir)) {
    if (!assetName.endsWith(".js")) {
      continue;
    }

    const source = fs.readFileSync(path.join(assetsDir, assetName), "utf8");
    if (LOCALE_EXPORT_PATTERN.test(source)) {
      continue;
    }

    for (const match of source.matchAll(
      /id\s*:\s*`([^`]+)`\s*,\s*defaultMessage\s*:\s*`([^`]+)`/g,
    )) {
      messages.set(match[1], match[2]);
    }
    for (const match of source.matchAll(
      /defaultMessage\s*:\s*`([^`]+)`\s*,\s*id\s*:\s*`([^`]+)`/g,
    )) {
      messages.set(match[2], match[1]);
    }
  }

  return messages;
}

export function patchZhCnLocaleSource(source, defaultMessages) {
  const sourceWithoutPatchBlocks = removeZhCnPatchBlocks(source);
  const localeMatch = LOCALE_EXPORT_PATTERN.exec(sourceWithoutPatchBlocks);
  if (!localeMatch) {
    throw new Error("Unable to locate zh-CN locale message export");
  }

  const existingKeys = new Set(
    [...localeMatch[1].matchAll(/"([^"]+)"\s*:/g)].map((match) => match[1]),
  );
  const additions = [];

  for (const [id, defaultMessage] of [...defaultMessages.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (existingKeys.has(id)) {
      continue;
    }

    additions.push(
      `${JSON.stringify(id)}:\`${escapeLocaleTemplateValue(
        translateDefaultMessageToZhCn(id, defaultMessage),
      )}\``,
    );
  }

  if (additions.length === 0) {
    return sourceWithoutPatchBlocks;
  }

  const insertion = localeMatch[1].trim().length === 0 ? "" : ",";
  return (
    sourceWithoutPatchBlocks.slice(
      0,
      localeMatch.index + localeMatch[0].indexOf("};export"),
    ) +
    `${insertion}${ZH_CN_PATCH_START}${additions.join(",")}${ZH_CN_PATCH_END}` +
    sourceWithoutPatchBlocks.slice(
      localeMatch.index + localeMatch[0].indexOf("};export"),
    )
  );
}

export function assertTrackedZhCnPatchKeysStillMissing(
  source,
  defaultMessages,
  options = {},
) {
  const missingIds = collectMissingZhCnMessageIds(source, defaultMessages);
  const expectedSignature = expectedZhCnMissingSignature(
    options,
    defaultMessages,
  );
  const actualSignature = zhCnMissingIdsSignature(missingIds);

  if (
    actualSignature.count !== expectedSignature.count ||
    actualSignature.sha256 !== expectedSignature.sha256
  ) {
    throw new Error(
      [
        "Upstream zh-CN missing key set changed:",
        `expected ${expectedSignature.count} key(s) with sha256 ${expectedSignature.sha256},`,
        `found ${actualSignature.count} key(s) with sha256 ${actualSignature.sha256}`,
      ].join(" "),
    );
  }
}

function patchZhCnLocaleAssets(assetsDir, options) {
  const defaultMessages = collectWebviewDefaultMessages(assetsDir);
  if (defaultMessages.size === 0) {
    return [];
  }

  const patchedFiles = [];
  const localeAssetNames = fs
    .readdirSync(assetsDir)
    .filter((assetName) => ZH_CN_LOCALE_PATTERN.test(assetName));

  if (localeAssetNames.length === 0) {
    throw new Error("Unable to find zh-CN locale asset");
  }

  for (const assetName of localeAssetNames) {
    const assetPath = path.join(assetsDir, assetName);
    const source = fs.readFileSync(assetPath, "utf8");
    assertTrackedZhCnPatchKeysStillMissing(source, defaultMessages, options);
    const patched = patchZhCnLocaleSource(source, defaultMessages);

    if (patched !== source) {
      fs.writeFileSync(assetPath, patched);
      patchedFiles.push(assetPath);
    }
  }

  return patchedFiles;
}

function collectMissingZhCnMessageIds(source, defaultMessages) {
  const existingKeys = new Set(
    collectExistingLocaleKeys(removeZhCnPatchBlocks(source)),
  );

  return [...defaultMessages.keys()]
    .filter((id) => !existingKeys.has(id))
    .sort((left, right) => left.localeCompare(right));
}

function expectedZhCnMissingSignature(options, defaultMessages) {
  if (options.expectedZhCnMissingIds != null) {
    return zhCnMissingIdsSignature(options.expectedZhCnMissingIds);
  }

  if (BROWSER_BUILD_ZH_CN_MISSING_IDS.every((id) => defaultMessages.has(id))) {
    return {
      count: EXPECTED_ZH_CN_MISSING_WITH_BROWSER_ID_COUNT,
      sha256: EXPECTED_ZH_CN_MISSING_WITH_BROWSER_IDS_SHA256,
    };
  }

  return {
    count: EXPECTED_ZH_CN_MISSING_ID_COUNT,
    sha256: EXPECTED_ZH_CN_MISSING_IDS_SHA256,
  };
}

function zhCnMissingIdsSignature(ids) {
  const sortedIds = [...ids].sort((left, right) => left.localeCompare(right));
  return {
    count: sortedIds.length,
    sha256: crypto
      .createHash("sha256")
      .update(sortedIds.join("\n"))
      .digest("hex"),
  };
}

function collectExistingLocaleKeys(source) {
  const localeMatch = LOCALE_EXPORT_PATTERN.exec(source);
  if (!localeMatch) {
    throw new Error("Unable to locate locale message export");
  }

  return [...localeMatch[1].matchAll(/"([^"]+)"\s*:/g)].map(
    (match) => match[1],
  );
}

function removeZhCnPatchBlocks(source) {
  return source.replace(
    new RegExp(
      `,*${escapeRegExp(ZH_CN_PATCH_START)}[\\s\\S]*?${escapeRegExp(
        ZH_CN_PATCH_END,
      )}`,
      "g",
    ),
    "",
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function translateDefaultMessageToZhCn(id, defaultMessage) {
  const explicitTranslation = EXPLICIT_ZH_CN_TRANSLATIONS.get(id);
  if (explicitTranslation != null) {
    return explicitTranslation;
  }

  const exactTranslation = EXACT_ZH_CN_TRANSLATIONS.get(defaultMessage);
  if (exactTranslation != null) {
    return exactTranslation;
  }

  if (defaultMessage.includes("plural,")) {
    return translatePluralMessage(defaultMessage);
  }

  return translatePlainMessage(defaultMessage, id);
}

function translatePluralMessage(message) {
  return message.replace(
    /(zero|one|two|few|many|other)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (match, selector, text) =>
      `${selector} {${translatePlainMessage(text.trim(), "")}}`,
  );
}

function translatePlainMessage(message, id) {
  const exactTranslation = EXACT_ZH_CN_TRANSLATIONS.get(message);
  if (exactTranslation != null) {
    return exactTranslation;
  }

  let translated = message;
  const replacements = [
    [/Unable to load/gi, "无法加载"],
    [/Unable to create/gi, "无法创建"],
    [/Unable to delete/gi, "无法删除"],
    [/Unable to save/gi, "无法保存"],
    [/Unable to stop/gi, "无法停止"],
    [/Unable to update/gi, "无法更新"],
    [/Could not/gi, "无法"],
    [/Failed to/gi, "无法"],
    [/Failed/gi, "失败"],
    [/Completed/gi, "已完成"],
    [/Pending/gi, "待处理"],
    [/In progress/gi, "进行中"],
    [/Changes/gi, "更改"],
    [/changes/gi, "更改"],
    [/partially/gi, "部分"],
    [/reapplied/gi, "已重新应用"],
    [/applied/gi, "已应用"],
    [/reverted/gi, "已还原"],
    [/reapply/gi, "重新应用"],
    [/apply/gi, "应用"],
    [/revert/gi, "还原"],
    [/Needs input/gi, "需要输入"],
    [/Snooze/gi, "稍后提醒"],
    [/Remove from list/gi, "从列表中移除"],
    [/Show in Finder/gi, "在 Finder 中显示"],
    [/Downloaded by Codex/gi, "由 Codex 下载"],
    [/Pairing QR code/gi, "配对二维码"],
    [/QR code/gi, "二维码"],
    [/fullscreen/gi, "全屏"],
    [/Loading/gi, "正在加载"],
    [/Searching/gi, "正在搜索"],
    [/Creating/gi, "正在创建"],
    [/Created/gi, "已创建"],
    [/Sending/gi, "正在发送"],
    [/Sent/gi, "已发送"],
    [/Attaching/gi, "正在附加"],
    [/Transcribing/gi, "正在转写"],
    [/Listening/gi, "正在聆听"],
    [/Thinking/gi, "正在思考"],
    [/Connecting/gi, "正在连接"],
    [/Connect/gi, "连接"],
    [/Allow access/gi, "允许访问"],
    [/Allow/gi, "允许"],
    [/Not now/gi, "暂不"],
    [/Get started/gi, "开始使用"],
    [/Skip setup/gi, "跳过设置"],
    [/Keep setting up/gi, "继续设置"],
    [/Go to app/gi, "前往应用"],
    [/Try again/gi, "重试"],
    [/Create/gi, "创建"],
    [/Continue/gi, "继续"],
    [/Open/gi, "打开"],
    [/Close/gi, "关闭"],
    [/Copy/gi, "复制"],
    [/Search/gi, "搜索"],
    [/Refresh/gi, "刷新"],
    [/Archive/gi, "归档"],
    [/Unarchive/gi, "取消归档"],
    [/Delete/gi, "删除"],
    [/Edit/gi, "编辑"],
    [/Save/gi, "保存"],
    [/Cancel/gi, "取消"],
    [/Publish/gi, "发布"],
    [/Import/gi, "导入"],
    [/Document/gi, "文档"],
    [/Spreadsheet/gi, "电子表格"],
    [/Presentation/gi, "演示文稿"],
    [/Image/gi, "图像"],
    [/Preview/gi, "预览"],
    [/Library/gi, "资料库"],
    [/Environment/gi, "环境"],
    [/Variables/gi, "变量"],
    [/Variable/gi, "变量"],
    [/Secrets/gi, "密钥"],
    [/Secret/gi, "密钥"],
    [/Repository/gi, "代码库"],
    [/Workspace/gi, "工作区"],
    [/Browser/gi, "浏览器"],
    [/Files/gi, "文件"],
    [/File/gi, "文件"],
    [/Chats/gi, "聊天"],
    [/Chat/gi, "聊天"],
    [/Tools/gi, "工具"],
    [/Tool/gi, "工具"],
    [/Settings/gi, "设置"],
    [/Action/gi, "操作"],
    [/Actions/gi, "操作"],
    [/Name/gi, "名称"],
    [/Description/gi, "描述"],
    [/Visibility/gi, "可见性"],
    [/Private/gi, "私有"],
    [/Public/gi, "公开"],
    [/Shared/gi, "已共享"],
    [/Sharing/gi, "共享"],
    [/Site/gi, "网站"],
    [/Sites/gi, "网站"],
    [/Folder/gi, "文件夹"],
    [/Run/gi, "运行"],
    [/Runs/gi, "运行"],
    [/Thread/gi, "对话"],
    [/Message/gi, "消息"],
    [/Messages/gi, "消息"],
    [/Downloads/gi, "下载"],
    [/Download/gi, "下载"],
    [/Projects/gi, "项目"],
    [/Project/gi, "项目"],
    [/Sources/gi, "来源"],
    [/Source/gi, "来源"],
    [/Dictation/gi, "听写"],
    [/Landscape/gi, "横向"],
    [/Portrait/gi, "纵向"],
    [/Square/gi, "方形"],
    [/Widescreen/gi, "宽屏"],
  ];

  for (const [pattern, replacement] of replacements) {
    translated = translated.replace(pattern, replacement);
  }

  if (translated !== message) {
    return translated;
  }

  const fallbackSubject = fallbackSubjectFromId(id);
  return fallbackSubject == null ? "界面文本" : `${fallbackSubject}`;
}

function fallbackSubjectFromId(id) {
  if (id.includes("diffView")) return "差异视图";
  if (id.includes("unifiedDiff")) return "统一差异";
  if (id.includes("downloads")) return "下载";
  if (id.includes("onboarding")) return "引导";
  if (id.includes("globalDictation")) return "全局听写";
  if (id.includes("imageSidePanel")) return "图像侧栏";
  if (id.includes("markdown.fileCitation")) return "文件引用";
  if (id.includes("plugins")) return "插件";
  if (id.includes("progressStep")) return "进度";
  if (id.includes("projectsIndex")) return "项目";
  if (id.includes("requestInputPanel")) return "请求输入";
  if (id.includes("skills.appsPage")) return "插件目录";
  if (id.includes("remoteHostedPip")) return "画中画";
  if (id.includes("upsellBanner")) return "使用限制";
  if (id.includes("projectAppearance")) return "项目外观";
  if (id.includes("referralInviteModal")) return "邀请";
  if (id.includes("review.gitActions")) return "Git 操作";
  if (id.includes("codexMobile")) return "移动端设置";
  if (id.includes("codexWeb.terminal")) return "终端";
  if (id.includes("localTaskRow")) return "本地任务";
  if (id.includes("realtimeFeedbackToolCall")) return "实时语音反馈";
  if (id.includes("cloudEnvironments")) return "云环境";
  if (id.includes("localEnvironments")) return "本地环境";
  if (id.includes("automations")) return "自动化";
  if (id.includes("appgenPage")) return "资料库";
  if (id.includes("avatarOverlay")) return "活动";
  if (id.includes("browser")) return "浏览器";
  if (id.includes("command")) return "命令";
  if (id.includes("composer")) return "输入框";
  if (id.includes("settings")) return "设置";
  if (id.includes("thread")) return "对话";
  return null;
}

function escapeLocaleTemplateValue(value) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("${", "\\${");
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(scriptDir, "..");
  const assetsDir =
    process.argv[2] ?? path.join(workspaceRoot, "scratch/asar/webview/assets");
  const patchedFiles = patchWebviewI18nAssets(assetsDir);
  console.log(`Patched webview i18n in ${patchedFiles.length} asset(s)`);
}
