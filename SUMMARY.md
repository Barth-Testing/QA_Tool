# QA Dashboard — Projekt-Übersicht

## Standort
`/home/toni/opencode_projects/qa-dashboard/`

## Tech-Stack
- **Frontend**: Vanilla HTML/CSS/JS (kein Framework)
- **Hosting**: GitHub Pages unter `Barth-Testing/QA_Tool`
- **Deployment**: Push auf `main` → GitHub Pages liefert aus

## Projektstruktur

```
qa-dashboard/
├── index.html              # Einstiegspunkt, Navbar + Modal-Struktur
├── README.md               # Legacy (WSL2/VM-Setup-Notizen)
├── SUMMARY.md              # Diese Datei
├── css/
│   └── style.css           # Dark-Theme-Styling (547 Zeilen)
├── js/
│   ├── charts.js           # Chart-Engine: Donut- + Balkendiagramme auf Canvas
│   ├── grid.js             # Grid-Engine: Rendering, Drag&Drop, Resize, Status-Logik
│   └── app.js              # App-Logik: Daten laden, Dashboard-CRUD, Export, Events
└── data/
    ├── dashboards.json     # Dashboard-Definitionen (Tiles + Layout)
    ├── kpis.json            # KPI-Katalog (21 KPIs mit Metadaten)
    ├── qa-dashboard-export.json  # Vollständiger Export (dashboards + kpis + values)
    └── values.json          # *(optional)* KPI-Werte für Bot-Automation
```

## Charts

Jeder KPI-Tile zeigt ein automatisch generiertes Diagramm:

| Chart-Typ | KPIs |
|---|---|
| **Donut** (Kreisdiagramm) | Alle %-KPIs (Testabdeckung, Raten, Uptime, etc.) — Wert + Einheit im Zentrum |
| **Bar** (Balkendiagramm) | Numerische KPIs (Antwortzeiten, Fehlerzahlen, MTTR, etc.) — mit Schwellwert-Markierungen |

- Farbe des Charts folgt dem Status (Grün/Gelb/Rot/Neutral)
- **Harte Kante** am Donut-Ende (Butt-Cap) statt runder Überzeichnung
- Klick auf das Chart öffnet einen Inline-Editor für den Wert
- Tile-Größen entsprechen den deklarierten Werten aus dashboards.json (keine Mindestgröße 2×2 mehr); Tiles füllen den Grid automatisch aus

## Funktionsumfang

- **2 Dashboards**: "QA Overview" (6 Spalten) + "QA Ops Monitor" (3 Spalten)
- **21 KPIs** in 2 Kategorien: `dev` (13) + `ops` (8)
- **KPI-Katalog-Modal**: Durchsuchen, Filtern (Dev/Ops), Hinzufügen
- **Inline-Editing**: Klick auf KPI-Wert/Chart → Zahleneingabe mit Persistenz in localStorage (gleicher Mechanismus wie Werte-Tab)
- **Status-Ampel**: Grün/Gelb/Rot basierend auf konfigurierbaren Thresholds
- **Drag & Drop**: Tiles per Drag neu anordnen
- **Resize**: Tiles per Ziehgriff unten rechts skalieren
- **Spalten-Steuerung**: Slider (2-8 Spalten)
- **Export**: Komplette Konfiguration + Werte als JSON herunterladen
- **Werte-Tab**: Eigener Tab zum Anzeigen und Bearbeiten aller KPI-Werte des aktuellen Dashboards in einer Formular-Ansicht
- **Testkampagnen Sidebar**: Linke Spalte mit Kampagnen-Tiles; Mini-Donuts klickbar zur Werteingabe via Prompt (0-100); Labels: Manual, Automation, RFC, Mobile; Farben (grün/gelb/rot) pro Donut einstellbar durch Klick auf Label (Mini) oder Donut (Haupt-Donut)
- **values.json-Download**: Nur die aktuellen KPI-Werte als `values.json` herunterladen, bereit zum Commit ins Repo
- **Testabdeckung RFC (AC-KPI)**: Spezieller KPI-Typ "Testabdeckung RFC" mit individuellen Acceptance Criteria (ACs) — Donut-Chart zeigt prozentuale Abdeckung, darunter Liste aller ACs mit grün/rot-Status; Klick auf AC zeigt Detailtext; ACs können im Werte-Tab hinzugefügt/entfernt/bearbeitet werden
- **localStorage**: Dashboard-Zustand + eingegebene Werte persistiert

## Datenmodell

### KPI (`data/kpis.json`)
```
{
  id, name, category ("dev"|"ops"), description, formula, benefit,
  unit, thresholds: { green/yellow/red: { operator, value } },
  data_source_type ("api"|"manual"), tags[], example_value
}
```

### Dashboard (`data/dashboards.json`)
```
{ dashboards: [{ id, name, columns, is_favorite, tiles: [{ id, kpi_id, x, y, w, h }] }] }
```

### Values (`data/values.json`)
```
{ "pass-fail-rate": 95, "uptime": 99.99, ... }
```
Einfaches Key-Value-Mapping → wird beim App-Start geladen und mit localStorage gemerged.

## Automation / Bot-Integration

KPIs können automatisch befüllt werden:

1. **`data/values.json`** — Nur die Werte, minimales Format:
   ```json
   { "pass-fail-rate": 95, "test-coverage-code": 82, "uptime": 99.97 }
   ```

2. **`data/qa-dashboard-export.json`** — Kompletter Export inkl. Dashboards + KPIs + Values:
   ```json
   { "dashboards": [...], "kpis": [...], "customValues": { "pass-fail-rate": 95 } }
   ```

Bot-Workflow: Script generiert Datei → Commit → Push → GitHub Pages aktualisiert automatisch.

## Wichtige offene Punkte

- README.md enthält nur WSL2/Metasploitable-Notizen, keine Projektdoku
- Kein CI-Test oder Build-Script vorhanden
- Werte-Persistenz aktuell nur in localStorage (clientseitig)
- Keine API-Anbindung implementiert (KPI-Daten manuell oder per Bot-JSON)
