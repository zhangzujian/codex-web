import { TerminalMessageError } from "./terminal-i18n.mjs";

export const DEFAULT_TERMINAL_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const DEFAULT_TERMINAL_THEME = "system";
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1.2;
export const DEFAULT_TERMINAL_LETTER_SPACING = 0;
export const DEFAULT_TERMINAL_CURSOR_STYLE = "block";
export const DEFAULT_TERMINAL_CURSOR_BLINK = true;
export const DEFAULT_TERMINAL_SCROLLBACK = 10_000;
export const DEFAULT_TERMINAL_SCROLL_SENSITIVITY = 1;
export const DEFAULT_TERMINAL_SMOOTH_SCROLL_DURATION = 0;
export const DEFAULT_TERMINAL_TYPE = "xterm-256color";
export const SUPPORTED_TERMINAL_TYPES = Object.freeze([
  "xterm-256color",
  "xterm",
  "linux",
  "screen-256color",
  "tmux-256color",
]);
export const DEFAULT_TERMINAL_SETTINGS = Object.freeze({
  fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalType: DEFAULT_TERMINAL_TYPE,
  theme: DEFAULT_TERMINAL_THEME,
  lineHeight: DEFAULT_TERMINAL_LINE_HEIGHT,
  letterSpacing: DEFAULT_TERMINAL_LETTER_SPACING,
  cursorStyle: DEFAULT_TERMINAL_CURSOR_STYLE,
  cursorBlink: DEFAULT_TERMINAL_CURSOR_BLINK,
  scrollback: DEFAULT_TERMINAL_SCROLLBACK,
  scrollSensitivity: DEFAULT_TERMINAL_SCROLL_SENSITIVITY,
  smoothScrollDuration: DEFAULT_TERMINAL_SMOOTH_SCROLL_DURATION,
});
export const TERMINAL_FONT_FAMILY_STORAGE_KEY = "codex-web.terminal.fontFamily";
export const TERMINAL_FONT_SIZE_STORAGE_KEY = "codex-web.terminal.fontSize";
export const TERMINAL_THEME_STORAGE_KEY = "codex-web.terminal.theme";
export const TERMINAL_LINE_HEIGHT_STORAGE_KEY = "codex-web.terminal.lineHeight";
export const TERMINAL_LETTER_SPACING_STORAGE_KEY =
  "codex-web.terminal.letterSpacing";
export const TERMINAL_CURSOR_STYLE_STORAGE_KEY =
  "codex-web.terminal.cursorStyle";
export const TERMINAL_CURSOR_BLINK_STORAGE_KEY =
  "codex-web.terminal.cursorBlink";
export const TERMINAL_SCROLLBACK_STORAGE_KEY = "codex-web.terminal.scrollback";
export const TERMINAL_SCROLL_SENSITIVITY_STORAGE_KEY =
  "codex-web.terminal.scrollSensitivity";
export const TERMINAL_SMOOTH_SCROLL_DURATION_STORAGE_KEY =
  "codex-web.terminal.smoothScrollDuration";
export const TERMINAL_TYPE_STORAGE_KEY = "codex-web.terminal.type";

const MIN_TERMINAL_FONT_SIZE = 8;
const MAX_TERMINAL_FONT_SIZE = 32;
const MIN_TERMINAL_LINE_HEIGHT = 1;
const MAX_TERMINAL_LINE_HEIGHT = 1.8;
const MIN_TERMINAL_LETTER_SPACING = 0;
const MAX_TERMINAL_LETTER_SPACING = 4;
const MIN_TERMINAL_SCROLLBACK = 100;
const MAX_TERMINAL_SCROLLBACK = 100_000;
const MIN_TERMINAL_SCROLL_SENSITIVITY = 0.1;
const MAX_TERMINAL_SCROLL_SENSITIVITY = 10;
const MIN_TERMINAL_SMOOTH_SCROLL_DURATION = 0;
const MAX_TERMINAL_SMOOTH_SCROLL_DURATION = 500;
const TERMINAL_THEMES = new Set(["system", "dark", "light"]);
const TERMINAL_CURSOR_STYLES = new Set(["block", "underline", "bar"]);
const TERMINAL_TYPES = new Set(SUPPORTED_TERMINAL_TYPES);

export function resolveTerminalFontFamily({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_FONT_FAMILY,
} = {}) {
  return (
    nonEmptyString(new URLSearchParams(search).get("fontFamily")) ??
    nonEmptyString(readStorage(storage, TERMINAL_FONT_FAMILY_STORAGE_KEY)) ??
    fallback
  );
}

export function resolveTerminalFontSize({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_FONT_SIZE,
} = {}) {
  return (
    boundedFontSize(new URLSearchParams(search).get("fontSize")) ??
    boundedFontSize(readStorage(storage, TERMINAL_FONT_SIZE_STORAGE_KEY)) ??
    fallback
  );
}

