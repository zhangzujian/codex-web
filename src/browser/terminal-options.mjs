export const DEFAULT_TERMINAL_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const TERMINAL_FONT_FAMILY_STORAGE_KEY =
  "codex-web.terminal.fontFamily";
export const TERMINAL_FONT_SIZE_STORAGE_KEY = "codex-web.terminal.fontSize";

const MIN_TERMINAL_FONT_SIZE = 8;
const MAX_TERMINAL_FONT_SIZE = 32;

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

function nonEmptyString(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function boundedFontSize(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const size = Number(value);
  if (
    !Number.isFinite(size) ||
    size < MIN_TERMINAL_FONT_SIZE ||
    size > MAX_TERMINAL_FONT_SIZE
  ) {
    return null;
  }
  return size;
}

function readStorage(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
