# architecture

a bit on how this whole thing is put together.

the general approach here is to download the electron app, unpack it and apply
as small a set of patches to it as possible to get it working.

an electron app has two parts, a part which runs in the main process and a part
which runs in the renderer process.

the main process part is basically a node process with a `require('electron')`
dependency. it runs even before anything is visible on the screen, setting up
the system tray widget, running background tasks and hooking up listeners for
app launcher events. there is a single instance of the main process regardless
of how many windows are open.

the ui runs inside an electron renderer process. in the desktop app, this looks
sorta like a browser with some modifications to the browser's chrome. it handles
displaying the interface, reacting to events from user interaction and holding
onto state which lives close to the ui (what text is in the prompt box for
example).

the electron renderer process usually launched by the electron main process. the
main process and render process communicate via an IPC setup in a [preload
script]. the preload script is injected into the renderer process before
anything else loads, has privileged access and can expose functions and data to
the renderer realm through `contextBridge.exposeInMainWorld`. the preload script
has access to [`ipcRenderer`].

codex-web hooks the preload script by providing [shim.ts](./src/browser/shim.ts)
as a stand-in for electron in the renderer process and then setting up preload
to run in the renderer realm (see
[vite.browser.config.ts](./vite.browser.config.ts)).

next, we apply a series of patches to both code running in the main process and
the renderer process. these are applied at postinstall time through the
[`prepare_asar`](./scripts/prepare_asar) script. patches are located
in [./patches](./patches) and applied ontop of the prettified code extracted
from the upstream app. care was taken here to patch at installation time to
avoid redistributing the original code.
the [./patches/webview-preload.patch](patches/webview-preload.patch) connects
the shimmed preload script to the index.html entrypoint.

we aim for the patches to be as small as possible as they're the most annoying
part to change. most behavior overrides live in the browser shim or server IPC
bridge instead of upstream bundle rewrites.

## patch inventory

static patches in [./patches](./patches) are applied by
[prepare_asar](./scripts/prepare_asar) after the upstream app is extracted and
prettified.

| patch                                    | purpose                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `webview-initial-route.patch`            | starts the memory router from the browser URL or shim-provided route and initializes sidebar state from the shim. |
| `webview-preload.patch`                  | adds `<base href="/">` and loads the codex-web preload bundle before the upstream renderer starts.                |
| `webview-remove-csp.patch`               | removes the upstream Electron CSP meta tag so the hosted browser app can load its patched runtime assets.         |
| `webview-use-atfs-for-local-files.patch` | maps upstream `app://fs` media URLs to codex-web's `/@fs` HTTP route.                                             |

dynamic patchers in [./scripts](./scripts) handle bundle shapes that are too
fragile for a fixed diff. [patch_webview_assets.mjs](./scripts/patch_webview_assets.mjs)
runs them during `prepare_asar`; [patch_browser_build_assets.mjs](./scripts/patch_browser_build_assets.mjs)
reuses the same set after `vite build` when upstream assets are present.

| patcher                          | purpose                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patch_browser_panel_iframe.mjs` | replaces Electron `<webview>` browser panel hosts with iframe-compatible hosts and URL sync helpers.                                                             |

to connect the ipc from the renderer process to the main process, we use a
websocket for most messages intercepting and handing a small handful of messages
directly (file picker, workspace picker). today, the remaining parts of shim are
for connecting the in memory router to the browser history and setting up the
sidebar behavior on mobile.

the ipc websocket is hosted by [main.ts](./src/server/main.ts). this process
binds a port and listens for incoming websocket connections. it also shims
electron (see `installModuleAliasHook`) before loading the electron shell
entrypoint. the shims are located in
[./src/server/electron](./src/server/electron) and focus on providing the
minimum amount of functionality needed to make the app work. this comes down to
some network transport to the outside world and hooking up to the ipc pipe from
the renderer. this part is the most sloppy part of the codebase as i left codex
to figure it out unattended. the parts around `__codexElectronIpcBridge` are the
important bits related to wiring up the ipc bridge.

browser panel support reuses the upstream renderer's browser sidebar and tab
management code. since a normal browser cannot host Electron's native
`<webview>` element, [`patch_browser_panel_iframe.mjs](./scripts/patch_browser_panel_iframe.mjs)
rewrites the bundled browser sidebar manager during `prepare_asar` so browser
panel hosts are iframes with a small Electron-webview compatibility surface.
the web runtime in [main.ts](./src/server/main.ts) synthesizes browser sidebar
state for URL navigation, back/forward history, reload/stop, zoom controls,
annotation toolbar state and find UI state. this keeps browser panel pages
visible and controllable in codex-web. native Electron-only actions such as
real page screenshots, cross-origin find matching, devtools, printing and
cross-origin annotation capture remain best-effort or unavailable.

Terminal panel entry points are handled by a runtime bootstrap injected from
[main.ts](./src/server/main.ts). it intercepts the sidebar Terminal action,
the bottom panel Terminal shortcut, and Ctrl+Backquote, then reuses the browser
panel UI to navigate to `/__terminal`; it does not patch the desktop app assets
for Terminal.

[preload script]: https://www.electronjs.org/docs/latest/tutorial/tutorial-preload
[`ipcRenderer`]: https://www.electronjs.org/docs/latest/api/ipc-renderer
