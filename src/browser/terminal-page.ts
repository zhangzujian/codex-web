import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  completeTerminalSettings,
  resetTerminalSettings,
  resolveTerminalSettings,
  saveTerminalSettings,
} from "./terminal-options.mjs";
import "./terminal-page.css";

type TerminalServerMessage =
  | {
      type: "created";
      sessionId: string;
    }
  | {
      type: "output";
      data: string;
    }
  | {
      type: "exit";
      exitCode: number | null;
      signal: number | null;
    }
  | {
      type: "error";
      message: string;
    };

const root = document.getElementById("terminal-root");

if (!root) {
  throw new Error("Missing terminal root element");
}

const page = document.createElement("div");
page.className = "terminal-page";

const surface = document.createElement("div");
surface.className = "terminal-page__surface";
surface.dataset.codexTerminal = "true";

const status = document.createElement("div");
status.className = "terminal-page__status";
status.textContent = "Connecting...";

const settings = document.createElement("div");
settings.className = "terminal-page__settings";

const settingsButton = document.createElement("button");
settingsButton.type = "button";
settingsButton.className = "terminal-page__settings-button";
settingsButton.title = "Terminal settings";
settingsButton.setAttribute("aria-label", "Terminal settings");
settingsButton.setAttribute("aria-expanded", "false");
settingsButton.dataset.terminalSettingsButton = "true";

const settingsButtonIcon = document.createElementNS(
  "http://www.w3.org/2000/svg",
  "svg",
);
settingsButtonIcon.setAttribute("viewBox", "0 0 24 24");
settingsButtonIcon.setAttribute("aria-hidden", "true");
settingsButtonIcon.setAttribute("focusable", "false");
settingsButtonIcon.innerHTML =
  '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path fill-rule="evenodd" d="M10.3 2h3.4l.6 2.3c.5.2 1 .4 1.4.7l2.1-1.2 2.4 2.4L19 8.3c.3.5.5.9.7 1.4l2.3.6v3.4l-2.3.6c-.2.5-.4 1-.7 1.4l1.2 2.1-2.4 2.4-2.1-1.2c-.5.3-.9.5-1.4.7l-.6 2.3h-3.4l-.6-2.3c-.5-.2-1-.4-1.4-.7l-2.1 1.2-2.4-2.4L5 15.7c-.3-.5-.5-.9-.7-1.4L2 13.7v-3.4l2.3-.6c.2-.5.4-1 .7-1.4L3.8 6.2l2.4-2.4L8.3 5c.5-.3.9-.5 1.4-.7L10.3 2Zm1.1 1.5-.5 2-.4.1c-.7.2-1.4.5-2 1l-.3.2-1.8-1-1 1 1 1.8-.2.3c-.4.6-.8 1.3-1 2l-.1.4-2 .5v1.4l2 .5.1.4c.2.7.5 1.4 1 2l.2.3-1 1.8 1 1 1.8-1 .3.2c.6.4 1.3.8 2 1l.4.1.5 2h1.4l.5-2 .4-.1c.7-.2 1.4-.5 2-1l.3-.2 1.8 1 1-1-1-1.8.2-.3c.4-.6.8-1.3 1-2l.1-.4 2-.5v-1.4l-2-.5-.1-.4c-.2-.7-.5-1.4-1-2l-.2-.3 1-1.8-1-1-1.8 1-.3-.2c-.6-.4-1.3-.8-2-1l-.4-.1-.5-2h-1.4Z" clip-rule="evenodd"/>';
settingsButton.append(settingsButtonIcon);

const settingsPanel = document.createElement("form");
settingsPanel.className = "terminal-page__settings-panel";
settingsPanel.hidden = true;
settingsPanel.dataset.terminalSettingsPanel = "true";

const settingsTitle = document.createElement("div");
settingsTitle.className = "terminal-page__settings-title";
settingsTitle.textContent = "Terminal";

function createField(
  labelText: string,
  control: HTMLElement,
): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "terminal-page__settings-field";
  label.textContent = labelText;
  label.append(control);
  return label;
}

function createNumberInput({
  max,
  min,
  name,
  step,
}: {
  max: string;
  min: string;
  name: string;
  step: string;
}): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.name = name;
  input.min = min;
  input.max = max;
  input.step = step;
  return input;
}

