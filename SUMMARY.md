# QA Dashboard — Session Summary

## Tech Stack
Vanilla HTML/CSS/JS, Canvas 2D API, kein Framework, keine Build-Tools.
Hosting: GitHub Pages (`Barth-Testing/QA_Tool`).

## Aktueller Stand (2026-05-27)

### Dateien
```
qa-dashboard/
├── index.html          # Einstieg, Navbar, Sidebars (links/rechts), Modals
├── SUMMARY.md          # Diese Datei
├── css/
│   └── style.css      # Dark-Theme
├── js/
│   ├── charts.js      # ChartEngine: Donut, Bar, MiniDonut, ResponseComparison, Numeric
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

## Neue KPIs (diese Session)
- **Automatisierte Tests** (`automated-tests`): Anzahl, unit "Tests", numeric, 1×1
- **Manuelle Tests** (`manual-tests`): Anzahl, unit "Tests", numeric, 1×1
- **Mobile Tests** (`mobile-tests`): Anzahl, unit "Tests", numeric, 1×1
- **RFC Tests** (`rfc-tests`): Anzahl, unit "Tests", numeric, 1×1
- **Testautomatisierungsrate**: Computed — berechnet sich automatisch aus `auto / (auto + manual) × 100`
- **Test Execution Time**: Unit auf "PT" (Personentage) geändert, numeric display, editierbar

## Linke Sidebar (Testkampagnen)
- Multi-Entry mit Donut-Farben (grün/gelb/rot), durchklickbar
- Farbe zyklisch via Klick auf Donut oder Mini-Label
- **Neues Datenmodell**: Jeder Mini-Donut speichert `{planned, executed}` statt single %-Wert
- **Klick auf Mini-Donut**: Öffnet Modal mit 2 Eingabefeldern (Geplante/Ausgeführte Testfälle)
- **Mini-Donut-Anzeige**: `executed / planned × 100`
- **Großer Donut**: Aggregiert über alle 4 — `sum(executed) / sum(planned) × 100`
- **Migration**: Alte Campaigns (single %-Werte) automatisch migriert zu `{planned: 100, executed: alt}`
- **Löschen**: ✕-Button im Header (hover-sichtbar)

## Rechte Sidebar (Testabdeckung RFC)
- Multi-Entry, AC-System mit Status-Toggle, Detail-Dialog
- **Löschen**: ✕-Button im Header (hover-sichtbar)

## Dashboard-Grid
- **6 Spalten fest** (nicht mehr konfigurierbar — Spalten-Slider entfernt)
- Columns aus JSON überschreiben localStorage beim Laden
- Drag & Drop + Resize (außer bei numeric-Tiles)
- Grid-Kompaktierung bei jedem render()
- Tile-Höhe 780px (fixed) für RC-Tiles

## Computed KPIs
- `test-automation-rate` = `automated-tests / (automated-tests + manual-tests) × 100`
- Berechnet in `getCustomValues()` nach dem Merge, überschreibt localStorage
- Nicht editierbar (weder inline noch im Werte-Tab)
- Wird bei jeder Änderung von `automated-tests`/`manual-tests` automatisch neu berechnet

## Campaign Edit Modal
- 2 Input-Felder: Geplante Testfälle + Ausgeführte Testfälle
- Live-Preview: `executed / planned = xx%`
- Enter-Taste zum Speichern, Escape zum Schließen

## Daten-Persistenz
- `fileValues` (aus JSON) + `localStorage` (user edits) → `getCustomValues()` merged
- Dashboard-Zustand in `localStorage` (`qa_dashboard_state`)
- Campaigns in `localStorage` (`qa_dashboard_campaigns`)
- RFC-Entries in `localStorage` (`qa_dashboard_rfc_entries`)
- Computed KPIs werden nicht persistiert (nur Quell-KPIs)

## Bekannte Einschränkungen
- Chart-Balken bei großen Ausreißern (180s+) extrem kurz für normale Werte
- Keine API-Anbindung (Daten rein manuell/per Export)
