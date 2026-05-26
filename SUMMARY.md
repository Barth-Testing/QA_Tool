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
│   └── style.css      # Dark-Theme (1440 Zeilen)
├── js/
│   ├── charts.js      # ChartEngine: Donut, Bar, MiniDonut, ResponseComparison
│   ├── grid.js         # GridEngine: Tile-Rendering, Drag&Drop, Resize, kompaktieren
│   └── app.js          # App-Logik: Daten laden, Dashboard-CRUD, Campaigns, RFCs, Events
└── data/
    ├── dashboards.json
    ├── kpis.json
    ├── values.json
    └── qa-dashboard-export.json
```

## KPI-Typen
- `donut` (%-Werte): Testabdeckung, Raten, Uptime
- `bar` (numerisch): Antwortzeiten, Fehlerzahlen, MTTR
- `response-comparison` (`fe-response-dev`, `fe-response-sta`): 26 Testsituationen × 3 Versionen

## FE Response Comparison (t22/t23)
- **26 feste Testsituationen** für Frontend-Antwortzeiten
- **3 Versionen pro Chart**: Aktuell, Vorher, Referenz (R3.18.1)
- R3.18.1 = fixe Referenz mit `null` für 15 attachment-lastige Situationen
- Chart öffnet via `📊 Diagramm anzeigen`-Button im RC-Tile → Modal (Canvas 100%)
- **Canvas-Layout**: 55% Chart (oben) + 45% Wertetabelle (unten)
- **Chart**: Vertikale Gruppenbalken (Grün=Aktuell, Violett=Vorher, Rot=Referenz), Y-Achse mit ms-Gitterlinien, Index-Nummern (1–26) direkt unter den Balkengruppen
- **Wertetabelle**: 4 Spalten — `#` (Index 1–26) | `Testsituation` (fett) | `Aktuell` | `Vorher` | `Referenz` — mit abwechselnden Zeilen-Hintergründen
- **Neues Release**: Modal mit 26 zweispaltigen Eingabefeldern
- Werte gespeichert in `values.json` + per KPI `rcValues` in localStorage

## Rechte Sidebar (Testabdeckung RFC)
- Eigenständiger Bereich rechts (260px, gleich breit wie linke Sidebar)
- **Multi-Entry**: Mehrere RFCs parallel in `localStorage` (`qa_dashboard_rfc_entries`)
- **AC-System**: 1–10 Acceptance Criteria pro RFC, einzeln togglegbar (grün=passed / rot=failed)
- **Add-Dialog**: Freitext-Name + AC-Anzahl (Select 1–10) + dynamische Texteingaben
- **Detail-Dialog**: Zeigt AC-ID, Text, Status; Klick toggelt in-place
- **Migration**: Alter Einzel-Eintrag (`test-coverage-rfc`) wird automatisch ins neue Format überführt
- **Donut**: 120×120, gleiche Darstellung wie Testkampagnen-Donut

## Linke Sidebar (Testkampagnen)
- Multi-Entry mit Donut-Farben (grün/gelb/rot), durchklickbar
- Farbe zyklisch via Klick auf Donut oder Mini-Label

## Dashboard-Grid
- 4 Spalten (konfigurierbar 2–8)
- Drag & Drop + Resize via Ziehgriff
- Grid-Kompaktierung (`Grid.compactGrid`) bei jedem `render()` → Lücken automatisch geschlossen
- Tile-Höhe 780px (fixed) für RC-Tiles
- Trend-Indikatoren (▲/▼) in RC-Tabelle

## Chart-Rendering (charts.js `drawResponseComparison`)
- Layout-Split: `chartShare = 0.55` (55% Chart, 45% Tabelle)
- Padding: `pad.bottom = max(18, 12%)` (klein, da keine diagonalen Labels mehr)
- Index-Nummern: `idxY = pad.top + chartH + 2` (direkt unter Balkenende)
- Tabelle: beginnt bei `chartBottom + 14` (27px Abstand zu Index-Nummern)
- Column-Layout: `# (7%) | Testsituation (33%) | Aktuell (19%) | Vorher (19%) | Referenz (19%)`

## Zentrale UI-Modals
- **Chart-Modal**: 95vw / 92vh, `overflow: auto`
- **RC-Add-Modal**: 2-Spalten-Grid für 26 Eingabefelder
- **RFC-Add-Modal**: Freitext-Name + AC-Select + AC-Textfelder
- **RFC-Detail-Modal**: AC-ID, Text, Status-Toggle

## Daten-Persistenz
- `fileValues` (aus JSON) + `localStorage` (user edits) → `getCustomValues()` merged
- Dashboard-Zustand in `localStorage` (`qa_dashboard_state`)
- Campaigns in `localStorage` (`qa_dashboard_campaigns`)
- RFC-Entries in `localStorage` (`qa_dashboard_rfc_entries`)
- Export (JSON) inkludiert alle Werte + Konfiguration

## Bekannte Einschränkungen
- Bei 800px Viewport sind die Index-Nummern und die Tabelle sehr kompakt (nur ~11 Tabellenzeilen sichtbar, scrollbar)
- Die Chart-Balken sind bei sehr großen Ausreißern (180s+) extrem kurz für niedrige Werte
- Keine API-Anbindung (Daten rein manuell/per Export)
