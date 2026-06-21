import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/browser/terminal-page.ts", "utf8");

function expectAppend(targetName, expectedFields) {
  const match = source.match(
    new RegExp(`${targetName}\\.append\\(([\\s\\S]*?)\\);`),
  );
  assert.ok(match, `Missing append call for ${targetName}`);

  const fields = match[1]
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

  assert.deepEqual(fields, expectedFields);
}

test("terminal settings uses separate font, theme, and other panels", () => {
  assert.match(source, /const fontSettingsPanel = createSettingsPanel\(\);/);
  assert.match(source, /const themeSettingsPanel = createSettingsPanel\(\);/);
  assert.match(source, /const otherSettingsPanel = createSettingsPanel\(\);/);
  assert.doesNotMatch(source, /terminal-page__settings-title/);
  assert.doesNotMatch(source, /\.textContent = "Font"/);
  assert.doesNotMatch(source, /\.textContent = "Theme"/);
  assert.doesNotMatch(source, /\.textContent = "Other settings"/);

  expectAppend("fontSettingsPanel", [
    "fontFamilyLabel",
    "fontSizeLabel",
    "lineHeightLabel",
    "letterSpacingLabel",
  ]);
  expectAppend("themeSettingsPanel", ["themeLabel"]);
  expectAppend("otherSettingsPanel", [
    "cursorStyleLabel",
    "cursorBlinkLabel",
    "scrollbackLabel",
    "scrollSensitivityLabel",
    "smoothScrollDurationLabel",
    "terminalTypeLabel",
  ]);
});

test("terminal settings icon buttons open their own panels", () => {
  assert.match(
    source,
    /const fontSettingsButton = createSettingsButton\(\n\s*t\("settings\.font"\),\n\s*"font",\n\s*"terminalFontSettingsButton",\n\);/,
  );
  assert.match(
    source,
    /const themeSettingsButton = createSettingsButton\(\n\s*t\("settings\.theme"\),\n\s*"theme",\n\s*"terminalThemeSettingsButton",\n\);/,
  );
  assert.match(
    source,
    /settings\.append\(\n\s*fontSettingsButton,\n\s*themeSettingsButton,\n\s*settingsButton,\n\s*fontSettingsPanel,\n\s*themeSettingsPanel,\n\s*otherSettingsPanel,\n\);/,
  );
  assert.match(
    source,
    /fontSettingsButton\.addEventListener\("click", \(\) => \{\n\s*toggleSettingsPanel\(fontSettingsPanel, fontSettingsButton, fontFamilyInput\);\n\s*\}\);/,
  );
  assert.match(
    source,
    /themeSettingsButton\.addEventListener\("click", \(\) => \{\n\s*toggleSettingsPanel\(themeSettingsPanel, themeSettingsButton, themeSelect\);\n\s*\}\);/,
  );
  assert.match(
    source,
    /settingsButton\.addEventListener\("click", \(\) => \{\n\s*toggleSettingsPanel\(otherSettingsPanel, settingsButton, cursorStyleSelect\);\n\s*\}\);/,
  );
});

test("terminal type dropdown offers all supported terminal types", () => {
  assert.match(
    source,
    /import \{\n\s*completeTerminalSettings,\n\s*resolveTerminalSettings,\n\s*saveTerminalSettings,\n\s*SUPPORTED_TERMINAL_TYPES,\n\} from "\.\/terminal-options\.mjs";/,
  );
  assert.match(
    source,
    /const terminalTypeInput = createSelect\(\n\s*"terminalType",\n\s*SUPPORTED_TERMINAL_TYPES,\n\);/,
  );
  assert.doesNotMatch(source, /terminal-type-options/);
});

test("terminal settings do not render reset or apply buttons", () => {
  assert.doesNotMatch(source, /createSettingsActions/);
  assert.doesNotMatch(source, /terminalSettingsReset/);
  assert.doesNotMatch(source, /terminalSettingsApply/);
  assert.doesNotMatch(source, /\.textContent = "Reset"/);
  assert.doesNotMatch(source, /\.textContent = "Apply"/);
});

