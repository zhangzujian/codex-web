# architecture

a bit on how this whole thing is put together.

the general approach here is to start from
[`JimLiu/decode-codex`](https://github.com/JimLiu/decode-codex) at commit
`ddbb7ea19cd71b97e4e923befd7586633b19fe95`. that source provides two trees:

- `ref/`: the runnable decoded Electron app layout.
- `restored/`: reverse-engineered source reconstructed from the bundled app.

`prepare_asar` copies both into `scratch/asar` and `scratch/restored`, applies
small patches, then materializes patched restored files back into the runtime
tree when needed.

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
as a stand-in for electron in the renderer process, building that preload
bundle with [vite.browser.config.ts](./vite.browser.config.ts), then injecting
it from [main.ts](./src/server/main.ts) when serving the webview shell.

next, we apply a series of patches to code running in the main process and the
renderer process. these are applied by [`prepare_asar`](./scripts/prepare_asar).
patches are restored-first: if the corresponding file or code exists in
`restored/`, the patch lives under `patches/restored` and is applied with
`git apply` to `scratch/restored`. if the patched restored file does not exist
at the same path in `scratch/asar`, `prepare_asar` regenerates the matching
runtime chunk with
[`generate_restored_runtime_chunk.mjs`](./scripts/generate_restored_runtime_chunk.mjs).
`patches/asar` is only a fallback for code that is still only present in bundled
`ref/` assets, and the script rejects an asar patch when restored has the same
target path.
the server also strips the upstream Electron CSP meta tag before sending the
webview shell, so runtime bootstrap scripts can run without a static HTML patch.

we aim for the patches to be as small as possible as they're the most annoying
part to change. most behavior overrides live in the browser shim or server IPC
bridge instead of upstream bundle rewrites.

## patch inventory

static patches in [./patches](./patches) are applied by
[prepare_asar](./scripts/prepare_asar) after the decoded app base is copied.

| patch                      | purpose                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `webview-favicon.patch`    | adds the codex-web favicon to the upstream `index.html`.                                                  |
| `webview-preload.patch`    | adds `<base href="/">` and loads the codex-web preload bundle before the upstream renderer starts.        |
| `webview-pwa.patch`        | links the web app manifest.                                                                               |
| `webview-remove-csp.patch` | removes the upstream Electron CSP meta tag so the hosted browser app can load its patched runtime assets. |

restored patches in [./patches/restored](./patches/restored) are ordinary git
diffs applied by `git apply`.

| patch                                             | target restored source                                         | purpose                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `disable-avatar-overlay.patch`                    | `main/ipc/view-message-ipc/view-message-handler.ts`            | disables the native pet/avatar overlay window path.                     |
| `hide-app-header-navigation-buttons.patch`        | `app-shell/sidebar-navigation-controls.tsx`                    | removes the header back/forward buttons.                                |
| `hide-settings-pets-entry.patch`                  | `settings/settings-sections.ts`                                | removes the pets settings entry.                                        |
| `reuse-main-window-for-open-in-new-window.patch`  | `main/ipc/view-message-ipc/view-message-handler.ts`            | reuses the single browser window for upstream open-in-new-window events. |
| `statsig-telemetry-disable.patch`                 | `vendor/remote-projects-app-shared-current-bundle.ts`          | disables Statsig telemetry from restored source where available.         |

fallback patches in [./patches/asar](./patches/asar) are also ordinary git
diffs, but `prepare_asar` rejects them if the target path already exists in
`restored/`.

| patch                             | purpose                                                               |
| --------------------------------- | --------------------------------------------------------------------- |
| `statsig-telemetry-disable.patch` | disables remaining Statsig calls in bundled runtime assets not covered by restored source. |

to connect the ipc from the renderer process to the main process, we use a
websocket for most messages, while intercepting a small handful directly in the
browser preload shim: local settings, file picker, workspace picker, browser-tab
URL opens and route/shared-object normalization. today, the remaining parts of
the shim connect the in-memory router to browser history and set up sidebar
behavior on mobile.

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

browser mode uses the local host model. the browser preload reports the host as
`local`, disables remote ssh connection features, stores browser-only settings
in `localStorage`, and opens GitHub/GitLab links in the user's browser tab
instead of asking the server to native-open them.

[preload script]: https://www.electronjs.org/docs/latest/tutorial/tutorial-preload
[`ipcRenderer`]: https://www.electronjs.org/docs/latest/api/ipc-renderer