export function resolveTerminalType({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_TYPE,
} = {}) {
  return (
    normalizedTerminalType(new URLSearchParams(search).get("terminalType")) ??
    normalizedTerminalType(readStorage(storage, TERMINAL_TYPE_STORAGE_KEY)) ??
    fallback
  );
}

export function resolveTerminalTheme({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_THEME,
} = {}) {
  return (
    normalizedChoice(
      new URLSearchParams(search).get("terminalTheme"),
      TERMINAL_THEMES,
    ) ??
    normalizedChoice(
      readStorage(storage, TERMINAL_THEME_STORAGE_KEY),
      TERMINAL_THEMES,
    ) ??
    fallback
  );
}

export function resolveTerminalLineHeight({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_LINE_HEIGHT,
} = {}) {
  return (
    boundedNumber(
      new URLSearchParams(search).get("lineHeight"),
      MIN_TERMINAL_LINE_HEIGHT,
      MAX_TERMINAL_LINE_HEIGHT,
    ) ??
    boundedNumber(
      readStorage(storage, TERMINAL_LINE_HEIGHT_STORAGE_KEY),
      MIN_TERMINAL_LINE_HEIGHT,
      MAX_TERMINAL_LINE_HEIGHT,
    ) ??
    fallback
  );
}

export function resolveTerminalLetterSpacing({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_LETTER_SPACING,
} = {}) {
  return (
    boundedNumber(
      new URLSearchParams(search).get("letterSpacing"),
      MIN_TERMINAL_LETTER_SPACING,
      MAX_TERMINAL_LETTER_SPACING,
    ) ??
    boundedNumber(
      readStorage(storage, TERMINAL_LETTER_SPACING_STORAGE_KEY),
      MIN_TERMINAL_LETTER_SPACING,
      MAX_TERMINAL_LETTER_SPACING,
    ) ??
    fallback
  );
}

export function resolveTerminalCursorStyle({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_CURSOR_STYLE,
} = {}) {
  return (
    normalizedChoice(
      new URLSearchParams(search).get("cursorStyle"),
      TERMINAL_CURSOR_STYLES,
    ) ??
    normalizedChoice(
      readStorage(storage, TERMINAL_CURSOR_STYLE_STORAGE_KEY),
      TERMINAL_CURSOR_STYLES,
    ) ??
    fallback
  );
}

export function resolveTerminalCursorBlink({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_CURSOR_BLINK,
} = {}) {
  return (
    booleanValue(new URLSearchParams(search).get("cursorBlink")) ??
    booleanValue(readStorage(storage, TERMINAL_CURSOR_BLINK_STORAGE_KEY)) ??
    fallback
  );
}

export function resolveTerminalScrollback({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_SCROLLBACK,
} = {}) {
  return (
    boundedInteger(
      new URLSearchParams(search).get("scrollback"),
      MIN_TERMINAL_SCROLLBACK,
      MAX_TERMINAL_SCROLLBACK,
    ) ??
    boundedInteger(
      readStorage(storage, TERMINAL_SCROLLBACK_STORAGE_KEY),
      MIN_TERMINAL_SCROLLBACK,
      MAX_TERMINAL_SCROLLBACK,
    ) ??
    fallback
  );
}

export function resolveTerminalScrollSensitivity({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_SCROLL_SENSITIVITY,
} = {}) {
  return (
    boundedNumber(
      new URLSearchParams(search).get("scrollSensitivity"),
      MIN_TERMINAL_SCROLL_SENSITIVITY,
      MAX_TERMINAL_SCROLL_SENSITIVITY,
    ) ??
    boundedNumber(
      readStorage(storage, TERMINAL_SCROLL_SENSITIVITY_STORAGE_KEY),
      MIN_TERMINAL_SCROLL_SENSITIVITY,
      MAX_TERMINAL_SCROLL_SENSITIVITY,
    ) ??
    fallback
  );
}

export function resolveTerminalSmoothScrollDuration({
  search = globalThis.location?.search ?? "",
  storage = globalThis.localStorage,
  fallback = DEFAULT_TERMINAL_SMOOTH_SCROLL_DURATION,
} = {}) {
  return (
    boundedInteger(
      new URLSearchParams(search).get("smoothScrollDuration"),
      MIN_TERMINAL_SMOOTH_SCROLL_DURATION,
      MAX_TERMINAL_SMOOTH_SCROLL_DURATION,
    ) ??
    boundedInteger(
      readStorage(storage, TERMINAL_SMOOTH_SCROLL_DURATION_STORAGE_KEY),
      MIN_TERMINAL_SMOOTH_SCROLL_DURATION,
      MAX_TERMINAL_SMOOTH_SCROLL_DURATION,
    ) ??
    fallback
  );
}

