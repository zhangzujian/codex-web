# Repository Notes

When updating the upstream Codex Desktop app version, update all of these:

- `scripts/resolve_codex_app_zip`: `APP_VERSION`
- `default.nix`: `appVersion` and the `codexZip.hash` for that zip
- `tests/prepare-cache.test.mjs`: `appVersion` test fixture

To find the latest upstream Codex Desktop app version, check the Sparkle
appcast first and use Homebrew Cask as a cross-check:

```bash
curl -fsSL -A 'Mozilla/5.0' https://persistent.oaistatic.com/codex-app-prod/appcast.xml |
  sed -n 's|.*<sparkle:shortVersionString>\(.*\)</sparkle:shortVersionString>.*|\1|p' |
  head -1

curl -fsSL https://formulae.brew.sh/api/cask/codex-app.json | jq -r '.version'
```

If they differ, prefer the appcast; it is the source used by the app updater.
