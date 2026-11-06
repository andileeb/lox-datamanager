export default {
  connect: {
    title: 'Lox DataManager',
    subtitle: 'Connect to your Miniserver to view and edit statistics',
    savedConnections: 'Saved connections',
    host: 'Host',
    port: 'Port',
    user: 'User',
    password: 'Password',
    encryption: 'Encryption',
    tlsAuto: 'Auto-detect',
    tlsFtps: 'FTPS (TLS)',
    tlsPlain: 'Plain FTP',
    saveConnection: 'Save connection',
    namePlaceholder: 'Name (optional)',
    offline: 'Work offline',
    offlineHint:
      'View and edit statistics without connecting — downloaded files, a backup or an SD-card copy. Upload needs a connection.',
    cachedHost: '{name} · 1 file | {name} · {n} files',
    openFolder: 'Open folder…',
    openFiles: 'Open files…',
    removeSaved: 'Remove saved connection',
    offlineCopy:
      'Work offline with the downloaded file | Work offline with the {n} downloaded files',
    connect: 'Connect',
    cancel: 'Cancel connection attempt',
    ftpHint:
      '<b>Is FTP enabled on your Miniserver?</b> Since firmware 16.1 the FTP server is disabled by default. In Loxone Config, open your Miniserver\'s network settings and set FTP to "Enabled" or "Enabled – TLS only", then save to the Miniserver and try again.'
  },
  browser: {
    retrying: 'trying again every 10 seconds…',
    filterPlaceholder: 'Filter files…',
    allMonths: 'All months',
    allStatuses: 'All statuses',
    downloadSelected: 'Download {n} selected',
    uploadSelected: 'Upload {n} selected',
    backup: 'Backup',
    disconnect: 'Disconnect',
    close: 'Close',
    offline: 'Offline',
    colFile: 'File',
    colDescription: 'Description',
    colMonth: 'Month',
    colSize: 'Size',
    colModified: 'Modified',
    colStatus: 'Status',
    unknown: 'unknown',
    unknownTooltip:
      "No stat name found in this control's file headers yet — its files may be empty or their download failed. Refreshing retries other months.",
    empty: 'No statistics files found in /stats.',
    emptyLocal: 'No statistics files (<uuid>.YYYYMM) in this folder.',
    tipRefresh: 'Refresh file list',
    tipOpenFolder: 'Open local download folder',
    tipOpenThisFolder: 'Show this folder in the file manager',
    tipBackup: 'Download all stats from the Miniserver into a zip file',
    tipDownload: 'Download to this computer',
    tipOpen: 'Open chart & editor',
    tipUpload: 'Upload local copy to the Miniserver',
    tipDelete: 'Delete from the Miniserver',
    tipLanguage: 'Language',
    tipTheme: 'Switch between light and dark mode',
    deleteTitle: 'Delete from Miniserver?',
    deleteBody:
      'This deletes the file from the Miniserver. The server copy is backed up first and a local copy, if any, is kept:',
    deleteConfirm: 'Delete',
    cancel: 'Cancel'
  },
  status: {
    'only-remote': 'Not downloaded',
    'only-local': 'Only local',
    same: 'Downloaded',
    'remote-newer': 'Newer on Miniserver',
    'local-newer': 'Local changes'
  },
  suffix: {
    power: 'power',
    meterReading: 'meter reading',
    storageLevel: 'storage level',
    output: 'output {n}'
  },
  editor: {
    back: 'Back to file list',
    meta: '{entries} entries · {values} value(s)',
    errors: '1 error | {n} errors',
    warnings: '1 warning | {n} warnings',
    exportCsv: 'Export CSV',
    save: 'Save',
    saveTip: 'Save locally (Cmd/Ctrl+S)',
    upload: 'Upload to Miniserver',
    undo: 'Undo (Cmd/Ctrl+Z)',
    redo: 'Redo (Shift+Cmd/Ctrl+Z)',
    insertAbove: 'Insert above',
    insertBelow: 'Insert below',
    delete: 'Delete',
    deleteN: 'Delete {n}',
    fixResets: 'Repair meter reset',
    fillGaps: 'Fill gaps',
    calculate: 'Calculate…',
    timestamp: 'Timestamp',
    value: 'Value {n}',
    problems: 'Problems',
    noProblems: 'No problems found',
    currentMonthWarning:
      "This is the <b>current month's</b> file — the Miniserver is still appending to it. Uploading an edited copy can lose the entries recorded in the meantime.",
    exportedTo: 'Exported to {path}',
    gapsFilled:
      'Inserted 1 interpolated entry into a gap | Inserted {n} interpolated entries into gaps',
    noGaps: 'No gaps found at the detected recording interval',
    uploadConfirmTitle: 'Upload to Miniserver?',
    uploadConfirmBody:
      'This overwrites {file} on the Miniserver with your edited copy. The current server copy is backed up first — you can restore it later via “Backups”.',
    diffLoading: 'Comparing with the Miniserver copy…',
    diffFailed: 'Could not compare with the Miniserver copy.',
    diffNew: 'Not on the Miniserver yet — the upload creates it.',
    diffNone: 'Identical to the Miniserver copy — nothing would change.',
    diffIntro: 'Compared with the Miniserver copy:',
    diffChanged: '1 entry changed | {n} entries changed',
    diffInserted: '1 entry added | {n} entries added',
    diffDeleted: '1 entry removed | {n} entries removed',
    uploadConfirm: 'Upload',
    postUploadTitle: 'Uploaded — two steps left',
    postUploadIntro: 'The Miniserver only picks up edited statistics after:',
    postUploadStep1: '<b>Restart the Miniserver</b> (Loxone Config or power cycle).',
    postUploadStep2:
      '<b>Clear the Loxone app cache</b> (or remove and re-add the Miniserver in the app) so cached statistics are refreshed.',
    gotIt: 'Got it',
    mcpChanged: 'This file was changed by an MCP client — reload to see the new data.',
    mcpReload: 'Reload',
    backups: 'Backups',
    backupsTip: 'Server copies saved before each upload or delete',
    backupsIntro:
      'The Miniserver’s copy of this file is saved before every upload or delete (the newest 10 are kept). Restoring replaces your local copy — review it, then upload.',
    backupsUnsaved: 'Your unsaved edits will be lost.',
    backupsEmpty: 'No backups yet — one is made the first time you upload this file.',
    backupRestore: 'Restore',
    backupRestored:
      'Restored the server copy from {date} locally — upload it to put it back on the Miniserver.'
  },
  formula: {
    title: 'Calculate values',
    label: 'Formula (v = current value)',
    invalid: 'Invalid formula — use numbers, v, + - * / ( )',
    applyTo: 'Apply to column',
    allValues: 'All values',
    rows: 'Rows',
    rowsSelected: 'Selected rows',
    rowsDownwards: 'First selected row and below',
    rowsAll: 'All rows',
    apply: 'Apply',
    cancel: 'Cancel'
  },
  problem: {
    'uuid-mismatch': 'Entry UUID does not match the file name',
    'timestamp-order': 'Timestamp is not after the previous entry',
    'timestamp-outside-month-mid': "Timestamp lies outside the file's month",
    'timestamp-outside-month-last': 'Last entry lies outside the month (allowed for interpolation)',
    'invalid-value': 'Entry contains NaN/Infinity or a wrong number of values',
    'counter-reset': 'Meter reading drops here and stays low — a meter reset?',
    spike: 'Far outside the usual range of this series — a spike?',
    'bad-header': 'Invalid file header'
  },
  months: {
    tip: 'All months of this control in one chart',
    button: 'All months',
    meta: '1 month · {entries} entries | {n} months · {entries} entries',
    downloading: 'Downloading the missing months…',
    failed:
      '1 month could not be loaded and is missing from the chart | {n} months could not be loaded and are missing from the chart',
    notDownloaded:
      '1 month is not downloaded and is missing from the chart | {n} months are not downloaded and are missing from the chart',
    skipped:
      '1 month has a different number of values and is left out of the chart | {n} months have a different number of values and are left out of the chart',
    notInChart: 'not in chart',
    notInChartTip: 'This month stores a different number of values than the newest one',
    hint: 'Read-only overview. Click the chart or a month to open it in the editor.',
    colEntries: 'Entries',
    colValue: 'Value {n} (min – max · average)',
    empty: 'No months downloaded for this control.'
  },
  dashboard: {
    ask: 'Ask Claude',
    askTip: 'Ask Claude why — set it up in Settings → AI',
    title: 'Dashboard',
    months: '{n} months',
    loading: 'Calculating… missing months are downloaded from the Miniserver (read-only).',
    empty:
      'No energy meters found. The dashboard needs units (kWh, kW) from the Miniserver structure file — connect to the Miniserver once so names and units can be read.',
    skipped:
      '1 energy control has no units and is left out. | {n} energy controls have no units and are left out.',
    consumers: 'Energy by control',
    consumersHint:
      'Largest first. Producers (e.g. PV) and sub-meters are listed too — don’t add them up.',
    second: 'second reading {v} kWh',
    fromMeter: 'from meter readings',
    fromPower: 'from power, integrated over time',
    perMonth: 'kWh per month',
    openMonth: 'Open this month in the editor',
    week: 'Typical week (average per weekday and hour)',
    weekHint: 'Stronger color = more. Times are the Miniserver’s local time.',
    base: 'Standby (base load)',
    baseYear: '≈ {v} kWh per year',
    weekdays: 'Weekdays',
    weekend: 'Weekend'
  },
  restart: {
    now: 'Restart now',
    confirm:
      'Restart the Miniserver now? It is offline for about 1–2 minutes — lights, heating and other automations pause until it is back.',
    confirmButton: 'Restart Miniserver',
    done: 'Restart started. The Miniserver is back in about 1–2 minutes; refresh the file list then.'
  },
  chart: {
    resetZoom: 'Reset zoom',
    resetZoomTip: 'Double-clicking the chart also resets the zoom',
    time: 'Time',
    value: 'Value {n}'
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    theme: 'Appearance',
    themeLight: 'Light',
    themeDark: 'Dark',
    dateFormat: 'Date format',
    timeFormat: 'Time format',
    time24: '24-hour',
    time12: '12-hour (AM/PM)',
    example: 'Example: {example}',
    shortcutHint: 'Open these settings anytime with Cmd+, (macOS) or Ctrl+, (Windows).',
    tabGeneral: 'General',
    tabAi: 'AI',
    aiIntro:
      'Ask Claude about your statistics — consumption, standby, automation ideas — and, optionally, let it work on your Loxone Config project.',
    mcpEnable: 'AI access',
    mcpPort: 'Port',
    mcpToken: 'Token',
    mcpCopy: 'Copy',
    mcpCopied: 'Copied',
    mcpRegenerate: 'Regenerate',
    mcpRunning: 'Running',
    mcpNotRunning: 'Not running',
    mcpFailed:
      'AI access couldn’t start ({error}). Restart Lox DataManager; if that doesn’t help, set another port under “Other AI apps & advanced”.',
    mcpMoved:
      'Port {from} was taken by another program, so AI access moved to port {port}. Claude apps added above were updated.',
    shareFailed: 'Sharing couldn’t start ({error}). Restart Lox DataManager.',
    shareMoved:
      'Port {from} was taken by another program, so sharing moved to another port — the connection code changed. Paste the new one on your other computer.',
    back: 'Back',
    mcpClient: 'App',
    mcpWhere: {
      claudeCode: 'Run in a terminal:',
      claudeDesktop:
        'Settings → Developer → Edit Config, merge into claude_desktop_config.json, restart Claude Desktop (needs Node.js):',
      cursor: 'Merge into ~/.cursor/mcp.json (or .cursor/mcp.json in a project):',
      vscode: 'Merge into .vscode/mcp.json, or run "MCP: Open User Configuration":'
    },
    mcpHint:
      'Lox DataManager is an MCP server at {url}. Any AI app supporting MCP over HTTP works with this URL and token. ' +
      'It only runs while Lox DataManager is open.',
    shareTitle: 'Share Loxone Config',
    shareEnable: 'Share on local network',
    shareRunning: 'Sharing — Loxone Config found',
    shareNoConfig: 'Sharing — waiting for Loxone Config',
    shareRecheck: 'Check again',
    shareCode: 'Connection code',
    shareHint:
      'Lets your other computer use the MCP server of Loxone Config on this PC (Config 17.3 or newer: enable it in Config’s title bar). ' +
      'Paste the code under "Loxone Config on another computer" there. Only computers on this local network can connect; ' +
      'if Windows asks, allow access on private networks. Keep the app open while you work.',
    remoteTitle: 'Loxone Config on another computer',
    remotePlaceholder: 'Paste the code from the PC with Loxone Config',
    remoteConnect: 'Connect',
    remoteForget: 'Forget',
    remoteForgotExtension:
      'Claude Desktop still has the “Loxone Config (via Lox DataManager)” extension — remove it in Claude under Settings → Extensions.',
    remoteConnected: 'Connected — {name} {version}, {tools} tools',
    remoteHint:
      'Claude then works on the project open in Loxone Config on that PC; Claude apps added above get it automatically. ' +
      'Changes land in Config, where you review, undo or save them.',
    claudeTitle: 'Claude',
    claudeStatus: {
      current: 'Added',
      outdated: 'Old token',
      partial: '{done} of {total} added',
      missing: 'Not added',
      unreachable: 'Added — AI access off'
    },
    claudeTurnOn: 'Turn on',
    claudeAdd: 'Add',
    claudeUpdate: 'Update',
    claudeRestart: {
      claudeCode: 'Added — start a new Claude Code session to use it.',
      claudeDesktop: 'Claude Desktop shows an install dialog — click Install there.'
    },
    claudeHint:
      'Add puts Lox DataManager into Claude’s settings — no copying. It stays up to date when the token or connection code changes. ' +
      'Claude can only reach it while this app is open.',
    claudeNotFound:
      'Neither Claude Code nor Claude Desktop was found on this computer. Install one:',
    configTitle: 'Loxone Config (optional)',
    configIntro:
      'Loxone Config 17.3+ has its own MCP server. Connected here, Claude can read your project and — after you approve — change it.',
    tryTitle: 'Ask Claude',
    prompts: {
      'energy-report': 'where and when electricity is used, biggest savings levers',
      'automation-ideas': 'automations derived from your usage patterns',
      'what-to-buy': 'PV, battery or heat pump sizing from your profile',
      'improve-config':
        'from your data to a change in Loxone Config — asks before changing anything',
      'fix-statistics': 'find and repair gaps and wrong values'
    },
    tryHint:
      'Claude Code: type /mcp__lox-datamanager__energy-report (etc.). Claude Desktop: + menu → Lox DataManager. Or just ask, e.g. “what runs at night?”',
    advancedTitle: 'Other AI apps & advanced'
  },
  banner: {
    added: 'Added to {apps} — start a new Claude session to use it.',
    confirmDesktop: 'Claude Desktop shows an install dialog — click Install there.',
    claudeOffer: 'Use your statistics in {apps}?',
    and: ' and ',
    notNow: 'Not now',
    notNowTip: 'You can add it later in Settings → AI',
    close: 'Close'
  },
  update: {
    version: 'Version',
    check: 'Check for updates',
    checking: 'Checking…',
    available: 'Version {latest} is available.',
    download: 'Download',
    dismiss: 'Hide until the next version',
    upToDate: 'Up to date',
    checkFailed: 'Could not check for updates'
  },
  errors: {
    FTP_REFUSED: 'Connection refused — the Miniserver did not accept the FTP connection',
    FTP_AUTH_FAILED: 'Login failed — check user and password',
    FTP_TIMEOUT: 'The connection to the Miniserver timed out',
    FTP_NOT_CONNECTED: 'Not connected to a Miniserver',
    NO_PASSWORD: 'No stored password — enter it manually',
    NO_PERMISSION:
      'The Miniserver refused — restarting needs a user with admin rights. Restart it from Loxone Config instead.',
    BAD_CONNECTION_CODE:
      'That is not a connection code — copy it again from the PC with Loxone Config',
    MCP_AUTH_FAILED:
      'The code is not valid any more — copy the current one from the PC with Loxone Config',
    MCP_NOT_LAN: 'Refused — only computers on the same local network can connect',
    MCP_UNREACHABLE:
      'The PC did not answer — is Lox DataManager open there with sharing on, and are both on the same network?',
    CONFIG_NOT_RUNNING: 'Reached the PC, but Loxone Config or its MCP server is not running there',
    EXTENSION_OPEN_FAILED:
      'Claude Desktop did not open the extension — double-click the file in the folder that just opened',
    CLIENT_CONFIG_UNREADABLE:
      'The Claude app’s settings file could not be read — fix or remove it, or copy the snippet instead'
  }
}
