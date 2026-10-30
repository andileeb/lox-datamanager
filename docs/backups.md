# Automatic backups & restore

Before the app overwrites or deletes a file on the Miniserver, it saves the
Miniserver's current copy on your computer. That covers uploads and deletes from
the file list, the editor and the [MCP server](../README.md#mcp-server). If an
upload goes wrong, you can put the previous version back.

## Restore a previous version

1. Connect to the Miniserver and open the file in the editor.
2. Click **Backups**. The list shows one entry per upload or delete, newest first.
3. Click **Restore** next to the version you want. It replaces your local copy
   (unsaved edits are lost — the dialog warns you).
4. Check the chart, then **Upload to Miniserver** and follow the restart checklist.

Restoring never touches the Miniserver by itself: you review the old version
first and upload it like any other edit. That upload backs up the current server
copy as well, so a restore can be undone the same way.

## Details

- The newest **10** backups per file are kept; older ones are removed automatically.
- If the server copy can't be downloaded (other than the file not existing yet),
  the upload or delete is stopped — the app never overwrites without a backup.
- Backups are stored per Miniserver in the app's data folder, under
  `stats-backups/<host>/<file>/`:
  - macOS: `~/Library/Application Support/Loxone DataManager/`
  - Windows: `%APPDATA%\Loxone DataManager\`
- The Backups button needs a connection; it's hidden while working
  [offline](offline.md).
- For a full snapshot of the SD card use **Backup** in the file list, which
  downloads every file into a zip.