function createSelect(name: string, values: string[]): HTMLSelectElement {
  const select = document.createElement("select");
  select.name = name;
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  return select;
}

const themeSelect = createSelect("terminalTheme", ["system", "dark", "light"]);
themeSelect.dataset.terminalThemeSelect = "true";
const themeLabel = createField("Theme", themeSelect);

const fontFamilyLabel = document.createElement("label");
fontFamilyLabel.className = "terminal-page__settings-field";
fontFamilyLabel.textContent = "Font family";

const fontFamilyInput = document.createElement("input");
fontFamilyInput.type = "text";
fontFamilyInput.name = "fontFamily";
fontFamilyInput.autocomplete = "off";
fontFamilyInput.spellcheck = false;
fontFamilyInput.dataset.terminalFontFamilyInput = "true";
fontFamilyLabel.append(fontFamilyInput);

const fontSizeLabel = document.createElement("label");
fontSizeLabel.className = "terminal-page__settings-field";
fontSizeLabel.textContent = "Font size";

const fontSizeInput = createNumberInput({
  name: "fontSize",
  min: "8",
  max: "32",
  step: "0.5",
});
fontSizeInput.dataset.terminalFontSizeInput = "true";
fontSizeLabel.append(fontSizeInput);

const lineHeightInput = createNumberInput({
  name: "lineHeight",
  min: "1",
  max: "1.8",
  step: "0.05",
});
lineHeightInput.dataset.terminalLineHeightInput = "true";
const lineHeightLabel = createField("Line height", lineHeightInput);

const letterSpacingInput = createNumberInput({
  name: "letterSpacing",
  min: "0",
  max: "4",
  step: "0.5",
});
letterSpacingInput.dataset.terminalLetterSpacingInput = "true";
const letterSpacingLabel = createField("Letter spacing", letterSpacingInput);

const cursorStyleSelect = createSelect("cursorStyle", [
  "block",
  "underline",
  "bar",
]);
cursorStyleSelect.dataset.terminalCursorStyleSelect = "true";
const cursorStyleLabel = createField("Cursor style", cursorStyleSelect);

const cursorBlinkInput = document.createElement("input");
cursorBlinkInput.type = "checkbox";
cursorBlinkInput.name = "cursorBlink";
cursorBlinkInput.className = "terminal-page__settings-checkbox";
cursorBlinkInput.dataset.terminalCursorBlinkInput = "true";
const cursorBlinkLabel = createField("Cursor blink", cursorBlinkInput);

const scrollbackInput = createNumberInput({
  name: "scrollback",
  min: "100",
  max: "100000",
  step: "100",
});
scrollbackInput.dataset.terminalScrollbackInput = "true";
const scrollbackLabel = createField("Scrollback", scrollbackInput);

const scrollSensitivityInput = createNumberInput({
  name: "scrollSensitivity",
  min: "0.1",
  max: "10",
  step: "0.1",
});
scrollSensitivityInput.dataset.terminalScrollSensitivityInput = "true";
const scrollSensitivityLabel = createField(
  "Scroll sensitivity",
  scrollSensitivityInput,
);

const smoothScrollDurationInput = createNumberInput({
  name: "smoothScrollDuration",
  min: "0",
  max: "500",
  step: "10",
});
smoothScrollDurationInput.dataset.terminalSmoothScrollDurationInput = "true";
const smoothScrollDurationLabel = createField(
  "Smooth scroll duration",
  smoothScrollDurationInput,
);

const terminalTypeLabel = document.createElement("label");
terminalTypeLabel.className = "terminal-page__settings-field";
terminalTypeLabel.textContent = "Terminal type";

const terminalTypeInput = document.createElement("input");
terminalTypeInput.type = "text";
terminalTypeInput.name = "terminalType";
terminalTypeInput.autocomplete = "off";
terminalTypeInput.spellcheck = false;
terminalTypeInput.setAttribute("list", "terminal-type-options");
terminalTypeInput.dataset.terminalTypeInput = "true";

