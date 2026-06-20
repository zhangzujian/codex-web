import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_TERMINAL_LETTER_SPACING,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  DEFAULT_TERMINAL_SCROLLBACK,
  DEFAULT_TERMINAL_SCROLL_SENSITIVITY,
  DEFAULT_TERMINAL_SMOOTH_SCROLL_DURATION,
  DEFAULT_TERMINAL_THEME,
  DEFAULT_TERMINAL_TYPE,
  completeTerminalSettings,
  resetTerminalFontSettings,
  resetTerminalSettings,
  resolveTerminalCursorBlink,
  resolveTerminalCursorStyle,
  resolveTerminalFontFamily,
  resolveTerminalFontSize,
  resolveTerminalLetterSpacing,
  resolveTerminalLineHeight,
  resolveTerminalScrollback,
  resolveTerminalScrollSensitivity,
  resolveTerminalSettings,
  resolveTerminalSmoothScrollDuration,
  resolveTerminalTheme,
  resolveTerminalType,
  saveTerminalFontSettings,
  saveTerminalSettings,
  TERMINAL_CURSOR_BLINK_STORAGE_KEY,
  TERMINAL_CURSOR_STYLE_STORAGE_KEY,
  TERMINAL_FONT_FAMILY_STORAGE_KEY,
  TERMINAL_FONT_SIZE_STORAGE_KEY,
  TERMINAL_LETTER_SPACING_STORAGE_KEY,
  TERMINAL_LINE_HEIGHT_STORAGE_KEY,
  TERMINAL_SCROLLBACK_STORAGE_KEY,
  TERMINAL_SCROLL_SENSITIVITY_STORAGE_KEY,
  TERMINAL_SMOOTH_SCROLL_DURATION_STORAGE_KEY,
  TERMINAL_THEME_STORAGE_KEY,
  TERMINAL_TYPE_STORAGE_KEY,
} from "../src/browser/terminal-options.mjs";

function storage(values) {
  return {
    getItem(key) {
      return values[key] ?? null;
    },
    removeItem(key) {
      delete values[key];
    },
    setItem(key, value) {
      values[key] = String(value);
    },
    values,
  };
}

test("resolveTerminalFontFamily prefers the fontFamily URL parameter", () => {
  assert.equal(
    resolveTerminalFontFamily({
      search: "?fontFamily=JetBrains%20Mono",
      storage: storage({
        [TERMINAL_FONT_FAMILY_STORAGE_KEY]: "Fira Code",
      }),
    }),
    "JetBrains Mono",
  );
});

test("resolveTerminalFontFamily falls back to localStorage then default", () => {
  assert.equal(
    resolveTerminalFontFamily({
      search: "",
      storage: storage({
        [TERMINAL_FONT_FAMILY_STORAGE_KEY]: "Fira Code",
      }),
    }),
    "Fira Code",
  );
  assert.equal(
    resolveTerminalFontFamily({ search: "", storage: storage({}) }),
    DEFAULT_TERMINAL_FONT_FAMILY,
  );
});

test("resolveTerminalFontSize reads URL and localStorage values within bounds", () => {
  assert.equal(
    resolveTerminalFontSize({
      search: "?fontSize=14.5",
      storage: storage({
        [TERMINAL_FONT_SIZE_STORAGE_KEY]: "16",
      }),
    }),
    14.5,
  );
  assert.equal(
    resolveTerminalFontSize({
      search: "",
      storage: storage({
        [TERMINAL_FONT_SIZE_STORAGE_KEY]: "16",
      }),
    }),
    16,
  );
});

test("resolveTerminalFontSize rejects invalid or out-of-range values", () => {
  assert.equal(
    resolveTerminalFontSize({
      search: "?fontSize=100",
      storage: storage({
        [TERMINAL_FONT_SIZE_STORAGE_KEY]: "7",
      }),
    }),
    DEFAULT_TERMINAL_FONT_SIZE,
  );
  assert.equal(
    resolveTerminalFontSize({
      search: "?fontSize=abc",
      storage: storage({}),
    }),
    DEFAULT_TERMINAL_FONT_SIZE,
  );
});

test("resolveTerminalType reads URL, localStorage, then default", () => {
  assert.equal(
    resolveTerminalType({
      search: "?terminalType=linux",
      storage: storage({
        [TERMINAL_TYPE_STORAGE_KEY]: "xterm",
      }),
    }),
    "linux",
  );
  assert.equal(
    resolveTerminalType({
      search: "",
      storage: storage({
        [TERMINAL_TYPE_STORAGE_KEY]: "xterm",
      }),
    }),
    "xterm",
  );
  assert.equal(
    resolveTerminalType({ search: "", storage: storage({}) }),
    DEFAULT_TERMINAL_TYPE,
  );
});

test("resolveTerminalType rejects unsafe terminal names", () => {
  assert.equal(
    resolveTerminalType({
      search: "?terminalType=xterm%20bad",
      storage: storage({
        [TERMINAL_TYPE_STORAGE_KEY]: "../linux",
      }),
    }),
    DEFAULT_TERMINAL_TYPE,
  );
});