export function resolveTerminalSettings(options = {}) {
  return {
    fontFamily: resolveTerminalFontFamily(options),
    fontSize: resolveTerminalFontSize(options),
    terminalType: resolveTerminalType(options),
    theme: resolveTerminalTheme(options),
    lineHeight: resolveTerminalLineHeight(options),
    letterSpacing: resolveTerminalLetterSpacing(options),
    cursorStyle: resolveTerminalCursorStyle(options),
    cursorBlink: resolveTerminalCursorBlink(options),
    scrollback: resolveTerminalScrollback(options),
    scrollSensitivity: resolveTerminalScrollSensitivity(options),
    smoothScrollDuration: resolveTerminalSmoothScrollDuration(options),
  };
}

export function completeTerminalSettings(settings = {}) {
  return {
    ...DEFAULT_TERMINAL_SETTINGS,
    ...settings,
  };
}

function nonEmptyString(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function boundedFontSize(value) {
  return boundedNumber(value, MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE);
}

function boundedNumber(value, min, max) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const size = Number(value);
  if (!Number.isFinite(size) || size < min || size > max) {
    return null;
  }
  return size;
}

function boundedInteger(value, min, max) {
  const number = boundedNumber(value, min, max);
  return number != null && Number.isInteger(number) ? number : null;
}

function normalizedChoice(value, choices) {
  const trimmed = nonEmptyString(value);
  return trimmed && choices.has(trimmed) ? trimmed : null;
}

function booleanValue(value) {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return null;
}

function normalizedTerminalType(value) {
  const trimmed = nonEmptyString(value);
  return trimmed && TERMINAL_TYPES.has(trimmed) ? trimmed : null;
}

export function saveTerminalSettings({
  fontFamily,
  fontSize,
  terminalType,
  theme,
  lineHeight,
  letterSpacing,
  cursorStyle,
  cursorBlink,
  scrollback,
  scrollSensitivity,
  smoothScrollDuration,
  storage = globalThis.localStorage,
} = {}) {
  const normalizedFamily = nonEmptyString(fontFamily);
  if (!normalizedFamily) {
    throw new TerminalMessageError("validation.fontFamilyRequired");
  }

  const normalizedSize = boundedFontSize(String(fontSize ?? ""));
  if (normalizedSize == null) {
    throw new TerminalMessageError("validation.fontSizeRange", {
      max: MAX_TERMINAL_FONT_SIZE,
      min: MIN_TERMINAL_FONT_SIZE,
    });
  }
  const normalizedType =
    terminalType === undefined
      ? null
      : normalizedTerminalType(String(terminalType));
  if (terminalType !== undefined && normalizedType == null) {
    throw new TerminalMessageError("validation.terminalTypeInvalid");
  }
  const normalizedTheme = normalizeOptionalChoice(
    theme,
    TERMINAL_THEMES,
    "validation.themeInvalid",
  );
  const normalizedLineHeight = normalizeOptionalNumber(
    lineHeight,
    MIN_TERMINAL_LINE_HEIGHT,
    MAX_TERMINAL_LINE_HEIGHT,
    "validation.lineHeightRange",
  );
  const normalizedLetterSpacing = normalizeOptionalNumber(
    letterSpacing,
    MIN_TERMINAL_LETTER_SPACING,
    MAX_TERMINAL_LETTER_SPACING,
    "validation.letterSpacingRange",
  );
  const normalizedCursorStyle = normalizeOptionalChoice(
    cursorStyle,
    TERMINAL_CURSOR_STYLES,
    "validation.cursorStyleInvalid",
  );
  const normalizedCursorBlink =
    cursorBlink === undefined ? null : booleanValue(cursorBlink);
  if (cursorBlink !== undefined && normalizedCursorBlink == null) {
    throw new TerminalMessageError("validation.cursorBlinkInvalid");
  }
  const normalizedScrollback = normalizeOptionalInteger(
    scrollback,
    MIN_TERMINAL_SCROLLBACK,
    MAX_TERMINAL_SCROLLBACK,
    "validation.scrollbackIntegerRange",
  );
  const normalizedScrollSensitivity = normalizeOptionalNumber(
    scrollSensitivity,
    MIN_TERMINAL_SCROLL_SENSITIVITY,
    MAX_TERMINAL_SCROLL_SENSITIVITY,
    "validation.scrollSensitivityRange",
  );
  const normalizedSmoothScrollDuration = normalizeOptionalInteger(
    smoothScrollDuration,
    MIN_TERMINAL_SMOOTH_SCROLL_DURATION,
    MAX_TERMINAL_SMOOTH_SCROLL_DURATION,
    "validation.smoothScrollDurationIntegerRange",
  );

  storage?.setItem(TERMINAL_FONT_FAMILY_STORAGE_KEY, normalizedFamily);
  storage?.setItem(TERMINAL_FONT_SIZE_STORAGE_KEY, String(normalizedSize));
  if (normalizedType != null) {
    storage?.setItem(TERMINAL_TYPE_STORAGE_KEY, normalizedType);
  }
  setOptionalStorage(storage, TERMINAL_THEME_STORAGE_KEY, normalizedTheme);
  setOptionalStorage(
    storage,
    TERMINAL_LINE_HEIGHT_STORAGE_KEY,
    normalizedLineHeight,
  );
  setOptionalStorage(
    storage,
    TERMINAL_LETTER_SPACING_STORAGE_KEY,
    normalizedLetterSpacing,
  );
  setOptionalStorage(
    storage,
    TERMINAL_CURSOR_STYLE_STORAGE_KEY,
    normalizedCursorStyle,
  );
  setOptionalStorage(
    storage,
    TERMINAL_CURSOR_BLINK_STORAGE_KEY,
    normalizedCursorBlink,
  );
  setOptionalStorage(
    storage,
    TERMINAL_SCROLLBACK_STORAGE_KEY,
    normalizedScrollback,
  );
  setOptionalStorage(
    storage,
    TERMINAL_SCROLL_SENSITIVITY_STORAGE_KEY,
    normalizedScrollSensitivity,
  );
  setOptionalStorage(
    storage,
    TERMINAL_SMOOTH_SCROLL_DURATION_STORAGE_KEY,
    normalizedSmoothScrollDuration,
  );

  return {
    fontFamily: normalizedFamily,
    fontSize: normalizedSize,
    ...(normalizedType != null ? { terminalType: normalizedType } : {}),
    ...(normalizedTheme != null ? { theme: normalizedTheme } : {}),
    ...(normalizedLineHeight != null
      ? { lineHeight: normalizedLineHeight }
      : {}),
    ...(normalizedLetterSpacing != null
      ? { letterSpacing: normalizedLetterSpacing }
      : {}),
    ...(normalizedCursorStyle != null
      ? { cursorStyle: normalizedCursorStyle }
      : {}),
    ...(normalizedCursorBlink != null
      ? { cursorBlink: normalizedCursorBlink }
      : {}),
    ...(normalizedScrollback != null
      ? { scrollback: normalizedScrollback }
      : {}),
    ...(normalizedScrollSensitivity != null
      ? { scrollSensitivity: normalizedScrollSensitivity }
      : {}),
    ...(normalizedSmoothScrollDuration != null
      ? { smoothScrollDuration: normalizedSmoothScrollDuration }
      : {}),
  };
}

