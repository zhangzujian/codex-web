import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  isTerminalMessageError,
  resolveTerminalLocale,
  terminalMessage,
  terminalSelectLabel,
} from "./terminal-i18n.mjs";
import {
  completeTerminalSettings,
  resolveTerminalSettings,
  saveTerminalSettings,
  SUPPORTED_TERMINAL_TYPES,
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
      messageKey?: string;
      messageValues?: Record<string, unknown>;
    };

const parentCloseSettingsMessageType = "codex-web-terminal-close-settings";
const locale = resolveTerminalLocale();
const t = (key: string, values?: Record<string, unknown>) =>
  terminalMessage(locale, key, values);

document.documentElement.lang = locale;
document.title = t("title");

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
status.textContent = t("status.connecting");

const settings = document.createElement("div");
settings.className = "terminal-page__settings";

type SettingsButtonIconName = "font" | "settings" | "theme";

const settingsButtonIconPaths: Record<SettingsButtonIconName, string> = {
  font: '<path d="M5 4h14v4h-2V6h-4v12h2v2H9v-2h2V6H7v2H5V4Z"/>',
  settings:
    '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path fill-rule="evenodd" d="M10.3 2h3.4l.6 2.3c.5.2 1 .4 1.4.7l2.1-1.2 2.4 2.4L19 8.3c.3.5.5.9.7 1.4l2.3.6v3.4l-2.3.6c-.2.5-.4 1-.7 1.4l1.2 2.1-2.4 2.4-2.1-1.2c-.5.3-.9.5-1.4.7l-.6 2.3h-3.4l-.6-2.3c-.5-.2-1-.4-1.4-.7l-2.1 1.2-2.4-2.4L5 15.7c-.3-.5-.5-.9-.7-1.4L2 13.7v-3.4l2.3-.6c.2-.5.4-1 .7-1.4L3.8 6.2l2.4-2.4L8.3 5c.5-.3.9-.5 1.4-.7L10.3 2Zm1.1 1.5-.5 2-.4.1c-.7.2-1.4.5-2 1l-.3.2-1.8-1-1 1 1 1.8-.2.3c-.4.6-.8 1.3-1 2l-.1.4-2 .5v1.4l2 .5.1.4c.2.7.5 1.4 1 2l.2.3-1 1.8 1 1 1.8-1 .3.2c.6.4 1.3.8 2 1l.4.1.5 2h1.4l.5-2 .4-.1c.7-.2 1.4-.5 2-1l.3-.2 1.8 1 1-1-1-1.8.2-.3c.4-.6.8-1.3 1-2l.1-.4 2-.5v-1.4l-2-.5-.1-.4c-.2-.7-.5-1.4-1-2l-.2-.3 1-1.8-1-1-1.8 1-.3-.2c-.6-.4-1.3-.8-2-1l-.4-.1-.5-2h-1.4Z" clip-rule="evenodd"/>',
  theme: '<path d="M20 14.3A8 8 0 0 1 9.7 4 8 8 0 1 0 20 14.3Z"/>',
};

function createSettingsButton(
  labelText: string,
  iconName: SettingsButtonIconName,
  dataAttribute: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "terminal-page__settings-button";
  button.title = labelText;
  button.setAttribute("aria-label", labelText);
  button.setAttribute("aria-expanded", "false");
  button.dataset[dataAttribute] = "true";

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.innerHTML = settingsButtonIconPaths[iconName];
  button.append(icon);

  return button;
}

const fontSettingsButton = createSettingsButton(
  t("settings.font"),
  "font",
  "terminalFontSettingsButton",
);
const themeSettingsButton = createSettingsButton(
  t("settings.theme"),
  "theme",
  "terminalThemeSettingsButton",
);
const settingsButton = createSettingsButton(
  t("settings.terminal"),
  "settings",
  "terminalSettingsButton",
);

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

