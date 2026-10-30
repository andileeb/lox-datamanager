# Manual E2E checklist (real Miniserver)

Run before tagging a release. Needs a Gen 2 / Compact Miniserver (fw 16.1+) and an
admin user. **Back up `/stats` first** (bulk download to the local folder).

## Connect

- [ ] FTP set to *Enabled – TLS only* in Loxone Config → connect with Auto-detect → badge shows **FTPS**
- [ ] FTP set to *Enabled* (plain) → connect with Auto-detect → badge shows **FTP**
- [ ] FTP set to *Disabled* → connect fails with the "Is FTP enabled…" hint
- [ ] Wrong password → "Login failed" error
- [ ] Save connection, quit app, relaunch → saved connection connects without re-entering the password

## Browse + download

- [ ] File list matches an external FTP client (names, sizes, count)
- [ ] Download a file → status becomes **Downloaded**, description column shows the stat name
- [ ] Bulk-select 10+ files → download with progress bar
- [ ] "Open local folder" shows the downloaded files
- [ ] Backup → save zip → file count matches /stats, one file byte-identical to a cached download, mtimes preserved; cancel the dialog → nothing downloads

## View

- [ ] Open a 1-value stat → chart matches the Loxone app's statistics view
- [ ] Open a large file (every-minute recording) → grid scrolls smoothly, chart zooms (drag) and resets (double-click)
- [ ] Open a suffixed meter file (`_2`) → values plausible (meter reading)
- [ ] If available: a 3+ value stat parses with zero problems (stride auto-detection) — if not, grab a copy for `tests/fixtures/`
- [ ] CSV export opens in a spreadsheet correctly

## Edit + upload (use a disposable/old month!)

- [ ] Edit one value → Save → re-open file → edit persisted locally
- [ ] Re-download the unedited original → byte-compare (`cmp`) with a pre-download copy → identical
- [ ] Edit → upload → confirm + post-upload checklist appear
- [ ] Backups → one entry; its file in `userData/stats-backups/<host>/<file>/` is byte-identical to the pre-upload server copy
- [ ] Restore it → editor shows the old values → upload → re-download matches the original (`cmp`)
- [ ] Restart Miniserver, clear app cache → edited value visible in the Loxone app
- [ ] Re-download the uploaded file → parses clean, shows the edit, no problems
- [ ] Insert row / delete rows / fill gaps / formula (`v * 2`) behave as expected and validation updates
- [ ] Current-month file shows the warning banner

## Delete

- [ ] Delete an old month's file → gone from the Miniserver (verify via FTP client), local copy kept

## Packaging

- [ ] macOS .dmg from the release workflow installs + launches (after Gatekeeper override)
- [ ] Windows setup .exe installs + launches (after SmartScreen override)