test("terminal settings are saved when controls change", () => {
  assert.match(
    source,
    /const settingsControls = \[\n\s*fontFamilyInput,\n\s*fontSizeInput,\n\s*lineHeightInput,\n\s*letterSpacingInput,\n\s*themeSelect,\n\s*cursorStyleSelect,\n\s*cursorBlinkSwitchInput,\n\s*scrollbackInput,\n\s*scrollSensitivityInput,\n\s*smoothScrollDurationInput,\n\s*terminalTypeInput,\n\];/,
  );
  assert.match(
    source,
    /for \(const control of settingsControls\) \{\n\s*control\.addEventListener\("change", saveCurrentSettings\);\n\s*\}/,
  );
});

test("cursor blink uses a switch input", () => {
  assert.match(source, /const cursorBlinkSwitchInput = createSwitchInput\(/);
  assert.match(source, /input\.setAttribute\("role", "switch"\);/);
  assert.match(
    source,
    /function setSwitchChecked\([\s\S]*?input\.checked = checked;\n\s*input\.setAttribute\("aria-checked", String\(checked\)\);\n\}/,
  );
  assert.match(
    source,
    /input\.addEventListener\("change", \(\) => \{\n\s*input\.setAttribute\("aria-checked", String\(input\.checked\)\);\n\s*\}\);/,
  );
  assert.match(
    source,
    /setSwitchChecked\(cursorBlinkSwitchInput, settings\.cursorBlink\);/,
  );
  assert.match(source, /cursorBlink: cursorBlinkSwitchInput\.checked,/);
  assert.doesNotMatch(source, /cursorBlinkInput\.type = "checkbox"/);
  assert.doesNotMatch(source, /createRadioInput/);
  assert.doesNotMatch(source, /terminal-page__settings-checkbox/);
  assert.doesNotMatch(source, /terminal-page__settings-radio/);
});

test("system terminal theme follows the OS color scheme", () => {
  assert.match(
    source,
    /const systemThemeMediaQuery = window\.matchMedia\("\(prefers-color-scheme: dark\)"\);/,
  );
  assert.match(
    source,
    /const effectiveThemeName =\n\s*themeName === "system"\n\s*\? systemThemeMediaQuery\.matches\n\s*\? "dark"\n\s*: "light"\n\s*: themeName;/,
  );
  assert.match(
    source,
    /systemThemeMediaQuery\.addEventListener\("change", \(\) => \{\n\s*if \(themeSelect\.value === "system"\) \{\n\s*applyTerminalOptions\(resolveTerminalSettings\(\)\);\n\s*\}\n\s*\}\);/,
  );
});

test("terminal page padding background follows the active terminal theme", () => {
  assert.match(
    source,
    /function applySurfaceTheme\(themeName: string\): void \{\n\s*const background = terminalTheme\(themeName\)\.background \?\? "";\n\s*surface\.style\.background = background;\n\s*page\.style\.background = background;\n\s*\}/,
  );
});

test("terminal settings panels close when clicking outside settings", () => {
  assert.match(
    source,
    /document\.addEventListener\("pointerdown", \(event\) => \{\n\s*if \(event\.target instanceof Node && !settings\.contains\(event\.target\)\) \{\n\s*closeSettingsPanels\(\);\n\s*\}\n\}\);/,
  );
});

test("terminal settings panels close when the parent page requests it", () => {
  assert.match(
    source,
    /const parentCloseSettingsMessageType = "codex-web-terminal-close-settings";/,
  );
  assert.match(
    source,
    /window\.addEventListener\("message", \(event\) => \{\n\s*if \(\n\s*event\.data != null &&\n\s*typeof event\.data === "object" &&\n\s*"type" in event\.data &&\n\s*event\.data\.type === parentCloseSettingsMessageType\n\s*\) \{\n\s*closeSettingsPanels\(\{ restoreTerminalFocus: false \}\);\n\s*\}\n\}\);/,
  );
});
