# CLAUDE.md — Loxone DataManager

Electron desktop app (100% TypeScript) to view and **edit** Loxone Miniserver
statistics: browse `/stats` via FTP/FTPS, chart/edit the binary monthly files,
upload them back. Heavily inspired by LoxStatEdit (Windows/.NET).
User-facing docs live in README.md; this file is for working on the code.

## Commands (pnpm only — packageManager is pinned)

```bash
pnpm install          # pnpm 10: build scripts allowlisted via pnpm.onlyBuiltDependencies
pnpm run dev          # Electron + Vue with HMR
pnpm test             # vitest: parser round-trip, validation, formula, FTP date parsing
pnpm run build        # typecheck (node + web) + electron-vite build
pnpm run lint         # eslint + prettier rules
pnpm run build:mac    # package .dmg (build:win / build:linux)
```

Release: push a `v*` tag → `.github/workflows/release.yml` builds macOS universal
.dmg + Windows NSIS setup.exe (unsigned) and drafts a GitHub Release.

## Architecture

- `src/main/` — Node/Electron main process. ALL FTP + file I/O lives here.
  - `ftp.ts` — one basic-ftp Client in a module singleton; every op serialized
    through a promise queue (`run()`) with one auto-reconnect retry; TLS
    auto-detect = try FTPS (`secure: true`, `rejectUnauthorized: false` — Miniserver
    certs are self-signed) then fall back to plain. LIST dates have no year →
    `parseListDate` heuristic (assume this year unless future).
  - `statfile.ts` — binary parser/serializer, **pure TS, no Electron imports**
    (unit-testable). See "Binary format" below.
  - `cache.ts` — per-host download cache in `userData/stats-cache/<host>/`.
    `cachePath()` validates names against `STAT_FILENAME_RE` (path-traversal guard).
  - `store.ts` — saved connections: plain JSON in userData + passwords encrypted
    with Electron `safeStorage` (no keychain → password simply not stored).
  - `stats-service.ts` — shared session logic for IPC **and** MCP so they can't
    diverge: `CodedError`/`toApiError`, the `parsedFiles` Map (serialization
    re-emits the original header bytes verbatim), `saveRecords`, `buildCsv`,
    MCP-side dirty tracking.
  - `ipc.ts` — all handlers, thin over stats-service. Every response is
    `IpcResult<T> = {ok,data}|{ok,error}` with typed `ApiError.code` (e.g.
    `FTP_REFUSED` triggers the "enable FTP" hint in the UI).
  - `mcp.ts` + `mcp-tools.ts` — embedded MCP server (`@modelcontextprotocol/sdk`
    v1, **stateless** Streamable HTTP: fresh `McpServer` + transport per POST) on
    `http://127.0.0.1:<port>/mcp`, default port 12009. Bearer-token auth (token
    generated in Settings, safeStorage-encrypted in store.ts, `plain:` prefix
    fallback); 20 tools + `fix-statistics` prompt share ftp/cache/stats-service
    with the UI. Edits are in-memory until `save_stat_file`; `mcp:activity`
    events tell the renderer to refresh (EditorView shows a reload banner —
    last-save-wins, no merging). Lifecycle: start on app ready if enabled,
    `mcp:configure` IPC restarts, `EADDRINUSE` lands in `McpState.error`.
  - `updates.ts` — release-notification only, **no Electron imports** (takes the
    current version as an argument, so it unit-tests). One `fetch` of GitHub's
    `/releases/latest` per launch; every failure (offline, 403 rate-limit, no
    published release) resolves as `latest: null` — a failed check must never
    surface as an app error. See "Auto-update" below for why there's no installer.
- `src/preload/index.ts` — contextBridge exposing `window.api`, typed by the
  single contract interface in `src/shared/api.ts` (preload implements it,
  renderer consumes it — extend the interface first when adding IPC).
- `src/shared/` — types + `time.ts` (Loxone epoch helpers, multi-format
  timestamp parsing) + `formula.ts` (hand-rolled CSP-safe parser) + `records.ts`
  (pure record transforms: dominantInterval, fillGaps, summarizeRecords,
  statusOf, isCurrentMonth — used by the editor store AND the MCP tools; put new
  record logic here, not in a Pinia action).
- `src/renderer/src/` — Vue 3 + Pinia + PrimeVue 4 + uPlot + vue-i18n. Views:
  Connection → Browser (file list w/ sync status) → Editor (chart + virtualized
  grid + problems panel), plus Settings (Cmd/Ctrl+, or gear icon). Router guard:
  everything except `/connect` and `/settings` needs a connection.
- **i18n**: en + de catalogs in `renderer/src/locales/` (`de.ts` is typed
  `typeof en` so missing keys fail typecheck). ALL user-facing strings go
  through `t()`; error codes map to `errors.*` keys via `errorText()` in
  `i18n.ts`; validation problems translate by `rule` code in ProblemsPanel.
  Main-process messages stay English (fallback only).
- **Prefs** (`renderer/src/prefs.ts`, localStorage): date format (default
  DD.MM.YYYY) + time format (default 24h for every language — never let a
  locale silently switch to AM/PM). Editor-grid timestamps always render 24h so
  they stay parseable; `displayToLox` accepts all three date formats by
  separator. Theme lives in `renderer/src/theme.ts` (`.app-dark` class =
  PrimeVue darkModeSelector; chart palette watches `isDark`).

## Domain knowledge (hard-won, don't rediscover)

