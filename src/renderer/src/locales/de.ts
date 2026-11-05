import type en from './en'

const de: typeof en = {
  connect: {
    title: 'Lox DataManager',
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
    allStatuses: 'Alle Status',
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
      'Dies löscht die Datei am Miniserver. Die Server-Kopie wird vorher gesichert, eine lokale Kopie (falls vorhanden) bleibt erhalten:',
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
    warnings: '1 Warnung | {n} Warnungen',
    exportCsv: 'CSV exportieren',
    save: 'Speichern',
    saveTip: 'Lokal speichern (Cmd/Strg+S)',
    upload: 'Auf Miniserver hochladen',
    undo: 'Rückgängig (Cmd/Strg+Z)',
    redo: 'Wiederholen (Umschalt+Cmd/Strg+Z)',
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
    gapsFilled:
      '1 interpolierter Eintrag in Lücke eingefügt | {n} interpolierte Einträge in Lücken eingefügt',
    noGaps: 'Keine Lücken im erkannten Aufzeichnungsintervall gefunden',
    uploadConfirmTitle: 'Auf Miniserver hochladen?',
    uploadConfirmBody:
      'Dies überschreibt {file} am Miniserver mit der bearbeiteten Kopie. Die aktuelle Server-Kopie wird vorher gesichert — wiederherstellen jederzeit über „Backups“.',
    diffLoading: 'Vergleiche mit der Kopie am Miniserver…',
    diffFailed: 'Vergleich mit der Kopie am Miniserver nicht möglich.',
    diffNew: 'Noch nicht am Miniserver — das Hochladen legt sie an.',
    diffNone: 'Identisch mit der Kopie am Miniserver — es würde sich nichts ändern.',
    diffIntro: 'Im Vergleich zur Kopie am Miniserver:',
    diffChanged: '1 Eintrag geändert | {n} Einträge geändert',
    diffInserted: '1 Eintrag hinzugefügt | {n} Einträge hinzugefügt',
    diffDeleted: '1 Eintrag entfernt | {n} Einträge entfernt',
    uploadConfirm: 'Hochladen',
    postUploadTitle: 'Hochgeladen — zwei Schritte fehlen noch',
    postUploadIntro: 'Der Miniserver übernimmt bearbeitete Statistiken erst nach:',
    postUploadStep1: '<b>Miniserver neu starten</b> (Loxone Config oder stromlos machen).',
    postUploadStep2:
      '<b>Cache der Loxone App leeren</b> (oder den Miniserver in der App entfernen und neu hinzufügen), damit zwischengespeicherte Statistiken aktualisiert werden.',
    gotIt: 'Verstanden',
    mcpChanged:
      'Diese Datei wurde von einem MCP-Client geändert — neu laden, um die neuen Daten zu sehen.',
    mcpReload: 'Neu laden',
    backups: 'Backups',
    backupsTip: 'Server-Kopien, gesichert vor jedem Hochladen oder Löschen',
    backupsIntro:
      'Die Kopie dieser Datei am Miniserver wird vor jedem Hochladen oder Löschen gesichert (die neuesten 10 bleiben). Wiederherstellen ersetzt die lokale Kopie — prüfen, dann hochladen.',
    backupsUnsaved: 'Ungespeicherte Änderungen gehen verloren.',
    backupsEmpty: 'Noch keine Backups — eines entsteht beim ersten Hochladen dieser Datei.',
    backupRestore: 'Wiederherstellen',
    backupRestored:
      'Server-Kopie vom {date} lokal wiederhergestellt — hochladen, um sie zurück auf den Miniserver zu bringen.'
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
    spike: 'Weit außerhalb des üblichen Bereichs dieser Reihe — ein Ausreißer?',
    'bad-header': 'Ungültiger Datei-Header'
  },
  months: {
    tip: 'Alle Monate dieses Bausteins in einem Diagramm',
    button: 'Alle Monate',
    meta: '1 Monat · {entries} Einträge | {n} Monate · {entries} Einträge',
    downloading: 'Fehlende Monate werden heruntergeladen…',
    failed:
      '1 Monat konnte nicht geladen werden und fehlt im Diagramm | {n} Monate konnten nicht geladen werden und fehlen im Diagramm',
    notDownloaded:
      '1 Monat ist nicht heruntergeladen und fehlt im Diagramm | {n} Monate sind nicht heruntergeladen und fehlen im Diagramm',
    skipped:
      '1 Monat hat eine andere Anzahl Werte und fehlt im Diagramm | {n} Monate haben eine andere Anzahl Werte und fehlen im Diagramm',
    notInChart: 'nicht im Diagramm',
    notInChartTip: 'Dieser Monat speichert eine andere Anzahl Werte als der neueste',
    hint: 'Nur Ansicht. Klick ins Diagramm oder auf einen Monat öffnet ihn im Editor.',
    colEntries: 'Einträge',
    colValue: 'Wert {n} (min – max · Durchschnitt)',
    empty: 'Für diesen Baustein sind keine Monate heruntergeladen.'
  },
  dashboard: {
    ask: 'Claude fragen',
    askTip: 'Claude nach dem Warum fragen — einrichten unter Einstellungen → KI',
    title: 'Dashboard',
    months: '{n} Monate',
    loading: 'Wird berechnet… fehlende Monate werden vom Miniserver geladen (nur lesend).',
    empty:
      'Keine Energiezähler gefunden. Das Dashboard braucht Einheiten (kWh, kW) aus der Strukturdatei des Miniservers – einmal mit dem Miniserver verbinden, damit Namen und Einheiten gelesen werden.',
    skipped:
      '1 Energie-Baustein hat keine Einheiten und fehlt. | {n} Energie-Bausteine haben keine Einheiten und fehlen.',
    consumers: 'Energie je Baustein',
    consumersHint:
      'Größte zuerst. Erzeuger (z. B. PV) und Unterzähler sind auch dabei – nicht einfach addieren.',
    second: 'zweiter Zählerstand {v} kWh',
    fromMeter: 'aus Zählerständen',
    fromPower: 'aus Leistung, über die Zeit aufsummiert',
    perMonth: 'kWh pro Monat',
    openMonth: 'Diesen Monat im Editor öffnen',
    week: 'Typische Woche (Durchschnitt je Wochentag und Stunde)',
    weekHint: 'Kräftigere Farbe = mehr. Zeiten in Ortszeit des Miniservers.',
    base: 'Standby (Grundlast)',
    baseYear: '≈ {v} kWh pro Jahr',
    weekdays: 'Werktags',
    weekend: 'Wochenende'
  },
  restart: {
    now: 'Jetzt neu starten',
    confirm:
      'Miniserver jetzt neu starten? Er ist etwa 1–2 Minuten offline — Licht, Heizung und andere Automatiken pausieren, bis er wieder läuft.',
    confirmButton: 'Miniserver neu starten',
    done: 'Neustart ausgelöst. Der Miniserver ist in etwa 1–2 Minuten wieder da – danach die Dateiliste aktualisieren.'
  },
  chart: {
    resetZoom: 'Zoom zurücksetzen',
    resetZoomTip: 'Doppelklick auf das Diagramm setzt den Zoom ebenfalls zurück',
    time: 'Zeit',
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
    tabGeneral: 'Allgemein',
    tabAi: 'KI',
    aiIntro:
      'Frag Claude zu deinen Statistiken — Verbrauch, Standby, Automatisierungsideen — und lass es auf Wunsch an deinem Loxone-Config-Projekt arbeiten.',
    mcpEnable: 'KI-Zugriff',
    mcpPort: 'Port',
    mcpToken: 'Token',
    mcpCopy: 'Kopieren',
    mcpCopied: 'Kopiert',
    mcpRegenerate: 'Neu erzeugen',
    mcpRunning: 'An',
    mcpStopped: 'Aus',
    mcpError: 'Start fehlgeschlagen: {error}',
    mcpClient: 'App',
    mcpWhere: {
      claudeCode: 'Im Terminal ausführen:',
      claudeDesktop:
        'Einstellungen → Entwickler → Konfiguration bearbeiten, in claude_desktop_config.json einfügen, Claude Desktop neu starten (braucht Node.js):',
      cursor: 'In ~/.cursor/mcp.json einfügen (oder .cursor/mcp.json im Projekt):',
      vscode: 'In .vscode/mcp.json einfügen, oder „MCP: Open User Configuration“ ausführen:'
    },
    mcpHint:
      'Lox DataManager ist ein MCP-Server unter {url}. Jede KI-App mit MCP über HTTP funktioniert mit dieser URL und diesem Token. ' +
      'Er läuft nur, solange Lox DataManager geöffnet ist.',
    shareTitle: 'Loxone Config freigeben',
    shareEnable: 'Im lokalen Netzwerk freigeben',
    shareRunning: 'Freigegeben — Loxone Config gefunden',
    shareNoConfig: 'Freigegeben — wartet auf Loxone Config',
    shareRecheck: 'Erneut prüfen',
    shareCode: 'Verbindungscode',
    shareHint:
      'Damit kann dein anderer Computer den MCP-Server von Loxone Config auf diesem PC nutzen (ab Config 17.3: in der Titelleiste von Config aktivieren). ' +
      'Füge den Code dort unter „Loxone Config auf einem anderen Computer“ ein. Nur Computer in diesem lokalen Netzwerk können sich verbinden; ' +
      'fragt Windows nach, erlaube den Zugriff in privaten Netzwerken. Lass die App geöffnet, während du arbeitest.',
    remoteTitle: 'Loxone Config auf einem anderen Computer',
    remotePlaceholder: 'Code vom PC mit Loxone Config einfügen',
    remoteConnect: 'Verbinden',
    remoteForget: 'Vergessen',
    remoteConnected: 'Verbunden — {name} {version}, {tools} Tools',
    remoteHint:
      'Claude arbeitet dann am Projekt, das in Loxone Config auf diesem PC geöffnet ist; oben hinzugefügte Claude-Apps bekommen es automatisch. ' +
      'Änderungen landen in Config: Dort prüfst du sie, machst sie rückgängig oder speicherst sie.',
    claudeTitle: 'Claude',
    claudeStatus: {
      current: 'Hinzugefügt',
      outdated: 'Alter Token',
      partial: '{done} von {total} hinzugefügt',
      missing: 'Nicht hinzugefügt'
    },
    claudeAdd: 'Hinzufügen',
    claudeUpdate: 'Aktualisieren',
    claudeRestart: {
      claudeCode: 'Hinzugefügt — starte eine neue Claude-Code-Sitzung, um es zu nutzen.',
      claudeDesktop:
        'Claude Desktop zeigt einen Installationsdialog — klicke dort auf „Installieren“.'
    },
    claudeHint:
      '„Hinzufügen“ trägt Lox DataManager in die Einstellungen von Claude ein — ohne Kopieren. Ändern sich Token oder Verbindungscode, wird der Eintrag automatisch angepasst. ' +
      'Claude erreicht es nur, solange diese App geöffnet ist.',
    claudeNotFound:
      'Weder Claude Code noch Claude Desktop wurde auf diesem Computer gefunden. Installiere eins:',
    configTitle: 'Loxone Config (optional)',
    configIntro:
      'Loxone Config ab 17.3 hat einen eigenen MCP-Server. Hier verbunden, kann Claude dein Projekt lesen und — nach deiner Freigabe — ändern.',
    tryTitle: 'Claude fragen',
    prompts: {
      'energy-report': 'wo und wann Strom verbraucht wird, die größten Sparhebel',
      'automation-ideas': 'Automatisierungen aus deinen Verbrauchsmustern',
      'what-to-buy': 'PV, Speicher oder Wärmepumpe passend zu deinem Profil',
      'improve-config':
        'von deinen Daten zu einer Änderung in Loxone Config — fragt vor jeder Änderung',
      'fix-statistics': 'Lücken und falsche Werte finden und reparieren'
    },
    tryHint:
      'Claude Code: /mcp__lox-datamanager__energy-report (usw.) eingeben. Claude Desktop: Menü + → Lox DataManager. Oder einfach fragen, z. B. „Was läuft nachts?“',
    advancedTitle: 'Andere KI-Apps & Erweitert'
  },
  banner: {
    added: 'Zu {apps} hinzugefügt — starte eine neue Claude-Sitzung, um es zu nutzen.',
    confirmDesktop:
      'Claude Desktop zeigt einen Installationsdialog — klicke dort auf „Installieren“.',
    claudeOffer: 'Deine Statistiken in {apps} nutzen?',
    and: ' und ',
    notNow: 'Nicht jetzt',
    notNowTip: 'Du kannst es später unter Einstellungen → KI hinzufügen',
    close: 'Schließen'
  },
  update: {
    version: 'Version',
    check: 'Nach Updates suchen',
    checking: 'Suche…',
    available: 'Version {latest} ist verfügbar.',
    download: 'Herunterladen',
    dismiss: 'Bis zur nächsten Version ausblenden',
    upToDate: 'Aktuell',
    checkFailed: 'Update-Suche fehlgeschlagen'
  },
  errors: {
    FTP_REFUSED: 'Verbindung abgelehnt — der Miniserver hat die FTP-Verbindung nicht angenommen',
    FTP_AUTH_FAILED: 'Anmeldung fehlgeschlagen — Benutzer und Passwort prüfen',
    FTP_TIMEOUT: 'Zeitüberschreitung bei der Verbindung zum Miniserver',
    FTP_NOT_CONNECTED: 'Nicht mit einem Miniserver verbunden',
    NO_PASSWORD: 'Kein gespeichertes Passwort — bitte manuell eingeben',
    NO_PERMISSION:
      'Der Miniserver hat abgelehnt — Neustarten braucht einen Benutzer mit Admin-Rechten. Bitte über Loxone Config neu starten.',
    BAD_CONNECTION_CODE:
      'Das ist kein Verbindungscode — bitte erneut vom PC mit Loxone Config kopieren',
    MCP_AUTH_FAILED:
      'Der Code ist nicht mehr gültig — bitte den aktuellen vom PC mit Loxone Config kopieren',
    MCP_NOT_LAN: 'Abgelehnt — nur Computer im selben lokalen Netzwerk können sich verbinden',
    MCP_UNREACHABLE:
      'Der PC antwortet nicht — ist Lox DataManager dort geöffnet und freigegeben, und sind beide im selben Netzwerk?',
    CONFIG_NOT_RUNNING: 'PC erreicht, aber Loxone Config oder sein MCP-Server läuft dort nicht',
    EXTENSION_OPEN_FAILED:
      'Claude Desktop hat die Erweiterung nicht geöffnet — doppelklicke die Datei im eben geöffneten Ordner',
    CLIENT_CONFIG_UNREADABLE:
      'Die Einstellungsdatei der Claude-App ist nicht lesbar — repariere oder entferne sie, oder kopiere stattdessen das Snippet'
  }
}

export default de
