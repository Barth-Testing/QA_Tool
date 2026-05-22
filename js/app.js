/* ===== QA Dashboard App ===== */
((Grid) => {
  'use strict';

  const DASHBOARDS_URL = 'data/dashboards.json';
  const KPIS_URL = 'data/kpis.json';
  const STORAGE_KEY = 'qa_dashboard_state';

  let kpis = [];
  let kpiMap = {};
  let dashboards = [];
  let currentDashboardId = null;
  let currentTiles = [];

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

  /* ===== Initialize ===== */
  async function init() {
    await loadData();
    setupEventListeners();
    restoreState();
    if (!currentDashboardId && dashboards.length > 0) {
      currentDashboardId = dashboards[0].id;
    }
    render();
  }

  /* ===== Data Loading ===== */
  async function loadData() {
    try {
      const [kpiResp, dashResp] = await Promise.all([
        fetch(KPIS_URL),
        fetch(DASHBOARDS_URL)
      ]);
      kpis = await kpiResp.json();
      const dashData = await dashResp.json();
      dashboards = dashData.dashboards;
      kpiMap = {};
      for (const k of kpis) kpiMap[k.id] = k;
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

  /* ===== Render ===== */
  function render() {
    const db = getCurrentDashboard();
    if (!db) {
      gridEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">◆</div><div class="empty-state-text">Kein Dashboard vorhanden</div></div>`;
      return;
    }

    currentTiles = db.tiles;
    Grid.init(db.columns, kpiMap);
    Grid.renderGrid(gridEl, db.tiles, db.columns);
    renderDashboardSelect();
    selectEl.value = db.id;
    columnSlider.value = db.columns;
    columnValue.textContent = db.columns;
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
    const w = kpi && kpi.id === 'a-bugs-post-release' ? 2 : 1;
    const h = 1;
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

  /* ===== Export ===== */
  function exportConfig() {
    const data = JSON.stringify({ dashboards, kpis }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qa-dashboard-export.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Konfiguration exportiert');
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

    /* Custom events from grid */
    document.addEventListener('tile:remove', (e) => removeTile(e.detail.tileId));
    document.addEventListener('tile:swap', (e) => swapTiles(e.detail.sourceId, e.detail.targetId));
    document.addEventListener('tile:resize', (e) => resizeTile(e.detail.tileId, e.detail.w, e.detail.h));
    document.addEventListener('tile:info', (e) => showInfoPanel(e.detail.kpi));

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