export function saveTerminalFontSettings(options = {}) {
  return saveTerminalSettings(options);
}

function normalizeOptionalChoice(value, choices, messageKey) {
  if (value === undefined) {
    return null;
  }
  const normalized = normalizedChoice(String(value), choices);
  if (normalized == null) {
    throw new TerminalMessageError(messageKey);
  }
  return normalized;
}

function normalizeOptionalNumber(value, min, max, messageKey) {
  if (value === undefined) {
    return null;
  }
  const normalized = boundedNumber(String(value), min, max);
  if (normalized == null) {
    throw new TerminalMessageError(messageKey, { max, min });
  }
  return normalized;
}

function normalizeOptionalInteger(value, min, max, messageKey) {
  if (value === undefined) {
    return null;
  }
  const normalized = boundedInteger(String(value), min, max);
  if (normalized == null) {
    throw new TerminalMessageError(messageKey, { max, min });
  }
  return normalized;
}

function setOptionalStorage(storage, key, value) {
  if (value != null) {
    storage?.setItem(key, String(value));
  }
}

export function resetTerminalSettings({
  storage = globalThis.localStorage,
} = {}) {
  storage?.removeItem(TERMINAL_FONT_FAMILY_STORAGE_KEY);
  storage?.removeItem(TERMINAL_FONT_SIZE_STORAGE_KEY);
  storage?.removeItem(TERMINAL_TYPE_STORAGE_KEY);
  storage?.removeItem(TERMINAL_THEME_STORAGE_KEY);
  storage?.removeItem(TERMINAL_LINE_HEIGHT_STORAGE_KEY);
  storage?.removeItem(TERMINAL_LETTER_SPACING_STORAGE_KEY);
  storage?.removeItem(TERMINAL_CURSOR_STYLE_STORAGE_KEY);
  storage?.removeItem(TERMINAL_CURSOR_BLINK_STORAGE_KEY);
  storage?.removeItem(TERMINAL_SCROLLBACK_STORAGE_KEY);
  storage?.removeItem(TERMINAL_SCROLL_SENSITIVITY_STORAGE_KEY);
  storage?.removeItem(TERMINAL_SMOOTH_SCROLL_DURATION_STORAGE_KEY);
}

export function resetTerminalFontSettings(options = {}) {
  resetTerminalSettings(options);
}

function readStorage(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
