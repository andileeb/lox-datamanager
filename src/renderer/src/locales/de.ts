import type en from './en'

const de: typeof en = {
  connect: {
    title: 'Loxone DataManager',
    subtitle: 'Mit dem Miniserver verbinden, um Statistiken anzusehen und zu bearbeiten',
    savedConnections: 'Gespeicherte Verbindungen',
    host: 'Host',
    port: 'Port',
    user: 'Benutzer',
    password: 'Passwort',
    encryption: 'Verschlüsselung',
    tlsAuto: 'Automatisch erkennen',
    tlsFtps: 'FTPS (TLS)',
    tlsPlain: 'Unverschlüsseltes FTP',
    saveConnection: 'Verbindung speichern',
    namePlaceholder: 'Name (optional)',
    offline: 'Offline arbeiten',
    offlineHint:
      'Statistiken ohne Verbindung ansehen und bearbeiten – heruntergeladene Dateien, ein Backup oder eine SD-Karten-Kopie. Hochladen braucht eine Verbindung.',
    cachedHost: '{name} · 1 Datei | {name} · {n} Dateien',
    openFolder: 'Ordner öffnen…',
    openFiles: 'Dateien öffnen…',
    connect: 'Verbinden',
    cancel: 'Verbindungsversuch abbrechen',
    ftpHint:
      '<b>Ist FTP am Miniserver aktiviert?</b> Seit Firmware 16.1 ist der FTP-Server standardmäßig deaktiviert. In Loxone Config in den Netzwerkeinstellungen des Miniservers FTP auf „Aktiviert" oder „Aktiviert – nur TLS" stellen, in den Miniserver speichern und erneut versuchen.'
  },
  browser: {
    filterPlaceholder: 'Dateien filtern…',
    allMonths: 'Alle Monate',
    downloadSelected: '{n} ausgewählte herunterladen',
    uploadSelected: '{n} ausgewählte hochladen',
    backup: 'Backup',
    disconnect: 'Trennen',
    close: 'Schließen',
    offline: 'Offline',
    colFile: 'Datei',
    colDescription: 'Beschreibung',
    colMonth: 'Monat',
    colSize: 'Größe',
    colModified: 'Geändert',
    colStatus: 'Status',
    unknown: 'unbekannt',
    unknownTooltip:
      'In den Datei-Headern dieses Bausteins wurde noch kein Name gefunden — die Dateien sind evtl. leer oder der Download schlug fehl. Aktualisieren versucht andere Monate.',
    empty: 'Keine Statistikdateien in /stats gefunden.',
    emptyLocal: 'Keine Statistikdateien (<uuid>.YYYYMM) in diesem Ordner.',
    tipRefresh: 'Dateiliste aktualisieren',
    tipOpenFolder: 'Lokalen Download-Ordner öffnen',
    tipOpenThisFolder: 'Diesen Ordner im Dateimanager zeigen',
    tipBackup: 'Alle Statistiken vom Miniserver als Zip-Datei sichern',
    tipDownload: 'Auf diesen Computer herunterladen',
    tipOpen: 'Diagramm & Editor öffnen',
    tipUpload: 'Lokale Kopie auf den Miniserver hochladen',
    tipDelete: 'Vom Miniserver löschen',
    tipLanguage: 'Sprache',
    tipTheme: 'Zwischen hellem und dunklem Modus wechseln',
    deleteTitle: 'Vom Miniserver löschen?',
    deleteBody:
      'Die Datei wird dauerhaft vom Miniserver gelöscht (eine lokale Kopie bleibt erhalten):',
    deleteConfirm: 'Löschen',
    cancel: 'Abbrechen'
  },
  status: {
    'only-remote': 'Nicht heruntergeladen',
    'only-local': 'Nur lokal',
    same: 'Heruntergeladen',
    'remote-newer': 'Neuer am Miniserver',
    'local-newer': 'Lokale Änderungen'
  },
  suffix: {
    power: 'Leistung',
    meterReading: 'Zählerstand',
    storageLevel: 'Speicherstand',
    output: 'Ausgang {n}'
  },
  editor: {
    back: 'Zurück zur Dateiliste',
    meta: '{entries} Einträge · {values} Wert(e)',
    errors: '{n} Fehler',
    warnings: '{n} Warnungen',
    exportCsv: 'CSV exportieren',
    save: 'Speichern',
    upload: 'Auf Miniserver hochladen',
    insertAbove: 'Oberhalb einfügen',
    insertBelow: 'Unterhalb einfügen',
    delete: 'Löschen',
    deleteN: '{n} löschen',
    fillGaps: 'Lücken füllen',
    calculate: 'Berechnen…',
    timestamp: 'Zeitstempel',
    value: 'Wert {n}',
    problems: 'Probleme',
    noProblems: 'Keine Probleme gefunden',
    currentMonthWarning:
      'Dies ist die Datei des <b>aktuellen Monats</b> — der Miniserver schreibt noch hinein. Das Hochladen einer bearbeiteten Kopie kann zwischenzeitlich aufgezeichnete Einträge verlieren.',
    exportedTo: 'Exportiert nach {path}',
    gapsFilled: '{n} interpolierte Einträge in Lücken eingefügt',
    noGaps: 'Keine Lücken im erkannten Aufzeichnungsintervall gefunden',
    uploadConfirmTitle: 'Auf Miniserver hochladen?',
    uploadConfirmBody:
      'Dies überschreibt {file} am Miniserver mit der bearbeiteten Kopie. Es gibt kein Rückgängig — am besten ein heruntergeladenes Backup behalten.',
    uploadConfirm: 'Hochladen',
    postUploadTitle: 'Hochgeladen — zwei Schritte fehlen noch',
    postUploadIntro: 'Der Miniserver übernimmt bearbeitete Statistiken erst nach:',
    postUploadStep1: '<b>Miniserver neu starten</b> (Loxone Config oder stromlos machen).',
    postUploadStep2:
      '<b>Cache der Loxone App leeren</b> (oder den Miniserver in der App entfernen und neu hinzufügen), damit zwischengespeicherte Statistiken aktualisiert werden.',
    gotIt: 'Verstanden',
    mcpChanged:
      'Diese Datei wurde von einem MCP-Client geändert — neu laden, um die neuen Daten zu sehen.',
    mcpReload: 'Neu laden'
  },
  formula: {
    title: 'Werte berechnen',
    label: 'Formel (v = aktueller Wert)',
    invalid: 'Ungültige Formel — erlaubt sind Zahlen, v, + - * / ( )',
    applyTo: 'Auf Spalte anwenden',
    allValues: 'Alle Werte',
    rows: 'Zeilen',
    rowsSelected: 'Ausgewählte Zeilen',
    rowsDownwards: 'Erste ausgewählte Zeile und darunter',
    rowsAll: 'Alle Zeilen',
    apply: 'Anwenden',
    cancel: 'Abbrechen'
  },
  problem: {
    'uuid-mismatch': 'Die UUID des Eintrags passt nicht zum Dateinamen',
    'timestamp-order': 'Zeitstempel liegt nicht nach dem vorherigen Eintrag',
    'timestamp-outside-month-mid': 'Zeitstempel liegt außerhalb des Dateimonats',
    'timestamp-outside-month-last':
      'Letzter Eintrag liegt außerhalb des Monats (für Interpolation erlaubt)',
    'invalid-value': 'Eintrag enthält NaN/Unendlich oder eine falsche Anzahl an Werten',
    'bad-header': 'Ungültiger Datei-Header'
  },
  chart: {
    resetZoom: 'Zoom zurücksetzen',
    resetZoomTip: 'Doppelklick auf das Diagramm setzt den Zoom ebenfalls zurück',
    value: 'Wert {n}'
  },
  settings: {
    title: 'Einstellungen',
    language: 'Sprache',
    theme: 'Darstellung',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    dateFormat: 'Datumsformat',
    timeFormat: 'Zeitformat',
    time24: '24 Stunden',
    time12: '12 Stunden (AM/PM)',
    example: 'Beispiel: {example}',
    shortcutHint:
      'Diese Einstellungen sind jederzeit mit Cmd+, (macOS) bzw. Strg+, (Windows) erreichbar.',
    mcpTitle: 'MCP-Server',
    mcpEnable: 'Aktivieren',
    mcpPort: 'Port',
    mcpToken: 'Token',
    mcpCopy: 'Kopieren',
    mcpCopied: 'Kopiert',
    mcpRegenerate: 'Neu erzeugen',
    mcpRunning: 'Läuft — {url}',
    mcpStopped: 'Gestoppt',
    mcpError: 'Start fehlgeschlagen: {error}',
    mcpSnippetLabel: 'Claude Code verbinden:',
    mcpHint:
      'Erlaubt MCP-Clients (Claude Code, Claude Desktop, …), Statistiken über diese App anzusehen und zu bearbeiten. ' +
      'Jeder Client mit Streamable HTTP funktioniert mit dieser URL und diesem Token. ' +
      'Der Server läuft nur, solange die App geöffnet ist.'
  },
  update: {
    version: 'Version',
    check: 'Nach Updates suchen',
    checking: 'Suche…',
    available: 'Version {latest} ist verfügbar.',
    download: 'Herunterladen',
    upToDate: 'Aktuell',
    checkFailed: 'Update-Suche fehlgeschlagen'
  },
  errors: {
    FTP_REFUSED: 'Verbindung abgelehnt — der Miniserver hat die FTP-Verbindung nicht angenommen',
    FTP_AUTH_FAILED: 'Anmeldung fehlgeschlagen — Benutzer und Passwort prüfen',
    FTP_TIMEOUT: 'Zeitüberschreitung bei der Verbindung zum Miniserver',
    FTP_NOT_CONNECTED: 'Nicht mit einem Miniserver verbunden',
    NO_PASSWORD: 'Kein gespeichertes Passwort — bitte manuell eingeben'
  }
}

export default de
