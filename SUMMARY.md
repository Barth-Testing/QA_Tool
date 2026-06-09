# QA Dashboard — Session Summary

## Tech Stack
Vanilla HTML/CSS/JS, Canvas 2D API, kein Framework, keine Build-Tools.
Hosting: GitHub Pages (`Barth-Testing/QA_Tool`).

## Aktueller Stand (2026-06-09)

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

## Neu in dieser Session (2026-06-09)

### Donut-Prozentsätze vereinheitlicht
- `drawDonut()` zeigt nun `75%` inline im Zentrum (vorher: `75` + `%` getrennt) — konsistent zu `drawMiniDonut` / `_drawMiniDonutAt`

### 3D-Rand bei Donuts
- Alle drei Donut-Funktionen (`drawDonut`, `drawMiniDonut`, `_drawMiniDonutAt`) haben jetzt einen subtilen 3D-Rand: heller Highlight aussen + dunkler Schatten innen am Ring

### Neue KPI: Testabdeckung neuer Funktionen (`test-coverage-new-features`)
- Automatisch berechnet aus den AC-Status der RFC-Sidebar-Einträge
- Abhängig vom globalen Release (Dropdown, teilt sich die Campaign-Auswahl mit `rfc-tests`)
- Datenquelle: `computed`, nicht manuell editierbar
- Schwellwerte: grün ≥ 80 %, gelb ≥ 50 %, rot < 50 %

### AC 3-State-Zyklus
- AC-Status zyklisiert nun `BLOCKED → FAILED → PASSED → BLOCKED …`
- BLOCKED ist der dritte Zustand: blau dargestellt, zählt im Sidebar-Donut als ausgeführt

### RFC Release Reassignment
- RFC-Einträge können per Dropdown einem anderen Release zugewiesen werden
- Dropdown erscheint in der rechten Sidebar pro RFC-Entry

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
