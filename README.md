# Lox DataManager

A modern, cross-platform viewer and editor for **Loxone Miniserver statistics** —
heavily inspired by [LoxStatEdit](https://github.com/mr-manuel/Loxone_LoxStatEdit).

> **Unofficial project.** Lox DataManager is an independent community tool and is
> not affiliated with, endorsed by or in any way related to
> [Loxone Electronics GmbH](https://www.loxone.com). "Loxone" and "Miniserver" are
> trademarks of their respective owner.
>
> **Use at your own risk.** The software is provided "as is", without warranty of any
> kind (see [LICENSE](LICENSE)). The author is not liable for lost or corrupted
> statistics, Miniserver malfunctions, downtime or any other damage resulting from its
> use. Keep your own backup of the SD card before editing.

<a href="https://www.buymeacoffee.com/andileeb"><img src="https://cdn.buymeacoffee.com/buttons/v2/lato-yellow.png" alt="Buy me a coffee" height="40"></a>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/editor-dark.png">
  <img src="docs/images/editor-light.png" alt="Editor with chart, entry grid and problems panel">
</picture>

Browse the statistics stored on your Miniserver's SD card, chart them, fix broken
entries (spikes, gaps, wrong meter readings), and upload the corrected files back —
all from an installable desktop app for macOS and Windows. No config files: enter
your Miniserver connection in the app.

## Features

- **Browse** `/stats` on the Miniserver via FTP/FTPS: file list with stat name, month,
  size, modification date, and local sync status
- **Chart + grid viewer** for the binary stat files (handles 40k+ entries per month
  smoothly), with validation ("Problems") like LoxStatEdit: wrong UUIDs, unordered
  timestamps, out-of-month entries, NaN values
- **Edit**: change timestamps and values inline, insert/delete entries, fill gaps with
  interpolated entries, bulk-calculate (`v * 1000`, `(v - 32) / 1.8`, …)
- **Round-trip safe**: files are re-serialized byte-identically (verified by tests) —
  only what you change changes
- **Upload back** to the Miniserver: the confirm shows what changes (entries changed / added /
  removed vs. the server copy), then a post-upload checklist (restart + app cache)
- **Automatic backups**: the server copy is saved before every upload or delete and can
  be restored from the editor — see [Backups](docs/backups.md)
- **Undo/redo** (30 steps) and the usual [keyboard shortcuts](docs/guide.md#keyboard-shortcuts)
- **Work offline**: open downloaded stats, a backup folder or single files without
  connecting — see [Work offline](docs/offline.md)
- **CSV export**, saved connections (password in the OS keychain), Gen 1 and Gen 2 support
- **MCP server**: let AI assistants (Claude Code, Claude Desktop, …) browse, analyze,
  and fix your statistics through the app — see [MCP server](#mcp-server)

## How it works

**1. Connect** — enter your Miniserver's address and an admin user. Auto-detect picks
FTPS when the Miniserver offers it; saved connections keep the password in the OS keychain.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/connect-dark.png">
  <img src="docs/images/connect-light.png" alt="Connection screen" width="640">
</picture>

**2. Browse** — every statistics file on the SD card, with its name, month and whether
your local copy is downloaded, changed locally or newer on the Miniserver.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/browser-dark.png">
  <img src="docs/images/browser-light.png" alt="File browser with sync status">
</picture>

**3. Fix** — open a month to chart it and spot spikes, gaps and broken entries. Edit
values inline, fill gaps, or recalculate a whole column with a formula.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/formula-dark.png">
  <img src="docs/images/formula-light.png" alt="Formula dialog converting values">
</picture>

**4. Upload** — save and upload the corrected file, then restart the Miniserver and
clear the Loxone app's cache (the app reminds you). The previous server copy is backed
up automatically, so you can always [restore it](docs/backups.md).

**Optional: let an AI help** — turn on the built-in MCP server in Settings and ask
Claude (or any MCP client) to find and fix problems for you. See [MCP server](#mcp-server).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/settings-dark.png">
  <img src="docs/images/settings-light.png" alt="Settings with the MCP server enabled" width="640">
</picture>

<sub>All screenshots show generated demo data (`pnpm run screenshots`).</sub>

More in the [guide](docs/guide.md).

## Installation

Download the latest release from [GitHub Releases](../../releases):

> **Renamed:** up to v0.3 the app was called *Loxone DataManager*. On macOS the new
> version installs as `Lox DataManager.app` next to the old one — delete
> `Loxone DataManager.app` afterwards. Saved connections, downloaded stats and backups
> carry over (you may have to re-enter a saved password once).

- **macOS** (13 Ventura or newer): `lox-datamanager-<version>.dmg`
- **Windows** (10 or newer, 64-bit): `lox-datamanager-<version>-setup.exe`

The builds are currently **unsigned**, so the OS will warn on first launch:

- **macOS**: Gatekeeper blocks the app. Either right-click → Open (older macOS), or on
  macOS 15+ go to **System Settings → Privacy & Security → "Open Anyway"**. Alternatively:
  `xattr -dr com.apple.quarantine "/Applications/Lox DataManager.app"`
- **Windows**: SmartScreen shows "Windows protected your PC" → **More info → Run anyway**.

## Enable FTP on your Miniserver (firmware 16.1+)

Since firmware 16.1 the Miniserver's FTP server is **disabled by default**. In
**Loxone Config**: select the Miniserver → network settings → set **FTP** to
*Enabled* or *Enabled – TLS only*, then save to the Miniserver. The app's
"Auto-detect" encryption mode tries FTPS first and falls back to plain FTP.

Connect with a Miniserver **admin** user.

### Connecting remotely

The app opens a plain FTP connection to whatever address you enter — nothing is
tunnelled or proxied. So remote access works exactly when the address leads **into
your own network** and the FTP port is reachable there:

- ✅ **VPN into the LAN** — connect to the Miniserver's local address (e.g.
  `192.168.11.23`) as if you were at home. Nothing exposed to the internet; the
  recommended way.
- ✅ **Your own DNS / DynDNS** — a router's dynamic-DNS name, a static IP, your own
  domain. Enter it like any other host, with the FTP port you forwarded.
- ❌ **Loxone Remote Connect** — the remote access built into Loxone Config, and what
  `dns.loxonecloud.com/<serial>` resolves to on a standard setup. **This does not
  work.** The address is a Loxone-operated relay, not your router: it proxies only
  HTTP(S) to the Miniserver's web server, so there is no FTP port behind it to reach.
  No router or firewall setting changes that. Tell-tale signs are a redirect target
  that changes IP *and* port between lookups and belongs to a hosting provider rather
  than your ISP.

The host field does accept a Loxone Cloud DNS address —
`dns.loxonecloud.com/<serial>`, where `<serial>` is the Miniserver's serial number
(its MAC without separators, shown in Loxone Config) — and re-resolves it on every
connect, since the published address changes. That is only useful in the **direct**
case, where the entry points at your own connection instead of the relay: Cloud DNS
publishes only the *web* port, so TCP/21 (or your forwarded port, which stays in the
app's port field) **and** the passive data-port range have to be opened separately.

Whichever route you pick, FTP must be enabled on the Miniserver — Cloud DNS resolves
an address, it does not switch anything on. And exposing FTP to the internet puts
admin credentials on the wire unless FTP is set to *Enabled – TLS only*, which is why
the VPN route is worth the setup.

## Important notes on editing

- Statistics live in monthly binary files `/stats/<uuid>.<yyyyMM>` on the SD card.
  The format is community-reverse-engineered (LoxStatEdit,
  [sarnau/Inside-The-Loxone-Miniserver](https://github.com/sarnau/Inside-The-Loxone-Miniserver)).
- After uploading an edited file, changes only appear once you **restart the
  Miniserver** and **clear the Loxone app's cache** (or remove/re-add the Miniserver
  in the app).
- Editing the **current month's** file is risky — the Miniserver keeps appending to it.
- Statistics of the newest meter/energy blocks ("statisticV2") use additional files
  (`<uuid>_1…_9.<yyyyMM>`); classic editing applies, but semantics differ per suffix
  (`_1` power, `_2` meter reading, `_3` storage level).

## Development

```bash
pnpm install
pnpm run dev        # Electron + Vue with HMR
pnpm test           # parser round-trip + validation + formula tests
pnpm run build      # typecheck + production build
pnpm run build:mac  # package .dmg (or build:win / build:linux)
pnpm run screenshots  # regenerate docs/images from demo data (after build)
```

Stack: Electron (main process: [basic-ftp](https://github.com/patrickjuchli/basic-ftp),
binary parser in TypeScript) + Vue 3, Pinia, PrimeVue 4, uPlot. Releases are built by
`.github/workflows/release.yml` on `v*` tags.

If you have real stat files with **3+ values per entry**, please drop anonymized copies
into `tests/fixtures/` (they are round-trip tested automatically) — the record layout
for those files has two conflicting community interpretations and real samples help
confirm the auto-detection.

## Feedback & contributing

Found a bug or missing a feature? Open an [issue](../../issues) — the templates ask
for the few details that usually matter (app version, OS, Miniserver generation).

Pull requests are welcome; please run `pnpm test` and `pnpm run lint` first.

This is a hobby project maintained in spare time, so replies may take a while.

## MCP server

The app can expose an [MCP](https://modelcontextprotocol.io) server so AI assistants
can view **and edit** statistics — connect, list files, summarize and validate data,
fill gaps, apply formulas, edit records, save, and upload (Loxone's official MCP
server is read-only; this one can write, because it uses the app's FTP path).

1. Open **Settings** (gear icon or Cmd/Ctrl+,) → **MCP server** → enable it.
2. Copy the shown command, e.g. for Claude Code:

   ```sh
   claude mcp add --transport http lox-datamanager http://127.0.0.1:12009/mcp \
     --header "Authorization: Bearer <token>"
   ```

   Any MCP client supporting Streamable HTTP works with the same URL + token.

3. Ask things like _"connect to my Miniserver, find gaps in last month's energy
   statistics and fill them"_ — destructive steps (upload, delete) always go through
   your client's tool-approval prompt.

The server listens on `127.0.0.1` only and runs while the app is open. The token can
be regenerated anytime in Settings.

## License

MIT — see [LICENSE](LICENSE). Not affiliated with Loxone Electronics GmbH. Provided as is,
without warranty; use at your own risk.

Built with the help of [Claude Code](https://claude.com/claude-code).