test("resolveTerminalSettings reads theme and behavior options", () => {
  const resolved = resolveTerminalSettings({
    search:
      "?terminalTheme=light&lineHeight=1.35&letterSpacing=1&cursorStyle=bar&cursorBlink=false&scrollback=50000&scrollSensitivity=2&smoothScrollDuration=0",
    storage: storage({
      [TERMINAL_THEME_STORAGE_KEY]: "dark",
      [TERMINAL_LINE_HEIGHT_STORAGE_KEY]: "1.1",
      [TERMINAL_LETTER_SPACING_STORAGE_KEY]: "2",
      [TERMINAL_CURSOR_STYLE_STORAGE_KEY]: "underline",
      [TERMINAL_CURSOR_BLINK_STORAGE_KEY]: "true",
      [TERMINAL_SCROLLBACK_STORAGE_KEY]: "1000",
      [TERMINAL_SCROLL_SENSITIVITY_STORAGE_KEY]: "1",
      [TERMINAL_SMOOTH_SCROLL_DURATION_STORAGE_KEY]: "120",
    }),
  });

  assert.equal(resolved.theme, "light");
  assert.equal(resolved.lineHeight, 1.35);
  assert.equal(resolved.letterSpacing, 1);
  assert.equal(resolved.cursorStyle, "bar");
  assert.equal(resolved.cursorBlink, false);
  assert.equal(resolved.scrollback, 50000);
  assert.equal(resolved.scrollSensitivity, 2);
  assert.equal(resolved.smoothScrollDuration, 0);
});

test("terminal option resolvers fall back for invalid values", () => {
  const target = storage({
    [TERMINAL_THEME_STORAGE_KEY]: "blue",
    [TERMINAL_LINE_HEIGHT_STORAGE_KEY]: "8",
    [TERMINAL_LETTER_SPACING_STORAGE_KEY]: "9",
    [TERMINAL_CURSOR_STYLE_STORAGE_KEY]: "square",
    [TERMINAL_CURSOR_BLINK_STORAGE_KEY]: "maybe",
    [TERMINAL_SCROLLBACK_STORAGE_KEY]: "10",
    [TERMINAL_SCROLL_SENSITIVITY_STORAGE_KEY]: "0",
    [TERMINAL_SMOOTH_SCROLL_DURATION_STORAGE_KEY]: "-1",
  });

  assert.equal(
    resolveTerminalTheme({ search: "", storage: target }),
    DEFAULT_TERMINAL_THEME,
  );
  assert.equal(
    resolveTerminalLineHeight({ search: "", storage: target }),
    DEFAULT_TERMINAL_LINE_HEIGHT,
  );
  assert.equal(
    resolveTerminalLetterSpacing({ search: "", storage: target }),
    DEFAULT_TERMINAL_LETTER_SPACING,
  );
  assert.equal(
    resolveTerminalCursorStyle({ search: "", storage: target }),
    "block",
  );
  assert.equal(
    resolveTerminalCursorBlink({ search: "", storage: target }),
    true,
  );
  assert.equal(
    resolveTerminalScrollback({ search: "", storage: target }),
    DEFAULT_TERMINAL_SCROLLBACK,
  );
  assert.equal(
    resolveTerminalScrollSensitivity({ search: "", storage: target }),
    DEFAULT_TERMINAL_SCROLL_SENSITIVITY,
  );
  assert.equal(
    resolveTerminalSmoothScrollDuration({ search: "", storage: target }),
    DEFAULT_TERMINAL_SMOOTH_SCROLL_DURATION,
  );
});

test("saveTerminalFontSettings persists trimmed font values", () => {
  const target = storage({});

  const saved = saveTerminalFontSettings({
    fontFamily: "  JetBrains Mono, monospace  ",
    fontSize: "15.5",
    storage: target,
  });

  assert.deepEqual(saved, {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 15.5,
  });
  assert.equal(
    target.values[TERMINAL_FONT_FAMILY_STORAGE_KEY],
    "JetBrains Mono, monospace",
  );
  assert.equal(target.values[TERMINAL_FONT_SIZE_STORAGE_KEY], "15.5");
});

test("saveTerminalFontSettings persists terminal type when provided", () => {
  const target = storage({});

  const saved = saveTerminalFontSettings({
    fontFamily: "monospace",
    fontSize: "14",
    terminalType: " linux ",
    storage: target,
  });

  assert.equal(saved.terminalType, "linux");
  assert.equal(target.values[TERMINAL_TYPE_STORAGE_KEY], "linux");
});

