# QA Dashboard — Session Summary

## Tech Stack
Vanilla HTML/CSS/JS, Canvas 2D API, kein Framework, keine Build-Tools.
Hosting: GitHub Pages (`Barth-Testing/QA_Tool`).

## Aktueller Stand (2026-06-04)

### Dateien
```
qa-dashboard/
├── index.html          # Einstieg, Navbar, Sidebars (links/rechts), Modals
├── SUMMARY.md          # Diese Datei
├── css/
│   └── style.css      # Dark-Theme
├── js/
│   ├── charts.js      # ChartEngine: Donut, Bar, MiniDonut, ResponseComparison, TimeEvolution, Numeric
│   ├── grid.js         # GridEngine: Tile-Rendering, Drag&Drop, Resize, kompaktieren
│   └── app.js          # App-Logik: Daten laden, Dashboard-CRUD, Campaigns, RFCs, Events
└── data/
    ├── dashboards.json
    ├── kpis.json
    ├── values.json
    └── qa-dashboard-export.json
```

## KPI-Typen
- `donut` (%-Werte): Testabdeckung, Raten, Uptime — Canvas-Donut mit Status-Farbe
- `bar` (numerisch): Antwortzeiten, Fehlerzahlen, MTTR — Canvas-Balken mit Threshold-Markern
- `numeric` (reine Zahlen): Automatisierte/Manuelle/Mobile/RFC Tests, Test Execution Time (PT) — große Zahl (3.6rem), kein Chart, keine Resize
- `response-comparison` (`fe-response-dev`, `fe-response-sta`): 26 Testsituationen × 3 Versionen
- `time-evolution` (`recipient-search-time`): Multi-Line-Chart über Releases, 6 Suchdimensionen

## Neu in dieser Session

### Empfängersuche nach Parametern (`recipient-search-time`)
- Neuer KPI-Typ `time-evolution`: Multi-Line-Chart über 12 Releases (R4.1.3–R4.5.1)
- 6 Suchdimensionen: Kanzleinamen, Nachnamen, Vornamen, PLZ, Ort, Kombinierte Suchen
- Werte in Sekunden, `null` für nicht ausgeführte Releases
- Tile: kompakter Linien-Chart + Datentabelle + Chart-Modal
- Chart-Modal: voller Linien-Chart mit Legende, Datenpunkten, berechneter Skala

### RC Chart poliert (`drawResponseComparison`)
- Titelzeile mit Chart-Name + Datum + Versions-Legende
- Verbesserte Tabelle: Header-Hintergrund, abgerundete Ecken, bessere Spaltenaufteilung
- Überarbeitete Trend-Indikatoren (→, ↑, ↓ statt Sonderzeichen)
- Größere Schrift für bessere Lesbarkeit in Testreports

## Neue KPIs (diese Session)
- **Empfängersuche nach Parametern** (`recipient-search-time`): Suchzeiten in s, time-evolution, 6 Dim. × 12 Releases

## Linke Sidebar (Testkampagnen)
- Multi-Entry mit Donut-Farben (grün/gelb/rot), durchklickbar
- Farbe zyklisch via Klick auf Donut oder Mini-Label
- Jeder Mini-Donut speichert `{planned, passed, failed, blocked}`
- **Klick auf Mini-Donut**: Öffnet Modal mit 4 Eingabefeldern (Planned, Passed, Failed, Blocked)
- **Großer Donut**: Aggregiert über alle 4 — segmentiert mit passed/failed/blocked
- **Löschen**: ✕-Button im Header (hover-sichtbar)

## Rechte Sidebar (Testabdeckung RFC)
- Multi-Entry, AC-System mit Status-Toggle, Detail-Dialog
- **Löschen**: ✕-Button im Header (hover-sichtbar)

## Dashboard-Grid
- **6 Spalten fest**
- Drag & Drop + Resize (außer bei numeric-Tiles)
- Grid-Kompaktierung bei jedem render()
- Tile-Höhe 780px für RC-Tiles, 680px für TE-Tiles

## Daten-Persistenz
- `fileValues` (aus JSON) + `localStorage` (user edits) → `getCustomValues()` merged
- Dashboard-Zustand in `localStorage` (`qa_dashboard_state`)
- Campaigns in `localStorage` (`qa_dashboard_campaigns`)
- RFC-Entries in `localStorage` (`qa_dashboard_rfc_entries`)

## Bekannte Einschränkungen
- Chart-Balken bei großen Ausreißern (180s+) extrem kurz für normale Werte
- Keine API-Anbindung (Daten rein manuell/per Export)
