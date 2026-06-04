# QA Dashboard

Quality Assurance dashboard for tracking test campaigns, KPIs, and release metrics across software development lifecycles.

## Features

### Dashboard Grid
- Drag-and-drop tile grid with 4 columns
- Add/remove KPI tiles from a searchable catalog
- Resize tiles (1×1 to 4×4) via modal dialog
- Multiple dashboards with tab-style switching
- Tile animations on enter, hover effects, status bars

### KPI Tiles
Each tile displays a KPI with automatic status coloring (green/yellow/red/neutral) based on thresholds:

| Type | Description |
|---|---|
| **Donut** | Percentage values with arc visualization and unit label |
| **Bar** | Horizontal bar with threshold markers |
| **Numeric** | Large number display for count-based KPIs (Anzahl, Tests, PT) |
| **Response Comparison** | Table comparing FE response times across 3 versions (current/previous/reference) with trend indicators |
| **Time Evolution** | Version comparison with color-coded diff per dimension + PASSED/FAILED badges |
| **AC** | Acceptance Criteria checklist with pass/fail per criterion |
| **RFC Tests** | Campaign version selector with test execution donut |

### Inline Value Editing
- Click a tile's chart area to open a numeric input
- Edit KPI values directly on the dashboard
- Changes persist to `localStorage` immediately

### Time Evolution Comparison
For the "Empfängersuche nach Parametern" KPI:
- Two dropdowns to select any two versions for comparison
- Auto-selects latest overall version vs latest patch of the previous minor version
- Per-dimension diff display with color coding:
  - <10 % difference → neutral (gray)
  - 10–25 % → lime (improvement) / yellow (regression)
  - >25 % → green (improvement) / red (regression)
- PASSED/FAILED badges shown when diff ≤ 25 %
- Summary verdict bar with pass/fail count

### Response Comparison
For the "FE Response DEV" and "FE Response STA" KPIs:
- Table comparing up to 26 test situations across 3 versions
- Trend arrows (▲/▼/—) with percentage tooltips
- Full chart modal with grouped bar chart

### Theme
- Dark/light theme toggle with CSS custom properties
- Smooth background/text transitions
- Theme persisted in `localStorage`

### Testing Campaign Management
- Create, edit, archive test campaign entries per version
- Track 4 areas per campaign: Manual, Automation, RFC, Mobile
- Each area tracks planned/passed/failed/blocked
- Visual donut for overall execution rate + per-area mini donuts
- PASSED/FAILED indicators for operational readiness and completion
- Campaign chart modal with summary
- Drag-and-drop reordering
- Campaign data persisted in `localStorage`

### RFC Test Coverage
- Add RFC entries with named acceptance criteria
- Per-AC pass/fail tracking
- Coverage donut with percentage
- Color-coded AC grid
- Detail modal per AC
- Data persisted in `localStorage`

### Values Tab
- Dedicated tab for editing all KPI values in one place
- AC management with add/remove/toggle per criterion
- Response Comparison version selection and release management
- Time Evolution data overview
- Download values as JSON

### Export & Import
- Full export to JSON including dashboards, KPIs, custom values, campaigns, RFC entries, theme
- Import restores complete dashboard state
- Date-stamped filenames

## Architecture

```
qa-dashboard/
├── index.html          # Main entry point
├── css/
│   └── style.css       # Full design system with dark/light themes
├── js/
│   ├── charts.js       # Canvas 2D chart engine (donut, bar, line, comparison)
│   ├── grid.js         # Grid engine (tiles, drag-drop, resize, TE comparison)
│   └── app.js          # Application logic (state, campaigns, RFC, modals)
└── data/
    ├── dashboards.json # Default dashboard definitions
    ├── kpis.json       # KPI catalog with thresholds, formulas
    └── values.json     # Default KPI values
```

### Key Modules

**ChartEngine** (`charts.js`) — Standalone chart rendering using Canvas 2D API:
- `drawDonut()` — Doughnut chart for percentage KPIs
- `drawBar()` — Horizontal bar chart with threshold overlays
- `drawMiniDonut()` — Compact donut for inline/campaign display
- `drawResponseComparison()` — Grouped bar chart for FE response time comparison
- `drawSegmentedDonut()` — Multi-segment donut (passed/failed/blocked)
- `drawCampaignChart()` — Full campaign summary with table and mini donuts
- `drawTimeEvolution()` — Multi-line chart for time-series version data
- All chart functions adapt colors to the current theme (dark/light) via CSS custom properties

**GridEngine** (`grid.js`) — Tile layout and interaction:
- Grid system with find-free-slot and compact-grid algorithms
- Drag-and-drop tile swapping
- Resize dialog via modal with 16 preset sizes (1×1 to 4×4)
- Time Evolution comparison with auto-version selection and diff coloring
- Status calculation based on KPI thresholds
- `html2canvas` tile export as PNG

**App** (`app.js`) — Application orchestration:
- Data loading from JSON files with localStorage override
- Dashboard CRUD and tab switching
- KPI catalog modal with search/filter
- Info panel with threshold preview
- Campaign lifecycle (create, edit, archive, reorder)
- RFC entry management with AC detail view
- Export/Import with full state serialization
- Computed KPI support (e.g., test-automation-rate)
- Toast notification system

## Data Flow

1. On load, `app.js` fetches `dashboards.json`, `kpis.json`, `values.json`
2. State is enhanced with values from `qa-dashboard-export.json` (if present)
3. `localStorage` overrides file-based data for custom values
4. Computed KPIs are recalculated on every render
5. Theme, dashboard layout, and campaigns are persisted in `localStorage`
6. Export produces a single JSON file that can restore full state via import

## Setup

No build step required — pure HTML/CSS/JS.

1. Clone the repository
2. Serve the `qa-dashboard/` directory with any HTTP server:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8080
   ```
3. Open in a browser

## Development

- All CSS custom properties are defined in `style.css` under `[data-theme="dark"]` and `[data-theme="light"]`
- Chart engine reads theme colors from `getComputedStyle(document.documentElement)` — no hardcoded theme values
- KPI defintions live in `data/kpis.json` — add new KPIs by appending to the array
- Add computed KPIs in `app.js` under the `COMPUTED_KPIS` object
