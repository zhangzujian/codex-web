# Repository Notes

When updating the upstream Codex Desktop app version, update all of these:

- `scripts/resolve_codex_app_zip`: `APP_VERSION`
- `default.nix`: `appVersion` and the `codexZip.hash` for that zip
- `tests/prepare-cache.test.mjs`: `appVersion` test fixture
