# Repository Notes

This repository uses `JimLiu/decode-codex` at commit
`ddbb7ea19cd71b97e4e923befd7586633b19fe95`. `prepare_asar` resolves:

- default source cache: `.cache/decode-codex/<commit>`
- required source dirs: `ref/` and `restored/`
- optional override: `CODEX_DECODE_CODEX_DIR=/path/to/decode-codex`
- low-level ref override: `CODEX_APP_BASE_DIR=/path/to/ref`, only when the
  sibling or `CODEX_DECODE_CODEX_DIR` provides `restored/`

Bundle edits must be ordinary git patches, not JavaScript scripts that search
bundled source and mutate files. Patch `patches/restored/*.patch` first when
`restored/` has the corresponding file or code. Use `patches/asar/*.patch` only
when the code is still only present in `ref/`.