const terminalTypeOptions = document.createElement("datalist");
terminalTypeOptions.id = "terminal-type-options";
for (const value of [
  "xterm-256color",
  "xterm",
  "linux",
  "screen-256color",
  "tmux-256color",
]) {
  const option = document.createElement("option");
  option.value = value;
  terminalTypeOptions.append(option);
}
terminalTypeLabel.append(terminalTypeInput, terminalTypeOptions);

const settingsActions = document.createElement("div");
settingsActions.className = "terminal-page__settings-actions";

const applySettingsButton = document.createElement("button");
applySettingsButton.type = "submit";
applySettingsButton.textContent = "Apply";
applySettingsButton.dataset.terminalSettingsApply = "true";

const resetSettingsButton = document.createElement("button");
resetSettingsButton.type = "button";
resetSettingsButton.textContent = "Reset";
resetSettingsButton.dataset.terminalSettingsReset = "true";

settingsActions.append(resetSettingsButton, applySettingsButton);
settingsPanel.append(
  settingsTitle,
  themeLabel,
  fontFamilyLabel,
  fontSizeLabel,
  lineHeightLabel,
  letterSpacingLabel,
  cursorStyleLabel,
  cursorBlinkLabel,
  scrollbackLabel,
  scrollSensitivityLabel,
  smoothScrollDurationLabel,
  terminalTypeLabel,
  settingsActions,
);
settings.append(settingsButton, settingsPanel);

page.append(surface, settings, status);
root.append(page);

const computedStyle = getComputedStyle(document.documentElement);

function cssColor(name: string, fallback: string): string {
  return computedStyle.getPropertyValue(name).trim() || fallback;
}

function systemTerminalTheme() {
  return {
    background: cssColor(
      "--vscode-terminal-background",
      cssColor("--color-token-editor-background", "#0c0d0e"),
    ),
    foreground: cssColor(
      "--vscode-terminal-foreground",
      cssColor("--color-token-editor-foreground", "#f3f4f6"),
    ),
    cursor: cssColor(
      "--vscode-terminal-cursor-foreground",
      cssColor("--color-token-editor-foreground", "#f3f4f6"),
    ),
    selectionBackground: cssColor(
      "--vscode-terminal-selectionBackground",
      cssColor("--color-token-editor-selection-background", "#3b82f680"),
    ),
    black: cssColor("--vscode-terminal-ansiBlack", "#0c0d0e"),
    blue: cssColor("--vscode-terminal-ansiBlue", "#339cff"),
    brightBlack: cssColor("--vscode-terminal-ansiBrightBlack", "#6b7280"),
    brightBlue: cssColor("--vscode-terminal-ansiBrightBlue", "#60a5fa"),
    brightCyan: cssColor("--vscode-terminal-ansiBrightCyan", "#67e8f9"),
    brightGreen: cssColor("--vscode-terminal-ansiBrightGreen", "#34d399"),
    brightMagenta: cssColor("--vscode-terminal-ansiBrightMagenta", "#c084fc"),
    brightRed: cssColor("--vscode-terminal-ansiBrightRed", "#f87171"),
    brightWhite: cssColor("--vscode-terminal-ansiBrightWhite", "#f9fafb"),
    brightYellow: cssColor("--vscode-terminal-ansiBrightYellow", "#facc15"),
    cyan: cssColor("--vscode-terminal-ansiCyan", "#22d3ee"),
    green: cssColor("--vscode-terminal-ansiGreen", "#22c55e"),
    magenta: cssColor("--vscode-terminal-ansiMagenta", "#a855f7"),
    red: cssColor("--vscode-terminal-ansiRed", "#ef4444"),
    white: cssColor("--vscode-terminal-ansiWhite", "#d1d5db"),
    yellow: cssColor("--vscode-terminal-ansiYellow", "#eab308"),
  };
}

const darkTerminalTheme = {
  background: "#0c0d0e",
  foreground: "#f3f4f6",
  cursor: "#f8fafc",
  selectionBackground: "#3b82f680",
  black: "#0c0d0e",
  blue: "#339cff",
  brightBlack: "#6b7280",
  brightBlue: "#60a5fa",
  brightCyan: "#67e8f9",
  brightGreen: "#34d399",
  brightMagenta: "#c084fc",
  brightRed: "#f87171",
  brightWhite: "#f9fafb",
  brightYellow: "#facc15",
  cyan: "#22d3ee",
  green: "#22c55e",
  magenta: "#a855f7",
  red: "#ef4444",
  white: "#d1d5db",
  yellow: "#eab308",
};

