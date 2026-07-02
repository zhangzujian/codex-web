# upgrading

codex-web is based on `JimLiu/decode-codex` at commit
`ddbb7ea19cd71b97e4e923befd7586633b19fe95`.

1. Update `DECODE_CODEX_COMMIT` in `scripts/resolve_decode_codex_source`.
2. Run `npm run prepare:asar`.
3. For upstream edits, first check `restored/`. If the corresponding file or
   code exists there, generate an ordinary git patch under
   `patches/restored/*.patch`.
4. Use `patches/asar/*.patch` only for code that is still only present in
   bundled `ref/` assets.
5. Validate with:

```bash
npm run prepare:asar
npm run build:browser
npm run build:server
node --test tests/prepare-cache.test.mjs tests/desktop-adaptation-pipeline.test.mjs
```

Do not add hosted archive or search-and-mutate patcher paths back.
