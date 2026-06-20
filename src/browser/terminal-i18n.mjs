const TERMINAL_LOCALES = new Set(["en", "zh-CN"]);

const MESSAGES = {
  en: {
    title: "Terminal",
    "settings.font": "Font settings",
    "settings.theme": "Theme settings",
    "settings.terminal": "Terminal settings",
    "field.theme": "Theme",
    "field.fontFamily": "Font family",
    "field.fontSize": "Font size",
    "field.lineHeight": "Line height",
    "field.letterSpacing": "Letter spacing",
    "field.cursorStyle": "Cursor style",
    "field.cursorBlink": "Cursor blink",
    "field.scrollback": "Scrollback",
    "field.scrollSensitivity": "Scroll sensitivity",
    "field.smoothScrollDuration": "Smooth scroll duration",
    "field.terminalType": "Terminal type",
    "choice.on": "On",
    "choice.off": "Off",
    "choice.theme.system": "System",
    "choice.theme.dark": "Dark",
    "choice.theme.light": "Light",
    "choice.cursor.block": "Block",
    "choice.cursor.underline": "Underline",
    "choice.cursor.bar": "Bar",
    "status.connecting": "Connecting...",
    "status.connected": "Connected",
    "status.disconnected": "Disconnected",
    "status.connectionError": "Connection error",
    "status.exited": "Exited ({reason})",
    "status.unknown": "unknown",
    "status.invalidSettings": "Invalid terminal settings",
    "status.settingsSaved": "Terminal settings saved",
    "status.settingsSavedNewTerminals":
      "Terminal settings saved. Terminal type applies to new terminals.",
    "error.cwdNotDirectory": "Terminal cwd is not a directory: {cwd}",
    "error.invalidCreateMessage": "Invalid terminal create message",
    "error.invalidInputMessage": "Invalid terminal input message",
    "error.invalidResizeMessage": "Invalid terminal resize message",
    "error.unknownMessageType": "Unknown terminal message type",
    "validation.fontFamilyRequired": "Terminal font family is required",
    "validation.fontSizeRange":
      "Terminal font size must be between {min} and {max}",
    "validation.terminalTypeInvalid": "Terminal type is not supported",
    "validation.themeInvalid": "Terminal theme is invalid",
    "validation.lineHeightRange":
      "Terminal line height must be between {min} and {max}",
    "validation.letterSpacingRange":
      "Terminal letter spacing must be between {min} and {max}",
    "validation.cursorStyleInvalid": "Terminal cursor style is invalid",
    "validation.cursorBlinkInvalid":
      "Terminal cursor blink must be true or false",
    "validation.scrollbackIntegerRange":
      "Terminal scrollback must be an integer between {min} and {max}",
    "validation.scrollSensitivityRange":
      "Terminal scroll sensitivity must be between {min} and {max}",
    "validation.smoothScrollDurationIntegerRange":
      "Terminal smooth scroll duration must be an integer between {min} and {max}",
  },
  "zh-CN": {
    title: "终端",
    "settings.font": "字体设置",
    "settings.theme": "主题设置",
    "settings.terminal": "终端设置",
    "field.theme": "主题",
    "field.fontFamily": "字体",
    "field.fontSize": "字号",
    "field.lineHeight": "行高",
    "field.letterSpacing": "字间距",
    "field.cursorStyle": "光标样式",
    "field.cursorBlink": "光标闪烁",
    "field.scrollback": "回滚行数",
    "field.scrollSensitivity": "滚动灵敏度",
    "field.smoothScrollDuration": "平滑滚动时长",
    "field.terminalType": "终端类型",
    "choice.on": "开",
    "choice.off": "关",
    "choice.theme.system": "跟随系统",
    "choice.theme.dark": "深色",
    "choice.theme.light": "浅色",
    "choice.cursor.block": "块",
    "choice.cursor.underline": "下划线",
    "choice.cursor.bar": "竖线",
    "status.connecting": "正在连接...",
    "status.connected": "已连接",
    "status.disconnected": "已断开连接",
    "status.connectionError": "连接错误",
    "status.exited": "已退出 ({reason})",
    "status.unknown": "未知",
    "status.invalidSettings": "终端设置无效",
    "status.settingsSaved": "终端设置已保存",
    "status.settingsSavedNewTerminals":
      "终端设置已保存。终端类型会应用到新终端。",
    "error.cwdNotDirectory": "终端工作目录不是文件夹：{cwd}",
    "error.invalidCreateMessage": "终端创建消息无效",
    "error.invalidInputMessage": "终端输入消息无效",
    "error.invalidResizeMessage": "终端大小调整消息无效",
    "error.unknownMessageType": "未知终端消息类型",
    "validation.fontFamilyRequired": "终端字体不能为空",
    "validation.fontSizeRange": "终端字体大小必须在 {min} 到 {max} 之间",
    "validation.terminalTypeInvalid": "不支持该终端类型",
    "validation.themeInvalid": "终端主题无效",
    "validation.lineHeightRange": "终端行高必须在 {min} 到 {max} 之间",
    "validation.letterSpacingRange": "终端字间距必须在 {min} 到 {max} 之间",
    "validation.cursorStyleInvalid": "终端光标样式无效",
    "validation.cursorBlinkInvalid": "终端光标闪烁必须为 true 或 false",
    "validation.scrollbackIntegerRange":
      "终端回滚行数必须是 {min} 到 {max} 之间的整数",
    "validation.scrollSensitivityRange":
      "终端滚动灵敏度必须在 {min} 到 {max} 之间",
    "validation.smoothScrollDurationIntegerRange":
      "终端平滑滚动时长必须是 {min} 到 {max} 之间的整数",
  },
};

