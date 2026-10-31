# Names, rooms & units

Statistics files on the Miniserver are named by UUID only
(`1a2b3c4d-…_2.202610`). The app shows the names, rooms and units you set in
Loxone Config instead, so you can find "Heat pump · Basement" without opening
files.

## Where they come from

When you connect, the app reads the Miniserver's structure file
(`/data/LoxAPP3.json`, the same file the Loxone app loads) once per app start:

- **Read-only** — it only downloads the file, nothing is changed on the Miniserver.
- It logs in with the same user and password as FTP. With FTPS the password is
  only sent over https, never over plain http.
- Only what the app needs (name, room, category, type and units per control) is
  kept, as `catalog.json` in the Miniserver's cache folder.
- Renamed something in Loxone Config? Restart the app to pick it up.

If the structure file can't be read (web server off, user without permission,
custom web port), the app falls back to the name stored in each file's header,
as before. That needs one small download per control.

## What you see

- **File list**: the name, with the room underneath. The filter matches names
  and rooms, so typing a room lists everything in it.
- **Editor**: the name as title, then the file name, room and unit.
- **Units** come from the control's display format (`%.1f kWh` → kWh). For Meter
  controls the file suffix decides: `_1` power (kW), `_2` meter reading (kWh),
  `_3` storage level (%). Energy-manager files show no unit, because their
  suffixes don't follow a fixed pattern.
- **MCP**: `list_stat_files` returns room, category, type and units per file
  and accepts a room as filter, so an assistant can answer "what's measured in
  the kitchen?".

## Offline and local folders

[Working offline](offline.md) with a downloaded Miniserver keeps the names and
rooms from the last connection. For a local folder (e.g. an SD-card copy), put a
`LoxAPP3.json` next to the stats files — you can download it from
`http://<miniserver>/data/LoxAPP3.json` in a browser.
