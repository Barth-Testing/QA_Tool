/* ===== QA Dashboard App ===== */
((Grid) => {
  'use strict';

  const DASHBOARDS_URL = 'data/dashboards.json';
  const KPIS_URL = 'data/kpis.json';
  const VALUES_URL = 'data/values.json';
  const EXPORT_URL = 'data/qa-dashboard-export.json';
  const STORAGE_KEY = 'qa_dashboard_state';
  const VALUES_KEY = 'qa_dashboard_values';

  let kpis = [];
  let kpiMap = {};
  let dashboards = [];
  let currentDashboardId = null;
  let currentTiles = [];
  let fileValues = {};

  /* ===== DOM Refs ===== */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const gridEl = $('#dashboard-grid');
  const selectEl = $('#dashboard-select');
  const catalogModal = $('#catalog-modal');
  const catalogList = $('#catalog-list');
  const catalogSearch = $('#catalog-search');
  const columnModal = $('#column-modal');
  const columnSlider = $('#column-slider');
  const columnValue = $('#column-value');
  const toastContainer = $('#toast-container');
  const valuesTab = $('#values-tab');
  const valuesForm = $('#values-form');
  /* tab state */
  let activeTab = 'dashboard';

  /* ===== Initialize ===== */
  async function init() {
    await loadData();
    setupEventListeners();
    restoreState();
    ensureTileSizes();
    if (!currentDashboardId && dashboards.length > 0) {
      currentDashboardId = dashboards[0].id;
    }
    render();
  }

  function ensureTileSizes() {
    for (const db of dashboards) {
      for (const tile of db.tiles) {
        const kpi = kpiMap[tile.kpi_id];
        if (!kpi) continue;
        if (ChartEngine.getChartType(kpi)) {
          if (tile.w < 2) tile.w = 2;
          if (tile.h < 2) tile.h = 2;
        }
      }
      db.tiles = Grid.compactGrid(db.tiles);
    }
  }

  /* ===== Data Loading ===== */
  async function loadData() {
    try {
      const [kpiResp, dashResp, valuesResp, exportResp] = await Promise.all([
        fetch(KPIS_URL),
        fetch(DASHBOARDS_URL),
        fetch(VALUES_URL).catch(() => null),
        fetch(EXPORT_URL).catch(() => null)
      ]);
      kpis = await kpiResp.json();
      const dashData = await dashResp.json();
      dashboards = dashData.dashboards;
      kpiMap = {};
      for (const k of kpis) kpiMap[k.id] = k;

      if (exportResp && exportResp.ok) {
        const exportData = await exportResp.json();
        if (exportData.customValues) {
          fileValues = { ...fileValues, ...exportData.customValues };
        }
        if (exportData.dashboards) dashboards = exportData.dashboards;
        if (exportData.kpis) {
          kpis = exportData.kpis;
          kpiMap = {};
          for (const k of kpis) kpiMap[k.id] = k;
        }
      }

      if (valuesResp && valuesResp.ok) {
        const vals = await valuesResp.json();
        fileValues = { ...fileValues, ...vals };
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      toast('Fehler beim Laden der Daten. Bitte sicherstellen, dass die JSON-Dateien existieren.');
    }
  }

  /* ===== State Persistence ===== */
  function saveState() {
    try {
      const state = {
        currentDashboardId,
        dashboards,
        kpis
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* localStorage full or unavailable */ }
  }

  function restoreState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const state = JSON.parse(saved);
      if (state.dashboards) dashboards = state.dashboards;
      if (state.currentDashboardId) currentDashboardId = state.currentDashboardId;
    } catch (e) { /* ignore corrupt state */ }
  }

  /* ===== Get Current Dashboard ===== */
  function getCurrentDashboard() {
    return dashboards.find(d => d.id === currentDashboardId);
  }

  function getCurrentTiles() {
    const db = getCurrentDashboard();
    return db ? db.tiles : [];
  }

  function renderDashboardSelect() {
    selectEl.innerHTML = dashboards.map(d =>
      `<option value="${d.id}">${d.is_favorite ? '★ ' : ''}${d.name}</option>`
    ).join('');
  }

  /* ===== Dashboard CRUD ===== */
  function switchDashboard(id) {
    currentDashboardId = id;
    saveState();
    render();
  }

  function getNextTileId() {
    const allIds = dashboards.flatMap(d => d.tiles.map(t => t.id));
    let n = 1;
    while (allIds.includes('t' + n)) n++;
    return 't' + n;
  }

  function addTileToDashboard(kpiId) {
    const db = getCurrentDashboard();
    if (!db) return;
    if (db.tiles.some(t => t.kpi_id === kpiId)) {
      toast('Dieser KPI ist bereits auf dem Dashboard.');
      return;
    }
    const kpi = kpiMap[kpiId];
    const hasChart = kpi && ChartEngine.getChartType(kpi);
    const w = hasChart ? 2 : 1;
    const h = hasChart ? 2 : 1;
    const slot = Grid.findFreeSlot(db.tiles, w, h);
    db.tiles.push({
      id: getNextTileId(),
      kpi_id: kpiId,
      x: slot.x,
      y: slot.y,
      w,
      h
    });
    saveState();
    render();
    toast(`„${kpi.name}" zum Dashboard hinzugefügt`);
  }

  function removeTile(tileId) {
    const db = getCurrentDashboard();
    if (!db) return;
    db.tiles = db.tiles.filter(t => t.id !== tileId);
    db.tiles = Grid.compactGrid(db.tiles);
    saveState();
    render();
    toast('KPI entfernt');
  }

  function swapTiles(sourceId, targetId) {
    const db = getCurrentDashboard();
    if (!db) return;
    const src = db.tiles.find(t => t.id === sourceId);
    const tgt = db.tiles.find(t => t.id === targetId);
    if (!src || !tgt) return;
    [src.x, tgt.x] = [tgt.x, src.x];
    [src.y, tgt.y] = [tgt.y, src.y];
    db.tiles = Grid.compactGrid(db.tiles);
    saveState();
    render();
  }

  function resizeTile(tileId, w, h) {
    const db = getCurrentDashboard();
    if (!db) return;
    const tile = db.tiles.find(t => t.id === tileId);
    if (!tile) return;
    tile.w = w;
    tile.h = h;
    db.tiles = Grid.compactGrid(db.tiles);
    saveState();
    render();
  }

  function setColumnCount(n) {
    const db = getCurrentDashboard();
    if (!db) return;
    db.columns = n;
    db.tiles = Grid.compactGrid(db.tiles);
    saveState();
    render();
    toast(`Spaltenanzahl auf ${n} geändert`);
  }

  /* ===== Catalog ===== */
  function openCatalog() {
    catalogModal.classList.remove('hidden');
    renderCatalog('all', '');
  }

  function closeCatalog() {
    catalogModal.classList.add('hidden');
  }

  function renderCatalog(filter, search) {
    let filtered = [...kpis];
    if (filter !== 'all') filtered = filtered.filter(k => k.category === filter);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(k =>
        k.name.toLowerCase().includes(q) ||
        k.description.toLowerCase().includes(q) ||
        k.tags.some(t => t.includes(q))
      );
    }
    catalogList.innerHTML = filtered.map(kpi => {
      const db = getCurrentDashboard();
      const isAdded = db && db.tiles.some(t => t.kpi_id === kpi.id);
      return `
        <div class="catalog-item" data-kpi-id="${kpi.id}">
          <div class="catalog-item-info">
            <div class="catalog-item-name">${kpi.name}</div>
            <div class="catalog-item-desc">${kpi.description}</div>
          </div>
          <div class="catalog-item-meta">
            <span class="category-tag ${kpi.category}">${kpi.category === 'dev' ? 'Dev' : 'Ops'}</span>
            <span class="catalog-item-unit">${kpi.unit || ''}</span>
            <button class="btn btn-sm btn-primary btn-add-kpi" ${isAdded ? 'disabled style="opacity:0.4"' : ''}>
              ${isAdded ? '✓ Hinzugefügt' : '+ Hinzufügen'}
            </button>
          </div>
        </div>`;
    }).join('');

    catalogList.querySelectorAll('.btn-add-kpi').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.catalog-item');
        if (item) addTileToDashboard(item.dataset.kpiId);
        closeCatalog();
      });
    });

    catalogList.querySelectorAll('.catalog-item').forEach(item => {
      item.addEventListener('click', () => {
        addTileToDashboard(item.dataset.kpiId);
        closeCatalog();
      });
    });
  }

  /* ===== Info Panel ===== */
  function showInfoPanel(kpi) {
    const overlay = document.createElement('div');
    overlay.className = 'info-panel-overlay';
    overlay.innerHTML = `
      <div class="info-panel">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem">
          <h3>${kpi.name}</h3>
          <button class="btn-close" id="info-close">&times;</button>
        </div>
        <p>${kpi.description}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:1rem">
          <div><div class="info-label">Formel</div><div class="info-value" style="font-size:0.82rem">${kpi.formula || '—'}</div></div>
          <div><div class="info-label">Einheit</div><div class="info-value">${kpi.unit || '—'}</div></div>
          <div><div class="info-label">Kategorie</div><div class="info-value" style="text-transform:capitalize">${kpi.category}</div></div>
          <div><div class="info-label">Datenquelle</div><div class="info-value">${kpi.data_source_type === 'api' ? 'API' : 'Manuell'}</div></div>
          <div style="grid-column:1/-1"><div class="info-label">Nutzen</div><div class="info-value">${kpi.benefit || '—'}</div></div>
        </div>
        <div style="margin-top:1rem">${renderThresholdPreview(kpi)}</div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.id === 'info-close') overlay.remove();
    });
  }

  function renderThresholdPreview(kpi) {
    if (!kpi.thresholds) return '<div class="info-label">Keine Grenzwerte definiert</div>';
    const t = kpi.thresholds;
    const opLabel = (op) => op === 'lt' ? '<' : op === 'gt' ? '>' : op === 'lte' ? '≤' : op === 'gte' ? '≥' : op === 'eq' ? '=' : op;
    let parts = [];
    if (t.green) parts.push(`<span style="color:var(--green)">🟢 ${opLabel(t.green.operator)} ${t.green.value}</span>`);
    if (t.yellow) parts.push(`<span style="color:var(--yellow)">🟡 ${opLabel(t.yellow.operator)} ${t.yellow.value}</span>`);
    if (t.red) parts.push(`<span style="color:var(--red)">🔴 ${opLabel(t.red.operator)} ${t.red.value}</span>`);
    return `<div class="info-label">Grenzwerte</div><div style="display:flex;gap:0.75rem;margin-top:0.3rem">${parts.join('')}</div>`;
  }

  /* ===== Toast ===== */
  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 300ms';
      setTimeout(() => el.remove(), 300);
    }, 2500);
  }

  /* ===== Custom Values (Inline Editing) ===== */
  function getCustomValues() {
    try {
      const local = JSON.parse(localStorage.getItem(VALUES_KEY)) || {};
      return { ...fileValues, ...local };
    } catch { return { ...fileValues }; }
  }

  function setCustomValue(kpiId, value) {
    const vals = getCustomValues();
    vals[kpiId] = value;
    localStorage.setItem(VALUES_KEY, JSON.stringify(vals));
  }

  /* ===== Render ===== */
  function render() {
    const db = getCurrentDashboard();
    if (!db) {
      gridEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">◆</div><div class="empty-state-text">Kein Dashboard vorhanden</div></div>`;
      return;
    }

    currentTiles = db.tiles;
    Grid.init(db.columns, kpiMap);
    Grid.setCustomValues(getCustomValues());
    Grid.renderGrid(gridEl, db.tiles, db.columns);
    renderDashboardSelect();
    selectEl.value = db.id;
    columnSlider.value = db.columns;
    columnValue.textContent = db.columns;
    if (activeTab === 'values') renderValuesTab();
  }

  /* ===== Tab Switching ===== */
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const isDashboard = tab === 'dashboard';
    gridEl.classList.toggle('hidden', !isDashboard);
    valuesTab.classList.toggle('hidden', isDashboard);
    document.querySelectorAll('.dashboard-only').forEach(el => el.style.display = isDashboard ? '' : 'none');
    if (tab === 'values') renderValuesTab();
  }

  /* ===== Values Tab ===== */
  function renderValuesTab() {
    const db = getCurrentDashboard();
    if (!db) {
      valuesForm.innerHTML = '<div class="empty-state"><div class="empty-state-text">Kein Dashboard ausgewählt</div></div>';
      return;
    }
    const vals = getCustomValues();
    const tiles = db.tiles;
    if (!tiles || tiles.length === 0) {
      valuesForm.innerHTML = '<div class="empty-state"><div class="empty-state-text">Dieses Dashboard enthält noch keine KPIs</div></div>';
      return;
    }
    const statusLabels = { green: 'Gut', yellow: 'Warnung', red: 'Kritisch', neutral: '—' };
    const hasChanges = tiles.some(t => {
      const kpi = kpiMap[t.kpi_id];
      return kpi && vals[t.kpi_id] !== undefined && vals[t.kpi_id] !== kpi.example_value;
    });

    let html = '';
    if (hasChanges) {
      html += '<div style="grid-column:1/-1;font-size:0.82rem;color:var(--yellow);margin-bottom:0.25rem">⚡ Ungespeicherte Änderungen (Abweichungen von Standardwerten)</div>';
    }

    for (const tile of tiles) {
      const kpi = kpiMap[tile.kpi_id];
      if (!kpi) continue;
      const currentVal = vals[tile.kpi_id] !== undefined ? vals[tile.kpi_id] : kpi.example_value;
      const status = GridEngine.getStatus(kpi, currentVal);
      const isChanged = vals[tile.kpi_id] !== undefined && vals[tile.kpi_id] !== kpi.example_value;
      html += `
        <div class="values-field" data-kpi-id="${kpi.id}">
          <div class="values-field-label">
            <div class="values-field-name">${kpi.name}</div>
            <div class="values-field-unit">${kpi.unit || '—'} · ${kpi.category === 'dev' ? 'Dev' : 'Ops'}</div>
          </div>
          <input type="number" step="any" class="values-field-input${isChanged ? ' values-field-input--changed' : ''}" value="${currentVal}" data-kpi-id="${kpi.id}">
          <span class="values-field-badge ${status}">${statusLabels[status]}</span>
        </div>`;
    }
    valuesForm.innerHTML = html;

    valuesForm.querySelectorAll('.values-field-input').forEach(input => {
      const kpiId = input.dataset.kpiId;
      const commit = () => {
        const raw = input.value.trim();
        if (raw === '') return;
        const num = parseFloat(raw);
        if (isNaN(num)) return;
        const evt = new CustomEvent('tile:value-change', {
          detail: { kpiId, value: num }
        });
        document.dispatchEvent(evt);
      };
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });
    });
  }

  /* ===== Download Values as JSON ===== */
  function downloadValues() {
    const db = getCurrentDashboard();
    if (!db || !db.tiles || db.tiles.length === 0) {
      toast('Keine Werte zum Exportieren vorhanden.');
      return;
    }
    const vals = getCustomValues();
    const filtered = {};
    for (const tile of db.tiles) {
      const kpi = kpiMap[tile.kpi_id];
      if (!kpi) continue;
      const val = vals[tile.kpi_id] !== undefined ? vals[tile.kpi_id] : kpi.example_value;
      filtered[tile.kpi_id] = val;
    }
    const data = JSON.stringify(filtered, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'values.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('values.json heruntergeladen');
  }

  function formatExportValue(v) {
    if (Number.isInteger(v)) return v.toString();
    return v.toFixed(1);
  }

  /* ===== Export ===== */
  function exportConfig() {
    const customValues = getCustomValues();
    const data = JSON.stringify({ dashboards, kpis, customValues }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qa-dashboard-export.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Konfiguration inkl. Werte exportiert');
  }

  /* ===== Event Listeners ===== */
  function setupEventListeners() {
    /* Dashboard switch */
    selectEl.addEventListener('change', () => switchDashboard(selectEl.value));

    /* Catalog modal */
    $('#btn-catalog').addEventListener('click', openCatalog);
    $('#btn-close-catalog').addEventListener('click', closeCatalog);
    catalogModal.querySelector('.modal-backdrop').addEventListener('click', closeCatalog);

    catalogSearch.addEventListener('input', () => {
      const active = catalogList.querySelector('.filter-btn.active');
      const filter = active ? active.dataset.filter : 'all';
      renderCatalog(filter, catalogSearch.value);
    });

    catalogModal.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        catalogModal.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderCatalog(btn.dataset.filter, catalogSearch.value);
      });
    });

    /* Column modal */
    $('#btn-columns').addEventListener('click', () => columnModal.classList.remove('hidden'));
    $('#btn-close-columns').addEventListener('click', () => columnModal.classList.add('hidden'));
    columnModal.querySelector('.modal-backdrop').addEventListener('click', () => columnModal.classList.add('hidden'));

    columnSlider.addEventListener('input', () => {
      columnValue.textContent = columnSlider.value;
    });
    columnSlider.addEventListener('change', () => {
      setColumnCount(parseInt(columnSlider.value));
      columnModal.classList.add('hidden');
    });

    /* Export */
    $('#btn-export').addEventListener('click', exportConfig);

    /* Tab switching */
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    /* Download values */
    $('#btn-download-values').addEventListener('click', downloadValues);

    /* Custom events from grid */
    document.addEventListener('tile:remove', (e) => removeTile(e.detail.tileId));
    document.addEventListener('tile:swap', (e) => swapTiles(e.detail.sourceId, e.detail.targetId));
    document.addEventListener('tile:resize', (e) => resizeTile(e.detail.tileId, e.detail.w, e.detail.h));
    document.addEventListener('tile:info', (e) => showInfoPanel(e.detail.kpi));
    document.addEventListener('tile:value-change', (e) => {
      const { kpiId, value } = e.detail;
      setCustomValue(kpiId, value);
      const kpi = kpiMap[kpiId];
      render();
      if (kpi) toast(`„${kpi.name}" → ${formatExportValue(value)}${kpi.unit ? ' ' + kpi.unit : ''}`);
    });

    /* Keyboard */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCatalog();
        columnModal.classList.add('hidden');
        document.querySelectorAll('.info-panel-overlay').forEach(el => el.remove());
      }
    });
  }

  /* ===== Start ===== */
  document.addEventListener('DOMContentLoaded', init);
})(GridEngine);