function createSettingsPanel(): HTMLFormElement {
  const panel = document.createElement("form");
  panel.className = "terminal-page__settings-panel";
  panel.hidden = true;
  panel.dataset.terminalSettingsPanel = "true";

  return panel;
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

function createSelect(
  name: string,
  values: readonly string[],
): HTMLSelectElement {
  const select = document.createElement("select");
  select.name = name;
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = terminalSelectLabel(locale, name, value);
    select.append(option);
  }
  return select;
}

function setSwitchChecked(input: HTMLInputElement, checked: boolean): void {
  input.checked = checked;
  input.setAttribute("aria-checked", String(checked));
}

function createSwitchInput(name: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = name;
  input.className = "terminal-page__settings-switch";
  input.setAttribute("role", "switch");
  setSwitchChecked(input, false);
  input.addEventListener("change", () => {
    input.setAttribute("aria-checked", String(input.checked));
  });
  return input;
}

const themeSelect = createSelect("terminalTheme", ["system", "dark", "light"]);
themeSelect.dataset.terminalThemeSelect = "true";
const themeLabel = createField(t("field.theme"), themeSelect);

const fontFamilyLabel = document.createElement("label");
fontFamilyLabel.className = "terminal-page__settings-field";
fontFamilyLabel.textContent = t("field.fontFamily");

const fontFamilyInput = document.createElement("input");
fontFamilyInput.type = "text";
fontFamilyInput.name = "fontFamily";
fontFamilyInput.autocomplete = "off";
fontFamilyInput.spellcheck = false;
fontFamilyInput.dataset.terminalFontFamilyInput = "true";
fontFamilyLabel.append(fontFamilyInput);

const fontSizeLabel = document.createElement("label");
fontSizeLabel.className = "terminal-page__settings-field";
fontSizeLabel.textContent = t("field.fontSize");

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
const lineHeightLabel = createField(t("field.lineHeight"), lineHeightInput);

const letterSpacingInput = createNumberInput({
  name: "letterSpacing",
  min: "0",
  max: "4",
  step: "0.5",
});
letterSpacingInput.dataset.terminalLetterSpacingInput = "true";
const letterSpacingLabel = createField(
  t("field.letterSpacing"),
  letterSpacingInput,
);

const cursorStyleSelect = createSelect("cursorStyle", [
  "block",
  "underline",
  "bar",
]);
cursorStyleSelect.dataset.terminalCursorStyleSelect = "true";
const cursorStyleLabel = createField(t("field.cursorStyle"), cursorStyleSelect);

const cursorBlinkLabel = document.createElement("label");
cursorBlinkLabel.className = "terminal-page__settings-field";
cursorBlinkLabel.textContent = t("field.cursorBlink");

const cursorBlinkSwitchInput = createSwitchInput("cursorBlink");
cursorBlinkSwitchInput.dataset.terminalCursorBlinkSwitchInput = "true";
cursorBlinkLabel.append(cursorBlinkSwitchInput);

const scrollbackInput = createNumberInput({
  name: "scrollback",
  min: "100",
  max: "100000",
  step: "100",
});
scrollbackInput.dataset.terminalScrollbackInput = "true";
const scrollbackLabel = createField(t("field.scrollback"), scrollbackInput);

const scrollSensitivityInput = createNumberInput({
  name: "scrollSensitivity",
  min: "0.1",
  max: "10",
  step: "0.1",
});
scrollSensitivityInput.dataset.terminalScrollSensitivityInput = "true";
const scrollSensitivityLabel = createField(
  t("field.scrollSensitivity"),
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
  t("field.smoothScrollDuration"),
  smoothScrollDurationInput,
);

const terminalTypeLabel = document.createElement("label");
terminalTypeLabel.className = "terminal-page__settings-field";
terminalTypeLabel.textContent = t("field.terminalType");

const terminalTypeInput = createSelect(
  "terminalType",
  SUPPORTED_TERMINAL_TYPES,
);
terminalTypeInput.dataset.terminalTypeInput = "true";
terminalTypeLabel.append(terminalTypeInput);