const lightTerminalTheme = {
  background: "#ffffff",
  foreground: "#111827",
  cursor: "#111827",
  selectionBackground: "#bfdbfe",
  black: "#111827",
  blue: "#2563eb",
  brightBlack: "#6b7280",
  brightBlue: "#3b82f6",
  brightCyan: "#06b6d4",
  brightGreen: "#16a34a",
  brightMagenta: "#a855f7",
  brightRed: "#ef4444",
  brightWhite: "#ffffff",
  brightYellow: "#ca8a04",
  cyan: "#0891b2",
  green: "#15803d",
  magenta: "#9333ea",
  red: "#dc2626",
  white: "#e5e7eb",
  yellow: "#a16207",
};

function terminalTheme(themeName: string) {
  if (themeName === "dark") {
    return darkTerminalTheme;
  }
  if (themeName === "light") {
    return lightTerminalTheme;
  }
  return systemTerminalTheme();
}

function applySurfaceTheme(themeName: string): void {
  surface.style.background = terminalTheme(themeName).background ?? "";
}

const initialSettings = resolveTerminalSettings();
let pendingTerminalType = initialSettings.terminalType;
let activeTerminalType = initialSettings.terminalType;

themeSelect.value = initialSettings.theme;
fontFamilyInput.value = initialSettings.fontFamily;
fontSizeInput.value = String(initialSettings.fontSize);
lineHeightInput.value = String(initialSettings.lineHeight);
letterSpacingInput.value = String(initialSettings.letterSpacing);
cursorStyleSelect.value = initialSettings.cursorStyle;
cursorBlinkInput.checked = initialSettings.cursorBlink;
scrollbackInput.value = String(initialSettings.scrollback);
scrollSensitivityInput.value = String(initialSettings.scrollSensitivity);
smoothScrollDurationInput.value = String(initialSettings.smoothScrollDuration);
terminalTypeInput.value = initialSettings.terminalType;
applySurfaceTheme(initialSettings.theme);

const terminal = new Terminal({
  allowProposedApi: false,
  cursorBlink: initialSettings.cursorBlink,
  cursorStyle: initialSettings.cursorStyle as "block" | "underline" | "bar",
  convertEol: true,
  fontFamily: initialSettings.fontFamily,
  fontSize: initialSettings.fontSize,
  letterSpacing: initialSettings.letterSpacing,
  lineHeight: initialSettings.lineHeight,
  scrollback: initialSettings.scrollback,
  scrollSensitivity: initialSettings.scrollSensitivity,
  smoothScrollDuration: initialSettings.smoothScrollDuration,
  theme: terminalTheme(initialSettings.theme),
});
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(surface);

let socket: WebSocket | null = null;
let created = false;

function terminalCwd(): string {
  return document.body.dataset.terminalCwd ?? "";
}

function setStatus(message: string): void {
  status.textContent = message;
}

function setSettingsPanelOpen(open: boolean): void {
  settingsPanel.hidden = !open;
  settingsButton.setAttribute("aria-expanded", String(open));
  if (open) {
    fontFamilyInput.focus();
    fontFamilyInput.select();
  } else {
    terminal.focus();
  }
}

function applyTerminalOptions(
  settings: ReturnType<typeof resolveTerminalSettings>,
): void {
  terminal.options = {
    cursorBlink: settings.cursorBlink,
    cursorStyle: settings.cursorStyle as "block" | "underline" | "bar",
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    letterSpacing: settings.letterSpacing,
    lineHeight: settings.lineHeight,
    scrollback: settings.scrollback,
    scrollSensitivity: settings.scrollSensitivity,
    smoothScrollDuration: settings.smoothScrollDuration,
    theme: terminalTheme(settings.theme),
  };
  applySurfaceTheme(settings.theme);
  requestAnimationFrame(fitAndResize);
}