test("saveTerminalSettings persists all supported settings", () => {
  const target = storage({});

  const saved = saveTerminalSettings({
    fontFamily: "monospace",
    fontSize: "14",
    terminalType: "xterm",
    theme: "dark",
    lineHeight: "1.4",
    letterSpacing: "1",
    cursorStyle: "underline",
    cursorBlink: false,
    scrollback: "50000",
    scrollSensitivity: "3",
    smoothScrollDuration: "80",
    storage: target,
  });

  assert.deepEqual(saved, {
    fontFamily: "monospace",
    fontSize: 14,
    terminalType: "xterm",
    theme: "dark",
    lineHeight: 1.4,
    letterSpacing: 1,
    cursorStyle: "underline",
    cursorBlink: false,
    scrollback: 50000,
    scrollSensitivity: 3,
    smoothScrollDuration: 80,
  });
  assert.equal(target.values[TERMINAL_THEME_STORAGE_KEY], "dark");
  assert.equal(target.values[TERMINAL_LINE_HEIGHT_STORAGE_KEY], "1.4");
  assert.equal(target.values[TERMINAL_LETTER_SPACING_STORAGE_KEY], "1");
  assert.equal(target.values[TERMINAL_CURSOR_STYLE_STORAGE_KEY], "underline");
  assert.equal(target.values[TERMINAL_CURSOR_BLINK_STORAGE_KEY], "false");
  assert.equal(target.values[TERMINAL_SCROLLBACK_STORAGE_KEY], "50000");
  assert.equal(target.values[TERMINAL_SCROLL_SENSITIVITY_STORAGE_KEY], "3");
  assert.equal(
    target.values[TERMINAL_SMOOTH_SCROLL_DURATION_STORAGE_KEY],
    "80",
  );
});

test("completeTerminalSettings applies saved values without URL precedence", () => {
  const target = storage({});
  const saved = saveTerminalSettings({
    fontFamily: "JetBrains Mono",
    fontSize: "16",
    terminalType: "linux",
    theme: "light",
    lineHeight: "1.4",
    letterSpacing: "1",
    cursorStyle: "bar",
    cursorBlink: false,
    scrollback: "20000",
    scrollSensitivity: "2",
    smoothScrollDuration: "80",
    storage: target,
  });

  assert.deepEqual(completeTerminalSettings(saved), {
    fontFamily: "JetBrains Mono",
    fontSize: 16,
    terminalType: "linux",
    theme: "light",
    lineHeight: 1.4,
    letterSpacing: 1,
    cursorStyle: "bar",
    cursorBlink: false,
    scrollback: 20000,
    scrollSensitivity: 2,
    smoothScrollDuration: 80,
  });
});

test("saveTerminalFontSettings rejects blank family and invalid size", () => {
  assert.throws(
    () =>
      saveTerminalFontSettings({
        fontFamily: "",
        fontSize: "14",
        storage: storage({}),
      }),
    /font family/i,
  );
  assert.throws(
    () =>
      saveTerminalFontSettings({
        fontFamily: "monospace",
        fontSize: "40",
        storage: storage({}),
      }),
    /font size/i,
  );
  assert.throws(
    () =>
      saveTerminalFontSettings({
        fontFamily: "monospace",
        fontSize: "14",
        terminalType: "bad value",
        storage: storage({}),
      }),
    /terminal type/i,
  );
  assert.throws(
    () =>
      saveTerminalSettings({
        fontFamily: "monospace",
        fontSize: "14",
        theme: "sepia",
        storage: storage({}),
      }),
    /theme/i,
  );
  assert.throws(
    () =>
      saveTerminalSettings({
        fontFamily: "monospace",
        fontSize: "14",
        lineHeight: "8",
        storage: storage({}),
      }),
    /line height/i,
  );
});

test("resetTerminalFontSettings clears persisted font values", () => {
  const target = storage({
    [TERMINAL_FONT_FAMILY_STORAGE_KEY]: "Fira Code",
    [TERMINAL_FONT_SIZE_STORAGE_KEY]: "16",
  });

  resetTerminalFontSettings({ storage: target });

  assert.equal(target.values[TERMINAL_FONT_FAMILY_STORAGE_KEY], undefined);
  assert.equal(target.values[TERMINAL_FONT_SIZE_STORAGE_KEY], undefined);
  assert.equal(target.values[TERMINAL_TYPE_STORAGE_KEY], undefined);
});

test("resetTerminalSettings clears all persisted terminal settings", () => {
  const target = storage({
    [TERMINAL_FONT_FAMILY_STORAGE_KEY]: "Fira Code",
    [TERMINAL_FONT_SIZE_STORAGE_KEY]: "16",
    [TERMINAL_TYPE_STORAGE_KEY]: "linux",
    [TERMINAL_THEME_STORAGE_KEY]: "dark",
    [TERMINAL_LINE_HEIGHT_STORAGE_KEY]: "1.4",
    [TERMINAL_LETTER_SPACING_STORAGE_KEY]: "1",
    [TERMINAL_CURSOR_STYLE_STORAGE_KEY]: "bar",
    [TERMINAL_CURSOR_BLINK_STORAGE_KEY]: "false",
    [TERMINAL_SCROLLBACK_STORAGE_KEY]: "50000",
    [TERMINAL_SCROLL_SENSITIVITY_STORAGE_KEY]: "2",
    [TERMINAL_SMOOTH_SCROLL_DURATION_STORAGE_KEY]: "80",
  });

  resetTerminalSettings({ storage: target });

  assert.deepEqual(target.values, {});
});