const fontSettingsPanel = createSettingsPanel();
fontSettingsPanel.append(
  fontFamilyLabel,
  fontSizeLabel,
  lineHeightLabel,
  letterSpacingLabel,
);

const themeSettingsPanel = createSettingsPanel();
themeSettingsPanel.append(themeLabel);

const otherSettingsPanel = createSettingsPanel();
otherSettingsPanel.append(
  cursorStyleLabel,
  cursorBlinkLabel,
  scrollbackLabel,
  scrollSensitivityLabel,
  smoothScrollDurationLabel,
  terminalTypeLabel,
);

settings.append(
  fontSettingsButton,
  themeSettingsButton,
  settingsButton,
  fontSettingsPanel,
  themeSettingsPanel,
  otherSettingsPanel,
);

page.append(surface, settings, status);
root.append(page);

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

const systemThemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

function terminalTheme(themeName: string) {
  const effectiveThemeName =
    themeName === "system"
      ? systemThemeMediaQuery.matches
        ? "dark"
        : "light"
      : themeName;
  if (effectiveThemeName === "dark") {
    return darkTerminalTheme;
  }
  if (effectiveThemeName === "light") {
    return lightTerminalTheme;
  }
  return lightTerminalTheme;
}

function applySurfaceTheme(themeName: string): void {
  const background = terminalTheme(themeName).background ?? "";
  surface.style.background = background;
  page.style.background = background;
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
setSwitchChecked(cursorBlinkSwitchInput, initialSettings.cursorBlink);
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

function backendWebSocketToken(): string {
  return document.body.dataset.backendWebsocketToken ?? "";
}

function terminalTabRef(): {
  browserTabId: string;
  conversationId: string;
} | null {
  const params = new URLSearchParams(window.location.search);
  const conversationId = params.get("terminalConversationId");
  const browserTabId = params.get("terminalBrowserTabId");
  return conversationId && browserTabId
    ? { browserTabId, conversationId }
    : null;
}

function closeTerminalTab(): void {
  if (!terminalTabRef()) {
    return;
  }
  window.parent.postMessage(
    { type: "codex-web-terminal-exit" },
    window.location.origin,
  );
}

function setStatus(message: string): void {
  status.textContent = message;
}

const settingsPanels = [
  fontSettingsPanel,
  themeSettingsPanel,
  otherSettingsPanel,
];
const settingsButtons = [
  fontSettingsButton,
  themeSettingsButton,
  settingsButton,
];

function closeSettingsPanels({
  restoreTerminalFocus = true,
}: { restoreTerminalFocus?: boolean } = {}): void {
  for (const panel of settingsPanels) {
    panel.hidden = true;
  }
  for (const button of settingsButtons) {
    button.setAttribute("aria-expanded", "false");
  }
  if (restoreTerminalFocus) {
    terminal.focus();
  }
}

function openSettingsPanel(
  panel: HTMLFormElement,
  button: HTMLButtonElement,
  focusTarget: HTMLElement,
): void {
  for (const nextPanel of settingsPanels) {
    nextPanel.hidden = nextPanel !== panel;
  }
  for (const nextButton of settingsButtons) {
    nextButton.setAttribute("aria-expanded", String(nextButton === button));
  }
  focusTarget.focus();
  if (focusTarget instanceof HTMLInputElement) {
    focusTarget.select();
  }
}

function toggleSettingsPanel(
  panel: HTMLFormElement,
  button: HTMLButtonElement,
  focusTarget: HTMLElement,
): void {
  const open = panel.hidden;
  if (open) {
    openSettingsPanel(panel, button, focusTarget);
  } else {
    closeSettingsPanels();
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

systemThemeMediaQuery.addEventListener("change", () => {
  if (themeSelect.value === "system") {
    applyTerminalOptions(resolveTerminalSettings());
  }
});

function setSettingsFormValues(
  settings: ReturnType<typeof resolveTerminalSettings>,
): void {
  fontFamilyInput.value = settings.fontFamily;
  fontSizeInput.value = String(settings.fontSize);
  themeSelect.value = settings.theme;
  lineHeightInput.value = String(settings.lineHeight);
  letterSpacingInput.value = String(settings.letterSpacing);
  cursorStyleSelect.value = settings.cursorStyle;
  setSwitchChecked(cursorBlinkSwitchInput, settings.cursorBlink);
  scrollbackInput.value = String(settings.scrollback);
  scrollSensitivityInput.value = String(settings.scrollSensitivity);
  smoothScrollDurationInput.value = String(settings.smoothScrollDuration);
  terminalTypeInput.value = settings.terminalType;
}

function savedSettingsStatus(
  settings: ReturnType<typeof resolveTerminalSettings>,
) {
  return settings.terminalType === activeTerminalType
    ? t("status.settingsSaved")
    : t("status.settingsSavedNewTerminals");
}

fontSettingsButton.addEventListener("click", () => {
  toggleSettingsPanel(fontSettingsPanel, fontSettingsButton, fontFamilyInput);
});

themeSettingsButton.addEventListener("click", () => {
  toggleSettingsPanel(themeSettingsPanel, themeSettingsButton, themeSelect);
});

settingsButton.addEventListener("click", () => {
  toggleSettingsPanel(otherSettingsPanel, settingsButton, cursorStyleSelect);
});

const settingsControls = [
  fontFamilyInput,
  fontSizeInput,
  lineHeightInput,
  letterSpacingInput,
  themeSelect,
  cursorStyleSelect,
  cursorBlinkSwitchInput,
  scrollbackInput,
  scrollSensitivityInput,
  smoothScrollDurationInput,
  terminalTypeInput,
];

function saveCurrentSettings(): void {
  try {
    const saved = saveTerminalSettings({
      fontFamily: fontFamilyInput.value,
      fontSize: fontSizeInput.value,
      theme: themeSelect.value,
      lineHeight: lineHeightInput.value,
      letterSpacing: letterSpacingInput.value,
      cursorStyle: cursorStyleSelect.value,
      cursorBlink: cursorBlinkSwitchInput.checked,
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
    setStatus(
      isTerminalMessageError(error)
        ? t(error.terminalMessageKey, error.terminalMessageValues)
        : t("status.invalidSettings"),
    );
  }
}

function handleSettingsSubmit(event: SubmitEvent): void {
  event.preventDefault();
  saveCurrentSettings();
}

for (const control of settingsControls) {
  control.addEventListener("change", saveCurrentSettings);
}

for (const panel of settingsPanels) {
  panel.addEventListener("submit", handleSettingsSubmit);
}

document.addEventListener("pointerdown", (event) => {
  if (event.target instanceof Node && !settings.contains(event.target)) {
    closeSettingsPanels();
  }
});

window.addEventListener("message", (event) => {
  if (
    event.data != null &&
    typeof event.data === "object" &&
    "type" in event.data &&
    event.data.type === parentCloseSettingsMessageType
  ) {
    closeSettingsPanels({ restoreTerminalFocus: false });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && settingsPanels.some((panel) => !panel.hidden)) {
    event.preventDefault();
    closeSettingsPanels();
  }
});

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = new URL(
    `${protocol}//${window.location.host}/__backend/terminal`,
  );
  const token = backendWebSocketToken();
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.href;
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
      setStatus(t("status.connected"));
      terminal.focus();
      return;
    }

    if (message.type === "output") {
      terminal.write(message.data);
      return;
    }

    if (message.type === "exit") {
      created = false;
      closeTerminalTab();
      setStatus(
        t("status.exited", {
          reason: message.exitCode ?? message.signal ?? t("status.unknown"),
        }),
      );
      return;
    }

    const errorText = message.messageKey
      ? t(message.messageKey, message.messageValues)
      : message.message;
    setStatus(errorText);
    terminal.writeln(`\r\n${errorText}`);
  });

  socket.addEventListener("close", () => {
    created = false;
    setStatus(t("status.disconnected"));
  });

  socket.addEventListener("error", () => {
    setStatus(t("status.connectionError"));
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