const STORAGE_LOCALE_KEYS = [
  "codex-web.locale",
  "codex-web.app.locale",
  "codex-web.appLanguage",
  "codex.locale",
  "app.locale",
  "locale",
  "language",
];

export class TerminalMessageError extends Error {
  constructor(terminalMessageKey, terminalMessageValues = {}) {
    super(terminalMessage("en", terminalMessageKey, terminalMessageValues));
    this.name = "TerminalMessageError";
    this.terminalMessageKey = terminalMessageKey;
    this.terminalMessageValues = terminalMessageValues;
  }
}

export function isTerminalMessageError(error) {
  return (
    error instanceof Error &&
    typeof error.terminalMessageKey === "string" &&
    typeof error.terminalMessageValues === "object"
  );
}

export function normalizeTerminalLocale(locale) {
  if (typeof locale !== "string") {
    return "en";
  }

  const normalized = locale.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized) {
    return "en";
  }
  if (normalized === "zh" || normalized.startsWith("zh-")) {
    return "zh-CN";
  }
  return TERMINAL_LOCALES.has(normalized) ? normalized : "en";
}

export function resolveTerminalLocale({
  document: documentValue = globalThis.document,
  navigator: navigatorValue = globalThis.navigator,
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
} = {}) {
  const params = new URLSearchParams(search);
  const candidates = [
    params.get("locale"),
    documentValue?.body?.dataset?.terminalLocale,
    documentValue?.body?.dataset?.appLocale,
    ...storageLocaleCandidates(storage),
    documentValue?.documentElement?.lang,
    navigatorValue?.language,
  ];

  for (const candidate of candidates) {
    const locale = normalizeTerminalLocale(candidate);
    if (locale !== "en" || candidate) {
      return locale;
    }
  }

  return "en";
}

export function terminalMessage(locale, key, values = {}) {
  const resolvedLocale = normalizeTerminalLocale(locale);
  const messages = MESSAGES[resolvedLocale] ?? MESSAGES.en;
  const template = messages[key] ?? MESSAGES.en[key] ?? key;
  return template.replace(/\{([^}]+)\}/g, (_match, name) =>
    String(values[name] ?? ""),
  );
}

export function terminalSelectLabel(locale, name, value) {
  if (name === "terminalTheme") {
    return terminalMessage(locale, `choice.theme.${value}`);
  }
  if (name === "cursorStyle") {
    return terminalMessage(locale, `choice.cursor.${value}`);
  }
  return value;
}

function storageLocaleCandidates(storage) {
  const candidates = [];
  for (const key of STORAGE_LOCALE_KEYS) {
    try {
      const value = storage?.getItem(key);
      candidates.push(...parseLocaleStorageValue(value));
    } catch {
      // Ignore unavailable storage or malformed values.
    }
  }
  return candidates;
}

function parseLocaleStorageValue(value) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  const values = [value];
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") {
      values.push(parsed);
    } else if (parsed && typeof parsed === "object") {
      values.push(
        parsed.locale,
        parsed.language,
        parsed.appLocale,
        parsed.ideLocale,
        parsed.value,
      );
    }
  } catch {
    // Plain locale strings are valid.
  }
  return values.filter((candidate) => typeof candidate === "string");
}
