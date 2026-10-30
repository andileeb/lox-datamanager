# Work offline & open local files

You don't need a Miniserver connection to look at or fix statistics. The
**Work offline** section on the connect screen opens stats from your computer.

## Downloaded stats of a Miniserver

Every Miniserver you have downloaded files from is listed there with its file
count, e.g. `Demo Home (miniserver.local) · 36 files`. Click it to open the
browser on your local copies.

- You see the files you downloaded earlier, not what is on the Miniserver right now.
- Chart, edit, fill gaps, calculate and **Save** work as usual. Saving writes into
  the app's download folder.
- Download, upload, delete and backup are hidden. They need a connection.
- When you connect to that Miniserver later, files you edited offline show up as
  **Local changes** and can be uploaded from there.

## Open a folder

**Open folder…** opens any folder that contains Loxone statistics files, such as an
extracted backup zip, a copy of the SD card's `/stats` folder or a LoxStatEdit
working folder. Only files named like the Miniserver names them are listed
(`<uuid>.YYYYMM`, meter outputs `<uuid>_2.YYYYMM`).

**Save writes back into that folder.** Work on a copy if you want to keep the
originals.

## Open single files

**Open files…** picks one or more stat files from one folder. A single file opens
straight in the editor. With several files the browser lists just those files.

## Getting changes back onto the Miniserver

Offline edits stay on your computer. To upload them:

- **Downloaded stats**: connect to the Miniserver and upload the files marked
  **Local changes**.
- **A folder or single files**: copy the edited files into the app's download
  folder for that Miniserver (connect, then use the folder button in the browser).
  They then show up as local changes.

Then restart the Miniserver and clear the Loxone app's cache, as after every
upload.

## AI assistants (MCP)

The MCP server works in an offline session too. `get_status` reports the open
folder (`localFolder`), `list_stat_files` lists the local files, and reading,
analyzing and saving work as when connected. Download and upload need a
connection.
