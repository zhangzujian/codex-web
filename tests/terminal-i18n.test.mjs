import assert from "node:assert/strict";
import test from "node:test";

import {
  isTerminalMessageError,
  TerminalMessageError,
  terminalMessage,
  terminalSelectLabel,
  normalizeTerminalLocale,
} from "../src/browser/terminal-i18n.mjs";

test("terminal i18n provides English and Chinese settings labels", () => {
  assert.equal(terminalMessage("en", "settings.font"), "Font settings");
  assert.equal(terminalMessage("zh-CN", "settings.font"), "字体设置");
  assert.equal(terminalMessage("en", "field.cursorBlink"), "Cursor blink");
  assert.equal(terminalMessage("zh-CN", "field.cursorBlink"), "光标闪烁");
  assert.equal(terminalMessage("zh-CN", "choice.on"), "开");
  assert.equal(terminalMessage("zh-CN", "status.connected"), "已连接");
});

test("terminal i18n formats parameterized validation and status messages", () => {
  assert.equal(
    terminalMessage("en", "validation.fontSizeRange", { min: 8, max: 32 }),
    "Terminal font size must be between 8 and 32",
  );
  assert.equal(
    terminalMessage("zh-CN", "validation.fontSizeRange", { min: 8, max: 32 }),
    "终端字体大小必须在 8 到 32 之间",
  );
  assert.equal(
    terminalMessage("zh-CN", "error.cwdNotDirectory", { cwd: "/tmp/file" }),
    "终端工作目录不是文件夹：/tmp/file",
  );
  assert.equal(terminalMessage("zh-CN", "status.exited", { reason: 0 }), "已退出 (0)");
});

test("terminal i18n normalizes locale sources to English or Chinese", () => {
  assert.equal(normalizeTerminalLocale("zh_CN"), "zh-CN");
  assert.equal(normalizeTerminalLocale("zh-Hant"), "zh-CN");
  assert.equal(normalizeTerminalLocale("en-US"), "en");
  assert.equal(normalizeTerminalLocale("fr-FR"), "en");
});

test("terminal select option labels are localized without changing stored values", () => {
  assert.equal(terminalSelectLabel("zh-CN", "terminalTheme", "system"), "跟随系统");
  assert.equal(terminalSelectLabel("zh-CN", "cursorStyle", "underline"), "下划线");
  assert.equal(terminalSelectLabel("en", "terminalType", "xterm-256color"), "xterm-256color");
});

test("terminal message errors carry a translation key while keeping English fallback text", () => {
  const error = new TerminalMessageError("validation.themeInvalid");

  assert.equal(isTerminalMessageError(error), true);
  assert.equal(error.message, "Terminal theme is invalid");
  assert.equal(error.terminalMessageKey, "validation.themeInvalid");
});