function setSettingsFormValues(
  settings: ReturnType<typeof resolveTerminalSettings>,
): void {
  fontFamilyInput.value = settings.fontFamily;
  fontSizeInput.value = String(settings.fontSize);
  themeSelect.value = settings.theme;
  lineHeightInput.value = String(settings.lineHeight);
  letterSpacingInput.value = String(settings.letterSpacing);
  cursorStyleSelect.value = settings.cursorStyle;
  cursorBlinkInput.checked = settings.cursorBlink;
  scrollbackInput.value = String(settings.scrollback);
  scrollSensitivityInput.value = String(settings.scrollSensitivity);
  smoothScrollDurationInput.value = String(settings.smoothScrollDuration);
  terminalTypeInput.value = settings.terminalType;
}

function savedSettingsStatus(
  settings: ReturnType<typeof resolveTerminalSettings>,
) {
  return settings.terminalType === activeTerminalType
    ? "Terminal settings saved"
    : "Terminal settings saved. Terminal type applies to new terminals.";
}

settingsButton.addEventListener("click", () => {
  setSettingsPanelOpen(settingsPanel.hidden);
});

settingsPanel.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const saved = saveTerminalSettings({
      fontFamily: fontFamilyInput.value,
      fontSize: fontSizeInput.value,
      theme: themeSelect.value,
      lineHeight: lineHeightInput.value,
      letterSpacing: letterSpacingInput.value,
      cursorStyle: cursorStyleSelect.value,
      cursorBlink: cursorBlinkInput.checked,
      scrollback: scrollbackInput.value,
      scrollSensitivity: scrollSensitivityInput.value,
      smoothScrollDuration: smoothScrollDurationInput.value,
      terminalType: terminalTypeInput.value,
    });
    const nextSettings = completeTerminalSettings(saved);
    pendingTerminalType = nextSettings.terminalType;
    setSettingsFormValues(nextSettings);
    applyTerminalOptions(nextSettings);
    setStatus(savedSettingsStatus(nextSettings));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Invalid font settings");
  }
});

resetSettingsButton.addEventListener("click", () => {
  resetTerminalSettings();
  const defaultSettings = completeTerminalSettings();
  pendingTerminalType = defaultSettings.terminalType;
  setSettingsFormValues(defaultSettings);
  applyTerminalOptions(defaultSettings);
  setStatus(
    defaultSettings.terminalType === activeTerminalType
      ? "Terminal settings reset"
      : "Terminal settings reset. Terminal type applies to new terminals.",
  );
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsPanel.hidden) {
    event.preventDefault();
    setSettingsPanelOpen(false);
  }
});

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/__backend/terminal`;
}

function send(message: unknown): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(message));
}

function fitAndResize(): void {
  fitAddon.fit();
  if (created) {
    send({
      type: "resize",
      cols: terminal.cols,
      rows: terminal.rows,
    });
  }
}

function connect(): void {
  socket = new WebSocket(socketUrl());

  socket.addEventListener("open", () => {
    fitAddon.fit();
    activeTerminalType = pendingTerminalType;
    send({
      type: "create",
      cwd: terminalCwd(),
      cols: terminal.cols,
      rows: terminal.rows,
      terminalType: activeTerminalType,
    });
  });

  socket.addEventListener("message", (event) => {
    let message: TerminalServerMessage;
    try {
      message = JSON.parse(String(event.data)) as TerminalServerMessage;
    } catch {
      return;
    }

    if (message.type === "created") {
      created = true;
      setStatus("Connected");
      terminal.focus();
      return;
    }

    if (message.type === "output") {
      terminal.write(message.data);
      return;
    }

    if (message.type === "exit") {
      created = false;
      setStatus(`Exited (${message.exitCode ?? message.signal ?? "unknown"})`);
      return;
    }

    setStatus(message.message);
    terminal.writeln(`\r\n${message.message}`);
  });

  socket.addEventListener("close", () => {
    created = false;
    setStatus("Disconnected");
  });

  socket.addEventListener("error", () => {
    setStatus("Connection error");
  });
}

terminal.onData((data) => {
  send({ type: "input", data });
});

const resizeObserver = new ResizeObserver(() => {
  fitAndResize();
});
resizeObserver.observe(surface);
window.addEventListener("resize", fitAndResize);

connect();