- **Binary stat file** (little-endian): header `u16 valueCount, u16 unknown
  (often 0x8000), u32 controlType, i32 textLen, utf8 name, 0x00, zero-pad to
  stride`; then records `u16 uuidFrag1 (3rd uuid group), u16 uuidFrag2 (2nd
  group), u32 ts (seconds since 2009-01-01), valueCount × f64, pad to stride`.
- **Stride ambiguity**: for valueCount ≥ 3 LoxStatEdit (`8+8n+8`) and sarnau
  (slot buckets 1/3/7/10) disagree. `parseStatFile` detects empirically per file
  (divisibility + uuid frags + ascending ts). Real 3+-value fixture files wanted
  in `tests/fixtures/` (auto-round-trip-tested).
- **Byte fidelity invariant**: serialization re-emits stored `headerBytes`
  verbatim; round-trip must be byte-identical (tests enforce). Never "normalize"
  the header.
- Timestamps are displayed **as stored** (UTC component formatting, no TZ
  conversion) — exactly like LoxStatEdit. Loxone epoch offset = 1230768000.
- **Write path is FTP-only** (no HTTP/WS API can write stats). Firmware 16.1+
  ships FTP **disabled**; Loxone Config → Miniserver network settings enables it.
- **Loxone Cloud DNS** (`dns.loxonecloud.com/<serial>`) is an HTTP **307 redirect**,
  not a DNS record: `Location: https://<ip-with-dashes>.<serial>.dyndns.loxonecloud.com:<webPort>/`.
  `resolveHost()` in ftp.ts takes only the hostname — the port is the *web* port,
  FTP keeps the port from the form. Both host and port change over time, so resolve
  per connect (inside `open()`), never at save time. Reaching FTP that way still
  needs port 21 + the passive range forwarded, so it only works when the entry
  points at the user's **own** IP. With **Loxone Remote Connect** the entry points
  at a Loxone relay (measured: Hetzner CLOUD-NBG1, IP *and* port change between
  lookups, only the announced web port open) which proxies HTTP(S) only — FTP is
  unreachable there by design, no router change helps. VPN is the only remote path.
- After upload the Miniserver must be **restarted** + Loxone app cache cleared —
  the UI shows this checklist; keep it.
- Current-month files are still being appended by the Miniserver → editor warns.
- Loxone's official MCP server (fw 17.1) reads history but cannot write; it's a
  potential read-only add-on, never a replacement for FTP.
- **Auto-update**: only the *notification* exists (`updates.ts`), deliberately.
  `electron-updater` with the GitHub provider is free for a public repo, but
  macOS auto-update needs a real Developer ID signature — Squirrel.Mac rejects
  unsigned updates (`Could not get code signature for running application`) — plus a
  `zip` target next to the `dmg`. Builds here are unsigned (`notarize: false`), so it
  would work on Windows NSIS only. Prerequisites if that ever changes: a `publish:`
  block in electron-builder.yml (without it no `latest*.yml` / `app-update.yml` is
  produced), `--publish always` in release.yml, the `.yml` + `.blockmap` assets
  attached, and a **published** release — the updater ignores drafts.

## Constraints & gotchas

- **Licensing: MIT-only dependencies.** PrimeVue is pinned to the 4.x line,
  primeicons to 7.x and `@primeuix/themes` to 2.x — v5 / v8+ / v3+ are under the
  commercial "PrimeUI" license (license key + eligibility). Do NOT upgrade these majors. If PrimeVue 4
  becomes unmaintained, migrate to an MIT alternative (e.g. Naive UI).
- Renderer CSP forbids eval → bulk-edit formulas use the hand-rolled parser in
  `src/shared/formula.ts`. Don't replace it with `new Function`.
- MCP smoke test without the UI: put
  `"mcp": {"enabled": true, "port": 12009, "tokenEnc": "plain:<token>"}` into
  `userData/connections.json`, run the app, then
  `curl -X POST http://127.0.0.1:12009/mcp -H "Authorization: Bearer <token>" …`
  with an `initialize` / `tools/call` JSON-RPC body.
- Vue reactive proxies **cannot cross the contextBridge** ("object could not be
  cloned") — clone to plain objects before any `window.api` call that sends
  records (see `plain()` in `stores/editor.ts`).
- pnpm 10 blocks dependency postinstall scripts; `electron`, `electron-winstaller`,
  `esbuild` are allowlisted in package.json — without this Electron's binary
  never downloads.
- `npmRebuild: false` in electron-builder.yml (no native modules — keep it that way).

## Testing

- `pnpm test`: fixtures are **built in-memory** by `tests/build-statfile.ts`
  (independent byte-level builder so round-trip tests aren't circular), both
  stride variants, plus the adversarial size-divisible-by-both case.
- E2E: no committed harness; the pattern that works is Playwright `_electron`
  driving the built app against a local `ftp-srv` fake Miniserver with generated
  stat files (connect → browse → download → edit → save → upload → verify bytes
  on the server → delete). Rebuild (`pnpm run build`) before driving — the app
  loads from `out/`.
- Screenshots: `pnpm run build && pnpm run screenshots` (`scripts/screenshots.mts`)
  drives the built app against a local ftp-srv with generated demo stat files and a
  throwaway profile (`LDM_USER_DATA` env overrides userData). **Never** real data,
  hosts, tokens or the real profile in docs images; quit the real app first (port 12009).
- Before a release run `docs/e2e-checklist.md` against a real Gen 2 Miniserver.
