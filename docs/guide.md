# Loxone DataManager guide

Feature pages beyond the [README](../README.md) overview.

- [Work offline & open local files](offline.md) — downloaded stats, backups and
  SD-card copies without connecting to a Miniserver
- [Automatic backups & restore](backups.md) — the server copy is saved before every
  upload or delete, restorable from the editor

## Keyboard shortcuts

Cmd on macOS, Ctrl on Windows/Linux.

| Where      | Shortcut             | Action                   |
| ---------- | -------------------- | ------------------------ |
| Everywhere | Cmd+,                | Settings                 |
| File list  | Cmd+F                | Focus the filter         |
| File list  | Cmd+R / F5           | Refresh the file list    |
| File list  | Esc                  | Clear the selection      |
| Editor     | Cmd+S                | Save locally             |
| Editor     | Cmd+Z                | Undo (last 30 steps)     |
| Editor     | Shift+Cmd+Z / Ctrl+Y | Redo                     |
| Editor     | Cmd+A                | Select all rows          |
| Editor     | Delete / Backspace   | Delete the selected rows |
| Editor     | Esc                  | Clear the selection      |

While typing in a cell, Cmd+Z and Cmd+A act on the cell's text, and Delete /
Backspace edit it; Enter or Tab commits the value. Cmd+R never reloads the
window, so unsaved edits are safe.
