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
  const toastContainer = $('#toast-container');
  const valuesTab = $('#values-tab');
  const valuesForm = $('#values-form');
  /* tab state */
  let activeTab = 'dashboard';

  /* ===== Theme ===== */
  const THEME_KEY = 'qa_dashboard_theme';
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeBtn(theme);
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeBtn(next);
  }
  function updateThemeBtn(theme) {
    const btn = $('#btn-theme');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  /* ===== Initialize ===== */
  async function init() {
    initTheme();
    await loadData();
    migrateAcStorage();
    setupEventListeners();
    const savedColumns = {};
    for (const db of dashboards) savedColumns[db.id] = db.columns;
    restoreState();
    for (const db of dashboards) {
      if (savedColumns[db.id] !== undefined) db.columns = savedColumns[db.id];
    }
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
        if (tile.w < 1) tile.w = 1;
        if (tile.h < 1) tile.h = 1;
        if (tile.kpi_id === 'rfc-tests') {
          const size = Math.max(tile.w, tile.h, 1);
          tile.w = size;
          tile.h = size;
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
          const exportIds = new Set(exportData.kpis.map(k => k.id));
          for (const k of kpis) {
            if (!exportIds.has(k.id)) exportData.kpis.push(k);
          }
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
    const isRfcTests = kpiId === 'rfc-tests';
    const hasChart = !isRfcTests && kpi && ChartEngine.getChartType(kpi);
    const w = isRfcTests ? 1 : (hasChart ? 2 : 1);
    const h = isRfcTests ? 1 : (hasChart ? 2 : 1);
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
    if (tile.kpi_id === 'rfc-tests') {
      const size = Math.max(w, h, 1);
      tile.w = size;
      tile.h = size;
    } else {
      tile.w = w;
      tile.h = h;
    }
    db.tiles = Grid.compactGrid(db.tiles);
    saveState();
    render();
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

  /* ===== AC Detail Panel ===== */
  function showAcDetail(kpiName, acId, acText) {
    const overlay = document.createElement('div');
    overlay.className = 'info-panel-overlay';
    overlay.innerHTML = `
      <div class="info-panel">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem">
          <h3>${kpiName} — ${acId}</h3>
          <button class="btn-close" id="info-close">&times;</button>
        </div>
        <p style="font-size:0.95rem;line-height:1.6;color:var(--text)">${acText}</p>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.id === 'info-close') overlay.remove();
    });
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

  /* ===== Migrate stale AC localStorage entries ===== */
  function migrateAcStorage() {
    try {
      const local = JSON.parse(localStorage.getItem(VALUES_KEY)) || {};
      let changed = false;
      for (const key of Object.keys(fileValues)) {
        const fv = fileValues[key];
        if (fv && typeof fv === 'object' && fv.acs) {
          if (typeof local[key] === 'number') {
            delete local[key];
            changed = true;
          }
        }
      }
      if (changed) {
        localStorage.setItem(VALUES_KEY, JSON.stringify(local));
      }
    } catch {}
  }

  /* ===== Computed KPIs (automatisch berechnet) ===== */
  const COMPUTED_KPIS = {
    'test-automation-rate': (vals) => {
      const auto = vals['automated-tests'];
      const manual = vals['manual-tests'];
      if (auto != null && manual != null && (auto + manual) > 0) {
        return Math.round((auto / (auto + manual)) * 100);
      }
      return 0;
    }
  };

  const COMPUTED_KPI_IDS = new Set(Object.keys(COMPUTED_KPIS));

  function isComputedKpi(kpiId) {
    return COMPUTED_KPI_IDS.has(kpiId);
  }

  /* ===== RFC Tests Campaign Selection ===== */
  const RFC_TESTS_CAMPAIGN_KEY = 'qa_dashboard_rfc_tests_campaign';

  function getRfcTestsCampaignId() {
    try {
      return localStorage.getItem(RFC_TESTS_CAMPAIGN_KEY);
    } catch { return null; }
  }

  function setRfcTestsCampaignId(id) {
    try {
      if (id) {
        localStorage.setItem(RFC_TESTS_CAMPAIGN_KEY, id);
      } else {
        localStorage.removeItem(RFC_TESTS_CAMPAIGN_KEY);
      }
    } catch {}
  }

  /* ===== Custom Values (Inline Editing) ===== */
  function getCustomValues() {
    try {
      const local = JSON.parse(localStorage.getItem(VALUES_KEY)) || {};
      const merged = { ...fileValues, ...local };
      /* Protect AC-type objects (have .acs) from being overwritten by stale numbers in localStorage */
      for (const key of Object.keys(fileValues)) {
        const fv = fileValues[key];
        if (fv && typeof fv === 'object' && fv.acs) {
          if (typeof local[key] !== 'object') {
            merged[key] = fv;
          }
        }
      }
      /* Apply computed KPIs (override any stale stored values) */
      for (const [kpiId, fn] of Object.entries(COMPUTED_KPIS)) {
        merged[kpiId] = fn(merged);
      }
      /* RFC Tests value from campaigns */
      const rfcCampId = getRfcTestsCampaignId();
      const rfcC = rfcCampId ? campaigns.find(c => c.id === rfcCampId) : null;
      const rfcFallback = !rfcC && campaigns.length > 0 ? campaigns[0] : null;
      const rfcSrc = rfcC || rfcFallback;
      if (rfcSrc && rfcSrc.values[2]) {
        merged['rfc-tests'] = rfcSrc.values[2].planned || 0;
        if (!rfcC && rfcFallback) setRfcTestsCampaignId(rfcFallback.id);
      }
      return merged;
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

    currentTiles = Grid.compactGrid(db.tiles);
    Grid.init(db.columns, kpiMap);
    Grid.setCustomValues(getCustomValues());
    Grid.setCampaigns(campaigns, getRfcTestsCampaignId());
    Grid.renderGrid(gridEl, currentTiles, db.columns);
    renderDashboardSelect();
    selectEl.value = db.id;
    if (activeTab === 'values') renderValuesTab();
    renderCampaigns();
    renderRfcSidebar();
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
  function isResponseComparisonValue(val) {
    return val && typeof val === 'object' && val.versionData && val.testSituations && !val.xAxisOrder;
  }

  function isTimeEvolutionValue(val) {
    return val && typeof val === 'object' && val.versionData && val.xAxisOrder && val.testSituations;
  }

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
      const isAcKpi = currentVal && typeof currentVal === 'object' && currentVal.acs;
      const isRcKpi = isResponseComparisonValue(currentVal);
      const isTeKpi = isTimeEvolutionValue(currentVal);

      if (isAcKpi) {
        html += renderAcValuesField(kpi, currentVal, vals);
      } else if (isRcKpi) {
        html += renderRcValuesField(kpi, currentVal);
      } else if (isTeKpi) {
        html += renderTeValuesField(kpi, currentVal);
      } else if (isComputedKpi(kpi.id)) {
        const status = GridEngine.getStatus(kpi, currentVal);
        html += `
          <div class="values-field values-field--computed" data-kpi-id="${kpi.id}">
            <div class="values-field-label">
              <div class="values-field-name">${kpi.name}</div>
              <div class="values-field-unit">${kpi.unit || '—'} · automatisch berechnet</div>
            </div>
            <div class="values-field-computed-value">${currentVal}${kpi.unit ? ' ' + kpi.unit : ''}</div>
            <span class="values-field-badge ${status}">${statusLabels[status]}</span>
          </div>`;
      } else {
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

    setupRcFormEvents();
    setupAcFormEvents();
  }

  function renderRcValuesField(kpi, currentVal) {
    const availableVersions = Object.keys(currentVal.versionData);
    const currentVer = currentVal.currentVersion;
    const previousVer = currentVal.previousVersion;

    return `
      <div class="values-rc-field" data-kpi-id="${kpi.id}">
        <div class="values-rc-header">
          <div class="values-field-label">
            <div class="values-field-name">${kpi.name}</div>
            <div class="values-field-unit">${kpi.unit || '—'} · ${kpi.category === 'dev' ? 'Dev' : 'Ops'}</div>
          </div>
          <span class="values-rc-info">${currentVal.testSituations.length} Testsituationen · Referenz ${currentVal.referenceVersion} fest</span>
        </div>
        <div class="values-rc-config">
          <div class="values-rc-config-item">
            <label>Aktuelle Version</label>
            <select class="values-rc-select" data-rc-key="currentVersion">
              ${availableVersions.map(v => `<option value="${v}" ${v === currentVer ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="values-rc-config-item">
            <label>Vorherige Version</label>
            <select class="values-rc-select" data-rc-key="previousVersion">
              ${availableVersions.map(v => `<option value="${v}" ${v === previousVer ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="values-rc-config-item values-rc-add-item">
            <label>&nbsp;</label>
            <button class="btn btn-sm btn-secondary btn-rc-add-release" data-kpi-id="${kpi.id}">+ Neues Release</button>
          </div>
        </div>
        <div class="values-rc-version-list">
          ${availableVersions.map(v => `
            <div class="values-rc-version-row">
              <span class="values-rc-version-name">${v}</span>
              <span class="values-rc-version-count">${currentVal.versionData[v].length} Werte</span>
              <button class="btn btn-sm btn-secondary btn-rc-edit-release" data-kpi-id="${kpi.id}" data-version="${v}">Bearbeiten</button>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  function renderTeValuesField(kpi, currentVal) {
    const versions = currentVal.xAxisOrder;
    const sits = currentVal.testSituations;
    const lineColors = ['#6366f1', '#22c55e', '#eab308', '#f97316', '#ef4444', '#3b82f6'];
    const verCount = versions.length;
    const sitCount = sits.length;

    return `
      <div class="values-rc-field" data-kpi-id="${kpi.id}">
        <div class="values-rc-header">
          <div class="values-field-label">
            <div class="values-field-name">${kpi.name}</div>
            <div class="values-field-unit">${kpi.unit || '—'} · ${kpi.category === 'dev' ? 'Dev' : 'Ops'}</div>
          </div>
          <span class="values-rc-info">${verCount} Releases · ${sitCount} Suchdimensionen · Aktuell ${currentVal.latestVersion}</span>
        </div>
        <div class="tile-rc-table-wrap" style="max-height:300px;overflow:auto">
          <table class="tile-rc-table" style="font-size:0.75rem">
            <thead>
              <tr>
                <th style="width:80px">Release</th>
                ${sits.map((sit, si) => `<th style="color:${lineColors[si]}">${sit}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${versions.map(ver => {
                const vals = currentVal.versionData[ver] || [];
                return `
                  <tr>
                    <td style="font-weight:600;color:var(--text)">${ver}</td>
                    ${sits.map((_, si) => {
                      const v = vals[si];
                      if (v === null || v === undefined) return '<td style="color:var(--text-muted)">—</td>';
                      const isLatest = ver === currentVal.latestVersion;
                      return `<td${isLatest ? ' style="color:var(--green);font-weight:600"' : ''}>${v.toFixed(2)} s</td>`;
                    }).join('')}
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* ===== RC Add / Edit Release Modal ===== */
  let rcAddKpiId = null;
  let rcEditVersion = null;

  function openRcAddModal(kpiId, editVersion) {
    rcAddKpiId = kpiId;
    rcEditVersion = editVersion || null;
    const vals = getCustomValues();
    const rcVal = vals[kpiId];
    if (!rcVal || !rcVal.testSituations) return;
    const isEdit = !!editVersion;
    $('#rc-add-title').textContent = `${kpiMap[kpiId]?.name || 'KPI'} — ${isEdit ? 'Release bearbeiten' : 'Neues Release'}`;
    const list = $('#rc-add-values-list');
    const existingVals = isEdit ? rcVal.versionData[editVersion] : null;
    list.innerHTML = rcVal.testSituations.map((sit, i) => `
      <div class="rc-add-value-row">
        <span class="rc-add-value-label" title="${sit}">${sit}</span>
        <input type="number" class="rc-add-value-input" data-index="${i}" placeholder="ms" value="${existingVals ? existingVals[i] : 0}" min="0">
      </div>
    `).join('');
    const verInput = $('#rc-add-version');
    verInput.value = isEdit ? editVersion : '';
    verInput.disabled = isEdit;
    $('#rc-add-modal').classList.remove('hidden');
    if (!isEdit) setTimeout(() => verInput.focus(), 100);
  }

  function closeRcAddModal() {
    $('#rc-add-modal').classList.add('hidden');
    $('#rc-add-version').disabled = false;
    rcAddKpiId = null;
    rcEditVersion = null;
  }

  function saveRcAddRelease() {
    const kpiId = rcAddKpiId;
    if (!kpiId) return;
    const version = $('#rc-add-version').value.trim();
    if (!version) { toast('Bitte eine Version eingeben'); return; }
    const vals = getCustomValues();
    const rcVal = vals[kpiId];
    if (!rcVal || !rcVal.testSituations) return;
    if (rcVal.versionData[version] && !rcEditVersion) { toast(`Release „${version}" existiert bereits`); return; }
    const inputs = $('#rc-add-values-list').querySelectorAll('.rc-add-value-input');
    const newValues = [];
    for (const input of inputs) {
      const raw = input.value.trim();
      const num = raw !== '' ? parseFloat(raw) : 0;
      newValues.push(isNaN(num) ? 0 : num);
    }
    rcVal.versionData[version] = newValues;
    setCustomValue(kpiId, rcVal);
    closeRcAddModal();
    render();
    toast(`Release „${version}" ${rcEditVersion ? 'aktualisiert' : 'mit ' + newValues.length + ' Messwerten hinzugefügt'}`);
  }

  function setupRcFormEvents() {
    valuesForm.querySelectorAll('.values-rc-select').forEach(select => {
      select.addEventListener('change', () => {
        const field = select.closest('.values-rc-field');
        if (!field) return;
        const kpiId = field.dataset.kpiId;
        const vals = getCustomValues();
        const rcVal = vals[kpiId];
        if (!rcVal || !rcVal.versionData) return;
        const key = select.dataset.rcKey;
        rcVal[key] = select.value;
        setCustomValue(kpiId, rcVal);
        render();
        const kpi = kpiMap[kpiId];
        if (kpi) toast(`„${kpi.name}" — ${key === 'currentVersion' ? 'Aktuelle Version' : 'Vorherige Version'} auf ${select.value} geändert`);
      });
    });

    valuesForm.querySelectorAll('.btn-rc-add-release').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openRcAddModal(btn.dataset.kpiId);
      });
    });

    valuesForm.querySelectorAll('.btn-rc-edit-release').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openRcAddModal(btn.dataset.kpiId, btn.dataset.version);
      });
    });
  }

  /* ===== AC Form Helpers ===== */
  function renderAcValuesField(kpi, acValue) {
    const acKeys = Object.keys(acValue.acs);
    const total = acKeys.length;
    const covered = acKeys.filter(k => acValue.acs[k].passed).length;
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    const dots = { true: 'green', false: 'red' };

    let itemsHtml = '';
    for (const acId of acKeys) {
      const ac = acValue.acs[acId];
      itemsHtml += `
        <div class="values-ac-item" data-ac="${acId}">
          <label class="values-ac-toggle" title="Bestanden/Nicht bestanden">
            <input type="checkbox" class="values-ac-checkbox" ${ac.passed ? 'checked' : ''}>
          </label>
          <span class="values-ac-id">${acId}</span>
          <input type="text" class="values-ac-text" value="${(ac.text || '').replace(/"/g, '&quot;')}" placeholder="AC-Text eingeben...">
          <button class="values-ac-remove" title="AC entfernen">×</button>
        </div>`;
    }

    return `
      <div class="values-ac-field" data-kpi-id="${kpi.id}">
        <div class="values-ac-field-header">
          <div class="values-field-label">
            <div class="values-field-name">${kpi.name}</div>
            <div class="values-field-unit">${kpi.unit || '—'} · ${kpi.category === 'dev' ? 'Dev' : 'Ops'}</div>
          </div>
          <span class="values-ac-summary" style="font-size:0.85rem;font-weight:600;color:var(--text)">${covered}/${total} ACs · ${pct}%</span>
        </div>
        <div class="values-ac-items">${itemsHtml}</div>
        <button class="btn btn-sm btn-secondary values-ac-add" style="align-self:flex-start;margin-top:0.5rem">+ AC hinzufügen</button>
      </div>`;
  }

  function setupAcFormEvents() {
    valuesForm.querySelectorAll('.values-ac-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const field = cb.closest('.values-ac-field');
        if (field) commitAcValues(field);
      });
    });

    valuesForm.querySelectorAll('.values-ac-text').forEach(input => {
      input.addEventListener('change', () => {
        const field = input.closest('.values-ac-field');
        if (field) commitAcValues(field);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });
    });

    valuesForm.querySelectorAll('.values-ac-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.values-ac-item');
        const field = btn.closest('.values-ac-field');
        if (!item || !field) return;
        const kpiId = field.dataset.kpiId;
        const acId = item.dataset.ac;
        const vals = getCustomValues();
        const acValue = vals[kpiId];
        if (acValue && acValue.acs) {
          delete acValue.acs[acId];
          setCustomValue(kpiId, acValue);
          render();
          toast(`„${kpiMap[kpiId]?.name}" — ${acId} entfernt`);
        }
      });
    });

    valuesForm.querySelectorAll('.values-ac-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.closest('.values-ac-field');
        if (!field) return;
        const kpiId = field.dataset.kpiId;
        const vals = getCustomValues();
        const acValue = vals[kpiId];
        if (!acValue || !acValue.acs) return;
        const existingNums = Object.keys(acValue.acs).map(k => parseInt(k.replace('AC', '')) || 0);
        const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
        const newId = 'AC' + nextNum;
        acValue.acs[newId] = { text: '', passed: false };
        setCustomValue(kpiId, acValue);
        render();
        toast(`„${kpiMap[kpiId]?.name}" — ${newId} hinzugefügt`);
      });
    });
  }

  function commitAcValues(field) {
    const kpiId = field.dataset.kpiId;
    const vals = getCustomValues();
    const acValue = vals[kpiId];
    if (!acValue || !acValue.acs) return;
    for (const item of field.querySelectorAll('.values-ac-item')) {
      const acId = item.dataset.ac;
      const cb = item.querySelector('.values-ac-checkbox');
      const textInput = item.querySelector('.values-ac-text');
      if (!acValue.acs[acId]) continue;
      acValue.acs[acId].passed = cb.checked;
      acValue.acs[acId].text = textInput ? textInput.value : '';
    }
    setCustomValue(kpiId, acValue);
    const keys = Object.keys(acValue.acs);
    const total = keys.length;
    const covered = keys.filter(k => acValue.acs[k].passed).length;
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    render();
    const kpi = kpiMap[kpiId];
    if (kpi) toast(`„${kpi.name}" → ${covered}/${total} · ${pct}%`);
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
    const date = new Date().toISOString().slice(0, 10);
    a.download = `kpi-values_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('KPI-Werte als JSON heruntergeladen');
  }

  function formatExportValue(v) {
    if (Number.isInteger(v)) return v.toString();
    return v.toFixed(1);
  }

  /* ===== Export ===== */
  function exportConfig() {
    const customValues = getCustomValues();
    const data = JSON.stringify({
      _exportVersion: 1,
      exportedAt: new Date().toISOString(),
      theme: document.documentElement.getAttribute('data-theme') || 'dark',
      currentDashboardId,
      dashboards,
      kpis,
      customValues,
      campaigns,
      rfcEntries,
      rfcTestsCampaignId: getRfcTestsCampaignId()
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `qa-dashboard-export_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Vollständiger Export inkl. Kampagnen & RFC erstellt');
  }

  function importConfig(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || data._exportVersion !== 1) {
          toast('Ungültige Export-Datei (falsche Version)');
          return;
        }
        if (data.theme) {
          document.documentElement.setAttribute('data-theme', data.theme);
          localStorage.setItem(THEME_KEY, data.theme);
          updateThemeBtn(data.theme);
        }
        if (data.dashboards) dashboards = data.dashboards;
        if (data.kpis) {
          kpis = data.kpis;
          kpiMap = {};
          for (const k of kpis) kpiMap[k.id] = k;
        }
        if (data.currentDashboardId) currentDashboardId = data.currentDashboardId;
        if (data.customValues) {
          localStorage.setItem(VALUES_KEY, JSON.stringify(data.customValues));
        }
        if (data.campaigns) {
          campaigns = data.campaigns;
          saveCampaigns();
        }
        if (data.rfcEntries) {
          rfcEntries = data.rfcEntries;
          saveRfcEntries();
        }
        if (data.rfcTestsCampaignId) {
          setRfcTestsCampaignId(data.rfcTestsCampaignId);
        }
        saveState();
        render();
        toast('Import erfolgreich – Dashboard vollständig wiederhergestellt');
      } catch {
        toast('Fehler beim Import: ungültige Datei');
      }
    };
    reader.readAsText(file);
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

    /* Theme toggle */
    $('#btn-theme').addEventListener('click', toggleTheme);

    /* Export / Import */
    $('#btn-export').addEventListener('click', exportConfig);
    $('#btn-import').addEventListener('click', () => $('#btn-import-file').click());
    $('#btn-import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importConfig(file);
      e.target.value = '';
    });

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
    document.addEventListener('tile:ac-detail', (e) => {
      const { kpiName, acId, acText } = e.detail;
      showAcDetail(kpiName, acId, acText);
    });
    document.addEventListener('app:toast', (e) => toast(e.detail.message));
    document.addEventListener('tile:value-change', (e) => {
      const { kpiId, value } = e.detail;
      if (isComputedKpi(kpiId)) return;
      if (kpiId === 'rfc-tests') {
        const campaignId = getRfcTestsCampaignId();
        const campaign = campaigns.find(c => c.id === campaignId);
        if (campaign && campaign.values[2]) {
          campaign.values[2].planned = value;
        } else if (campaigns.length > 0) {
          campaigns[0].values[2] = { ...campaigns[0].values[2], planned: value };
          setRfcTestsCampaignId(campaigns[0].id);
        }
        saveCampaigns();
        render();
        toast(`„RFC Tests" → ${formatExportValue(value)} Tests`);
        return;
      }
      const existing = getCustomValues()[kpiId];
      const isAc = existing && typeof existing === 'object' && existing.acs;
      const isRc = existing && typeof existing === 'object' && existing.versionData && !existing.xAxisOrder;
      const isTe = existing && typeof existing === 'object' && existing.xAxisOrder;
      if (!isAc && !isRc && !isTe) setCustomValue(kpiId, value);
      const kpi = kpiMap[kpiId];
      render();
      if (kpi && !isAc && !isRc && !isTe) toast(`„${kpi.name}" → ${formatExportValue(value)}${kpi.unit ? ' ' + kpi.unit : ''}`);
    });

    /* RFC campaign version change (from tile version selector) */
    document.addEventListener('tile:rfc-campaign-change', (e) => {
      const { campaignId } = e.detail;
      setRfcTestsCampaignId(campaignId);
      render();
    });

    /* Chart modal */
    document.addEventListener('tile:chart-modal', (e) => {
      const { kpiId, kpi, data } = e.detail;
      if (!data) return;
      const isTe = data.xAxisOrder && data.versionData;
      $('#chart-modal-title').textContent = isTe
        ? `${kpi.name} — Evolution über Releases`
        : `${kpi.name} — Frontend Response Times im Vergleich`;
      $('#chart-modal').classList.remove('hidden');
      requestAnimationFrame(() => {
        const canvas = $('#chart-modal-canvas');
        if (isTe) {
          ChartEngine.drawTimeEvolution(canvas, data, false);
        } else {
          ChartEngine.drawResponseComparison(canvas, data);
        }
      });
    });
    $('#btn-close-chart').addEventListener('click', () => $('#chart-modal').classList.add('hidden'));
    $('#chart-modal .modal-backdrop').addEventListener('click', () => $('#chart-modal').classList.add('hidden'));

    /* Chart modal download */
    $('#btn-chart-download').addEventListener('click', () => {
      const canvas = $('#chart-modal-canvas');
      if (!canvas) return;
      const link = document.createElement('a');
      const title = $('#chart-modal-title').textContent.replace(/[^a-zA-Z0-9]/g, '_');
      const date = new Date().toISOString().slice(0, 10);
      link.download = `${title}_${date}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('Diagramm als PNG gespeichert');
    });

    /* Campaign chart modal */
    $('#btn-close-campaign-chart').addEventListener('click', () => $('#campaign-chart-modal').classList.add('hidden'));
    $('#campaign-chart-modal .modal-backdrop').addEventListener('click', () => $('#campaign-chart-modal').classList.add('hidden'));

    $('#btn-campaign-chart-download').addEventListener('click', () => {
      const canvas = $('#campaign-chart-canvas');
      if (!canvas) return;
      const link = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      link.download = `Testkampagnen_Uebersicht_${date}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast('Kampagnen-Übersicht als PNG gespeichert');
    });

    /* RC Add Release modal */
    $('#btn-close-rc-add').addEventListener('click', closeRcAddModal);
    $('#btn-rc-add-cancel').addEventListener('click', closeRcAddModal);
    $('#rc-add-modal .modal-backdrop').addEventListener('click', closeRcAddModal);
    $('#btn-rc-add-save').addEventListener('click', saveRcAddRelease);

    /* Keyboard */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCatalog();
        closeCampaignEdit();
        $('#campaign-modal').classList.add('hidden');
        $('#campaign-archive-modal').classList.add('hidden');
        $('#chart-modal').classList.add('hidden');
        $('#campaign-chart-modal').classList.add('hidden');
        $('#rc-add-modal').classList.add('hidden');
        document.querySelectorAll('.info-panel-overlay').forEach(el => el.remove());
      }
    });
  }

  /* ===== Campaign (Testkampagne) Engine ===== */
  const CAMPAIGNS_KEY = 'qa_dashboard_campaigns';
  let campaigns = [];

  function loadCampaigns() {
    try {
      const saved = localStorage.getItem(CAMPAIGNS_KEY);
      campaigns = saved ? JSON.parse(saved) : [];
      let changed = false;
      for (const c of campaigns) {
        /* Migrate old numeric values [{planned, executed}] */
        if (c.values.length > 0 && typeof c.values[0] === 'number') {
          c.values = c.values.map(v => ({ planned: 100, executed: Math.round(v) }));
          changed = true;
        }
        while (c.values.length < 4) {
          c.values.push({ planned: 0, passed: 0, failed: 0, blocked: 0 });
          changed = true;
        }
        for (let i = 0; i < c.values.length; i++) {
          if (typeof c.values[i] === 'number') {
            c.values[i] = { planned: 100, executed: Math.round(c.values[i]) };
            changed = true;
          }
          /* Migrate {planned, executed} → {planned, passed, failed, blocked} */
          if (c.values[i] && 'executed' in c.values[i] && !('passed' in c.values[i])) {
            const e = c.values[i].executed || 0;
            c.values[i] = { planned: c.values[i].planned || 0, passed: e, failed: 0, blocked: 0 };
            changed = true;
          }
          /* Ensure all new fields exist */
          const vi = c.values[i];
          if (vi.passed === undefined) { vi.passed = 0; changed = true; }
          if (vi.failed === undefined) { vi.failed = 0; changed = true; }
          if (vi.blocked === undefined) { vi.blocked = 0; changed = true; }
        }
        if (!c.colors) {
          c.colors = ['green', 'green', 'green', 'green', 'green'];
          changed = true;
        }
        if (c.archived === undefined) {
          c.archived = false;
          changed = true;
        }
      }
      if (changed) saveCampaigns();
    } catch { campaigns = []; }
  }

  function saveCampaigns() {
    try {
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
    } catch {}
  }

  function renderCampaigns() {
    const list = $('#campaign-list');
    const active = campaigns.filter(c => !c.archived);
    const archivedCount = campaigns.filter(c => c.archived).length;
    list.innerHTML = active.map(c => {
      const totalPlanned = c.values.reduce((s, v) => s + (v.planned || 0), 0);
      const totalPassed = c.values.reduce((s, v) => s + (v.passed || 0), 0);
      const totalFailed = c.values.reduce((s, v) => s + (v.failed || 0), 0);
      const totalBlocked = c.values.reduce((s, v) => s + (v.blocked || 0), 0);
      const totalExecuted = totalPassed + totalFailed + totalBlocked;
      const avg = totalPlanned > 0 ? Math.round((totalExecuted / totalPlanned) * 100) : 0;
      const miniLabels = ['Manual', 'Automation', 'RFC', 'Mobile'];
      const colors = c.colors || ['green', 'green', 'green', 'green', 'green'];
      const colorIcon = (clr) => {
        const hex = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }[clr] || '#6b7280';
        return `<span class="campaign-color-dot" style="background:${hex}"></span>`;
      };
      const opCls = (c.operational || 'passed') === 'passed' ? 'passed' : 'failed';
      const coCls = (c.completed || 'passed') === 'passed' ? 'passed' : 'failed';
      return `
        <div class="campaign-tile" data-campaign-id="${c.id}" draggable="true">
          <div class="campaign-tile-header">
            <span>Testkampagne ${c.version}</span>
            <div style="display:flex;gap:0.1rem;align-items:center">
              <button class="campaign-btn-chart" title="Diagramm anzeigen" data-campaign-id="${c.id}">📊</button>
              <button class="campaign-btn-archive" title="Archivieren" data-campaign-id="${c.id}">📦</button>
              <button class="campaign-btn-remove" title="Entfernen" data-campaign-id="${c.id}">✕</button>
            </div>
          </div>
          <div class="campaign-main-row">
            <div class="campaign-indicator-badge">
              <span class="campaign-indicator-badge__label">Wirkbetriebs-<br>tauglich</span>
              <span class="campaign-indicator-badge__box campaign-indicator-badge__box--${opCls}" data-campaign-id="${c.id}" data-indicator="operational">${(c.operational || 'passed') === 'passed' ? 'PASSED' : 'FAILED'}</span>
            </div>
            <div class="campaign-main-wrap" data-campaign-id="${c.id}" data-color-index="0" title="Klicken zum Farbe wechseln">
              <canvas class="campaign-main-donut" data-campaign-id="${c.id}"></canvas>
            </div>
            <div class="campaign-indicator-badge">
              <span class="campaign-indicator-badge__label">Abgeschlossen</span>
              <span class="campaign-indicator-badge__box campaign-indicator-badge__box--${coCls}" data-campaign-id="${c.id}" data-indicator="completed">${(c.completed || 'passed') === 'passed' ? 'PASSED' : 'FAILED'}</span>
            </div>
          </div>
          <div class="campaign-mini-row">
            ${c.values.map((v, i) => {
              const exec = (v.passed || 0) + (v.failed || 0) + (v.blocked || 0);
              const pct = v.planned > 0 ? Math.round((exec / v.planned) * 100) : 0;
              return `
                <div class="campaign-mini-donut-wrap" data-campaign-id="${c.id}" data-index="${i}">
                  <canvas class="campaign-mini-canvas" data-campaign-id="${c.id}" data-index="${i}"></canvas>
                  <span class="campaign-mini-label" data-color-index="${i + 1}" title="Klicken zum Farbe wechseln">${colorIcon(colors[i + 1])}${miniLabels[i] || ''}</span>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');

    if (archivedCount > 0) {
      const link = document.createElement('div');
      link.className = 'sidebar-archive-link';
      link.innerHTML = `<button class="btn-archive-link">📦 Archiv (${archivedCount})</button>`;
      list.appendChild(link);
      link.querySelector('.btn-archive-link').addEventListener('click', () => openCampaignArchive());
    }

    requestAnimationFrame(drawCampaignDonuts);
  }

  function drawCampaignDonuts() {
    for (const c of campaigns) {
      const colors = c.colors || ['green', 'green', 'green', 'green', 'green'];
      const mainCanvas = document.querySelector(`.campaign-main-donut[data-campaign-id="${c.id}"]`);
      if (mainCanvas) {
        const vals = c.values;
        const totalPassed = vals.reduce((s, v) => s + (v.passed || 0), 0);
        const totalFailed = vals.reduce((s, v) => s + (v.failed || 0), 0);
        const totalBlocked = vals.reduce((s, v) => s + (v.blocked || 0), 0);
        const totalPlanned = vals.reduce((s, v) => s + (v.planned || 0), 0);
        ChartEngine.drawSegmentedDonut(mainCanvas, totalPassed, totalFailed, totalBlocked, totalPlanned);
      }
      document.querySelectorAll(`.campaign-mini-canvas[data-campaign-id="${c.id}"]`).forEach(canvas => {
        const idx = parseInt(canvas.dataset.index);
        const v = c.values[idx] || {};
        ChartEngine.drawSegmentedDonut(canvas, v.passed || 0, v.failed || 0, v.blocked || 0, v.planned || 0);
      });
    }
  }

  function createCampaign(version) {
    const id = 'cmp_' + Date.now();
    const newCampaign = {
      id, version,
      values: [
        { planned: 0, passed: 0, failed: 0, blocked: 0 },
        { planned: 0, passed: 0, failed: 0, blocked: 0 },
        { planned: 0, passed: 0, failed: 0, blocked: 0 },
        { planned: 0, passed: 0, failed: 0, blocked: 0 }
      ],
      colors: ['green', 'green', 'green', 'green', 'green'],
      operational: 'passed',
      completed: 'passed'
    };
    campaigns.unshift(newCampaign);
    saveCampaigns();
    render();
  }

  function removeCampaign(id) {
    campaigns = campaigns.filter(c => c.id !== id);
    saveCampaigns();
    render();
    toast('Testkampagne entfernt');
  }

  function archiveCampaign(id) {
    const c = campaigns.find(c => c.id === id);
    if (!c) return;
    c.archived = true;
    saveCampaigns();
    render();
    toast(`Testkampagne „${c.version}" archiviert`);
  }

  function unarchiveCampaign(id) {
    const c = campaigns.find(c => c.id === id);
    if (!c) return;
    c.archived = false;
    saveCampaigns();
    render();
    toast(`Testkampagne „${c.version}" wiederhergestellt`);
  }

  function openCampaignChart(campaignId) {
    const vals = getCustomValues();
    const active = campaigns.filter(c => !c.archived);
    const camp = active.find(c => c.id === campaignId);
    if (!camp) { toast('Testkampagne nicht gefunden'); return; }
    const data = {
      version: camp.version,
      values: camp.values.map(v => ({
        planned: v.planned || 0,
        passed: v.passed || 0,
        failed: v.failed || 0,
        blocked: v.blocked || 0
      }))
    };
    const title = `Testbericht — ${camp.version}`;
    $('#campaign-chart-title').textContent = title;
    $('#campaign-chart-modal').classList.remove('hidden');
    requestAnimationFrame(() => {
      const canvas = $('#campaign-chart-canvas');
      ChartEngine.drawCampaignChart(canvas, data);
    });
  }

  function openCampaignArchive() {
    const list = $('#archive-list');
    const archived = campaigns.filter(c => c.archived);
    if (archived.length === 0) {
      list.innerHTML = '<div class="archive-empty">Keine archivierten Testkampagnen</div>';
    } else {
      list.innerHTML = archived.map(c => {
        const totalPlanned = c.values.reduce((s, v) => s + (v.planned || 0), 0);
        const totalPassed = c.values.reduce((s, v) => s + (v.passed || 0), 0);
        const totalFailed = c.values.reduce((s, v) => s + (v.failed || 0), 0);
        const totalBlocked = c.values.reduce((s, v) => s + (v.blocked || 0), 0);
        const totalExecuted = totalPassed + totalFailed + totalBlocked;
        const avg = totalPlanned > 0 ? Math.round((totalExecuted / totalPlanned) * 100) : 0;
        const colors = c.colors || ['green', 'green', 'green', 'green', 'green'];
        const colorIcon = (clr) => {
          const hex = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }[clr] || '#6b7280';
          return `<span class="campaign-color-dot" style="background:${hex}"></span>`;
        };
        const miniLabels = ['Manual', 'Automation', 'RFC', 'Mobile'];
        return `
          <div class="archive-campaign-tile" data-campaign-id="${c.id}">
            <div class="archive-campaign-header">
              <span>Testkampagne ${c.version}</span>
              <button class="btn-campaign-restore" data-campaign-id="${c.id}">Wiederherstellen</button>
            </div>
            <div class="campaign-main-row">
              <div class="campaign-main-wrap" data-campaign-id="${c.id}">
                <canvas class="campaign-main-donut" data-campaign-id="${c.id}"></canvas>
              </div>
            </div>
            <div class="campaign-mini-row">
              ${c.values.map((v, i) => {
                const exec = (v.passed || 0) + (v.failed || 0) + (v.blocked || 0);
                const pct = v.planned > 0 ? Math.round((exec / v.planned) * 100) : 0;
                return `
                  <div class="campaign-mini-donut-wrap">
                    <canvas class="campaign-mini-canvas" data-campaign-id="${c.id}" data-index="${i}"></canvas>
                    <span class="campaign-mini-label">${colorIcon(colors[i + 1])}${miniLabels[i] || ''}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>`;
      }).join('');
    }
    $('#campaign-archive-modal').classList.remove('hidden');
    requestAnimationFrame(drawCampaignDonuts);
  }

  /* ===== Campaign Edit Modal ===== */
  let campaignEditCampaignId = null;
  let campaignEditIndex = -1;

  function openCampaignEdit(campaignId, index) {
    campaignEditCampaignId = campaignId;
    campaignEditIndex = index;
    const c = campaigns.find(c => c.id === campaignId);
    if (!c) return;
    const v = c.values[index] || {};
    const miniLabels = ['Manual', 'Automation', 'RFC', 'Mobile'];
    $('#campaign-edit-title').textContent = `${miniLabels[index] || 'Test'} — ${c.version}`;
    $('#campaign-edit-planned').value = v.planned || 0;
    $('#campaign-edit-passed').value = v.passed || 0;
    $('#campaign-edit-failed').value = v.failed || 0;
    $('#campaign-edit-blocked').value = v.blocked || 0;
    updateCampaignEditPreview();
    $('#campaign-edit-modal').classList.remove('hidden');
    setTimeout(() => $('#campaign-edit-planned').focus(), 50);
  }

  function closeCampaignEdit() {
    $('#campaign-edit-modal').classList.add('hidden');
    campaignEditCampaignId = null;
    campaignEditIndex = -1;
  }

  function updateCampaignEditPreview() {
    const planned = parseInt($('#campaign-edit-planned').value) || 0;
    const passed = parseInt($('#campaign-edit-passed').value) || 0;
    const failed = parseInt($('#campaign-edit-failed').value) || 0;
    const blocked = parseInt($('#campaign-edit-blocked').value) || 0;
    const executed = passed + failed + blocked;
    const pct = planned > 0 ? Math.round((executed / planned) * 100) : 0;
    $('#campaign-edit-preview').textContent = planned > 0
      ? `${passed} ✔ + ${failed} ✖ + ${blocked} ⊘ = ${executed} / ${planned} = ${pct}%`
      : 'Bitte geplante Testfälle eingeben';
  }

  function saveCampaignEdit() {
    const cId = campaignEditCampaignId;
    const idx = campaignEditIndex;
    if (!cId || idx < 0) return;
    const c = campaigns.find(c => c.id === cId);
    if (!c) return;
    const planned = parseInt($('#campaign-edit-planned').value) || 0;
    const passed = parseInt($('#campaign-edit-passed').value) || 0;
    const failed = parseInt($('#campaign-edit-failed').value) || 0;
    const blocked = parseInt($('#campaign-edit-blocked').value) || 0;
    if (planned < 0 || passed < 0 || failed < 0 || blocked < 0) {
      toast('Werte dürfen nicht negativ sein');
      return;
    }
    c.values[idx] = { planned, passed, failed, blocked };
    closeCampaignEdit();
    saveCampaigns();
    render();
    toast('Werte gespeichert');
  }

  function setupCampaignEvents() {
    const modal = $('#campaign-modal');
    const versionInput = $('#campaign-version');
    const backdrop = modal.querySelector('.modal-backdrop');

    /* delete campaign */
    $('#campaign-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.campaign-btn-remove');
      if (!btn) return;
      e.stopPropagation();
      removeCampaign(btn.dataset.campaignId);
    });

    /* archive campaign */
    $('#campaign-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.campaign-btn-archive');
      if (!btn) return;
      e.stopPropagation();
      archiveCampaign(btn.dataset.campaignId);
    });

    /* campaign chart modal */
    $('#campaign-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.campaign-btn-chart');
      if (!btn) return;
      e.stopPropagation();
      openCampaignChart(btn.dataset.campaignId);
    });

    $('#btn-add-campaign').addEventListener('click', () => {
      versionInput.value = '';
      modal.classList.remove('hidden');
      setTimeout(() => versionInput.focus(), 50);
    });

    $('#btn-close-campaign').addEventListener('click', () => modal.classList.add('hidden'));
    backdrop.addEventListener('click', () => modal.classList.add('hidden'));

    $('#btn-create-campaign').addEventListener('click', () => {
      const version = versionInput.value.trim();
      if (!version) {
        toast('Bitte eine Version eingeben');
        return;
      }
      createCampaign(version);
      modal.classList.add('hidden');
      toast(`Testkampagne ${version} erstellt`);
    });

    versionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#btn-create-campaign').click();
    });

    /* Campaign edit modal events */
    $('#btn-close-campaign-edit').addEventListener('click', closeCampaignEdit);
    $('#btn-campaign-edit-cancel').addEventListener('click', closeCampaignEdit);
    $('#campaign-edit-modal .modal-backdrop').addEventListener('click', closeCampaignEdit);
    $('#btn-campaign-edit-save').addEventListener('click', saveCampaignEdit);

    $('#campaign-edit-planned').addEventListener('input', updateCampaignEditPreview);
    $('#campaign-edit-passed').addEventListener('input', updateCampaignEditPreview);
    $('#campaign-edit-failed').addEventListener('input', updateCampaignEditPreview);
    $('#campaign-edit-blocked').addEventListener('input', updateCampaignEditPreview);

    $('#campaign-edit-planned').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#campaign-edit-passed').focus();
    });
    $('#campaign-edit-passed').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#campaign-edit-failed').focus();
    });
    $('#campaign-edit-failed').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('#campaign-edit-blocked').focus();
    });
    $('#campaign-edit-blocked').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveCampaignEdit();
    });

    /* Mini donut value editing — opens edit modal */
    $('#campaign-list').addEventListener('click', (e) => {
      const wrap = e.target.closest('.campaign-mini-donut-wrap');
      if (!wrap) return;
      if (e.target.closest('.campaign-mini-label')) return;
      const campaignId = wrap.dataset.campaignId;
      const idx = parseInt(wrap.dataset.index);
      const c = campaigns.find(c => c.id === campaignId);
      if (!c) return;
      openCampaignEdit(campaignId, idx);
    });

    /* Color cycling: mini label clicks */
    $('#campaign-list').addEventListener('click', (e) => {
      const label = e.target.closest('.campaign-mini-label');
      if (!label) return;
      const wrap = label.closest('.campaign-mini-donut-wrap');
      if (!wrap) return;
      const campaignId = wrap.dataset.campaignId;
      const colorIdx = parseInt(label.dataset.colorIndex);
      const c = campaigns.find(c => c.id === campaignId);
      if (!c) return;
      const cycle = { green: 'yellow', yellow: 'red', red: 'green' };
      c.colors = c.colors || ['green', 'green', 'green', 'green', 'green'];
      c.colors[colorIdx] = cycle[c.colors[colorIdx]] || 'green';
      saveCampaigns();
      renderCampaigns();
    });

    /* Color cycling: main donut wrap clicks */
    $('#campaign-list').addEventListener('click', (e) => {
      const mainWrap = e.target.closest('.campaign-main-wrap');
      if (!mainWrap) return;
      const campaignId = mainWrap.dataset.campaignId;
      const c = campaigns.find(c => c.id === campaignId);
      if (!c) return;
      const cycle = { green: 'yellow', yellow: 'red', red: 'green' };
      c.colors = c.colors || ['green', 'green', 'green', 'green', 'green'];
      c.colors[0] = cycle[c.colors[0]] || 'green';
      saveCampaigns();
      renderCampaigns();
    });

    /* Indicator badge click — toggle passed/failed */
    $('#campaign-list').addEventListener('click', (e) => {
      const box = e.target.closest('.campaign-indicator-badge__box');
      if (!box) return;
      e.stopPropagation();
      const campaignId = box.dataset.campaignId;
      const indicator = box.dataset.indicator;
      const c = campaigns.find(c => c.id === campaignId);
      if (!c) return;
      if (indicator === 'operational') {
        c.operational = (c.operational || 'passed') === 'passed' ? 'failed' : 'passed';
      } else {
        c.completed = (c.completed || 'passed') === 'passed' ? 'failed' : 'passed';
      }
      saveCampaigns();
      renderCampaigns();
    });

    /* Archive modal */
    $('#btn-close-archive').addEventListener('click', () => {
      $('#campaign-archive-modal').classList.add('hidden');
    });
    $('#campaign-archive-modal .modal-backdrop').addEventListener('click', () => {
      $('#campaign-archive-modal').classList.add('hidden');
    });

    /* Restore from archive */
    $('#archive-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-campaign-restore');
      if (!btn) return;
      unarchiveCampaign(btn.dataset.campaignId);
      $('#campaign-archive-modal').classList.add('hidden');
    });

    /* Drag & drop reordering for campaigns */
    let dragCampaignId = null;

    $('#campaign-list').addEventListener('dragstart', (e) => {
      const tile = e.target.closest('.campaign-tile');
      if (!tile) return;
      dragCampaignId = tile.dataset.campaignId;
      tile.classList.add('drag-src');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragCampaignId);
    });

    $('#campaign-list').addEventListener('dragend', (e) => {
      const tile = e.target.closest('.campaign-tile');
      if (tile) tile.classList.remove('drag-src');
      $('#campaign-list').querySelectorAll('.campaign-tile.drag-over').forEach(el => el.classList.remove('drag-over'));
      dragCampaignId = null;
    });

    $('#campaign-list').addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const tile = e.target.closest('.campaign-tile');
      if (tile && tile.dataset.campaignId !== dragCampaignId) {
        tile.classList.add('drag-over');
      }
    });

    $('#campaign-list').addEventListener('dragleave', (e) => {
      const tile = e.target.closest('.campaign-tile');
      if (tile) tile.classList.remove('drag-over');
    });

    $('#campaign-list').addEventListener('drop', (e) => {
      e.preventDefault();
      $('#campaign-list').querySelectorAll('.campaign-tile.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (!dragCampaignId) return;
      const targetTile = e.target.closest('.campaign-tile');
      if (!targetTile) return;
      const targetId = targetTile.dataset.campaignId;
      if (dragCampaignId === targetId) return;

      const srcIdx = campaigns.findIndex(c => c.id === dragCampaignId);
      const tgtIdx = campaigns.findIndex(c => c.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1) return;

      const [moved] = campaigns.splice(srcIdx, 1);
      const newTgtIdx = campaigns.findIndex(c => c.id === targetId);
      campaigns.splice(newTgtIdx, 0, moved);
      saveCampaigns();
      render();
    });
  }

  /* ===== RFC (Testabdeckung RFC) Engine ===== */
  const RFC_KEY = 'qa_dashboard_rfc_entries';
  let rfcEntries = [];

  function loadRfcEntries() {
    try {
      const saved = localStorage.getItem(RFC_KEY);
      rfcEntries = saved ? JSON.parse(saved) : [];
      /* migrate old single-entry format from values system */
      if (rfcEntries.length === 0) {
        const old = getCustomValues()['test-coverage-rfc'];
        if (old && old.acs && typeof old.acs === 'object') {
          const acs = {};
          for (const [k, v] of Object.entries(old.acs)) {
            acs[k] = { text: v.text || k, passed: !!v.passed };
          }
          rfcEntries.push({ id: 'rfc_' + Date.now(), name: 'RFC (migriert)', acs });
          saveRfcEntries();
        }
      }
    } catch { rfcEntries = []; }
  }

  function saveRfcEntries() {
    try {
      localStorage.setItem(RFC_KEY, JSON.stringify(rfcEntries));
    } catch {}
  }

  function renderRfcSidebar() {
    const list = $('#rfc-list');
    if (!rfcEntries || rfcEntries.length === 0) {
      list.innerHTML = '<div class="empty-state-text" style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.85rem">Keine RFC-Daten vorhanden</div>';
      return;
    }

    list.innerHTML = rfcEntries.map((entry, idx) => {
      const acEntries = Object.entries(entry.acs);
      const total = acEntries.length;
      const covered = acEntries.filter(([, ac]) => ac.passed).length;
      const pct = total > 0 ? Math.round((covered / total) * 100) : 0;

      let acGridHtml = '';
      for (const [acId, ac] of acEntries) {
        const st = ac.passed ? 'passed' : 'failed';
        acGridHtml += `<div class="rfc-ac-item ${st}" data-entry-id="${entry.id}" data-ac-id="${acId}">${acId}</div>`;
      }

      return `
        <div class="rfc-tile">
          <div class="rfc-tile-header">
            <span>${entry.name}</span>
            <div style="display:flex;gap:0.2rem;align-items:center">
              <button class="rfc-btn-print" title="Als Bild speichern" data-entry-id="${entry.id}">🖼️</button>
              <button class="rfc-btn-remove" title="Entfernen" data-entry-id="${entry.id}">✕</button>
            </div>
          </div>
          <div class="rfc-main-donut-wrap">
            <canvas class="rfc-main-donut" data-entry-id="${entry.id}"></canvas>
            <span class="rfc-coverage-label">${pct}% abgedeckt</span>
          </div>
          <div class="rfc-ac-grid">
            ${acGridHtml}
          </div>
          <button class="rfc-detail-btn" data-entry-id="${entry.id}">Details</button>
        </div>`;
    }).join('');

    requestAnimationFrame(drawRfcDonuts);
  }

  function drawRfcDonuts() {
    for (const entry of rfcEntries) {
      const canvas = document.querySelector(`.rfc-main-donut[data-entry-id="${entry.id}"]`);
      if (!canvas) continue;
      const acEntries = Object.entries(entry.acs);
      const total = acEntries.length;
      const covered = acEntries.filter(([, ac]) => ac.passed).length;
      const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
      const status = pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red';
      ChartEngine.drawDonut(canvas, pct, '%', status);
    }
  }

  function toggleRfcAc(entryId, acId) {
    const entry = rfcEntries.find(e => e.id === entryId);
    if (!entry || !entry.acs[acId]) return;
    entry.acs[acId].passed = !entry.acs[acId].passed;
    const merged = getCustomValues();
    /* sync first entry to the KPI value for consistency */
    if (rfcEntries.length > 0) {
      merged['test-coverage-rfc'] = { entries: rfcEntries };
    }
    setCustomValue('test-coverage-rfc', merged['test-coverage-rfc']);
    saveRfcEntries();
    renderRfcSidebar();
  }

  function createRfcEntry(name) {
    const id = 'rfc_' + Date.now();
    const acCount = parseInt(document.getElementById('rfc-add-ac-count').value) || 3;
    const acInputs = document.querySelectorAll('.rfc-add-ac-row input');
    const acs = {};
    for (let i = 0; i < acCount; i++) {
      const acId = 'AC' + (i + 1);
      const text = acInputs[i] ? acInputs[i].value.trim() : 'AC ' + (i + 1);
      acs[acId] = { text: text || 'AC ' + (i + 1), passed: true };
    }
    const newEntry = { id, name, acs };
    rfcEntries.unshift(newEntry);
    saveRfcEntries();
    renderRfcSidebar();
  }

  function renderRfcAddAcFields() {
    const count = parseInt(document.getElementById('rfc-add-ac-count').value) || 3;
    const list = document.getElementById('rfc-add-ac-list');
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="rfc-add-ac-row">
          <span class="rfc-add-ac-label">AC${i + 1}</span>
          <input type="text" placeholder="Beschreibung für AC${i + 1}" value="">
        </div>`;
    }
    list.innerHTML = html;
  }

  function removeRfcEntry(id) {
    rfcEntries = rfcEntries.filter(e => e.id !== id);
    saveRfcEntries();
    renderRfcSidebar();
    toast('RFC entfernt');
  }

  function setupRfcEvents() {
    /* delete RFC */
    $('#rfc-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.rfc-btn-remove');
      if (!btn) return;
      e.stopPropagation();
      removeRfcEntry(btn.dataset.entryId);
    });

    /* print RFC tile */
    $('#rfc-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.rfc-btn-print');
      if (!btn) return;
      e.stopPropagation();
      const tile = btn.closest('.rfc-tile');
      if (!tile || typeof html2canvas === 'undefined') return;
      const name = rfcEntries.find(e => e.id === btn.dataset.entryId)?.name || 'RFC';
      html2canvas(tile, {
        scale: 2, useCORS: true, logging: false, backgroundColor: null,
        onclone: doc => {
          const root = doc.documentElement;
          const src = document.documentElement;
          for (const p of ['--bg','--surface','--surface-hover','--border','--text','--text-muted','--primary','--primary-hover','--green','--green-bg','--yellow','--yellow-bg','--red','--red-bg','--neutral','--neutral-bg','--radius','--shadow','--transition']) {
            const v = getComputedStyle(src).getPropertyValue(p).trim();
            if (v) root.style.setProperty(p, v);
          }
        }
      })
        .then(canvas => {
          const link = document.createElement('a');
          link.download = `${name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          toast(`„${name}" als Bild gespeichert`);
        })
        .catch(() => toast('Fehler beim Erstellen des Bildes'));
    });

    /* + button → open add modal */
    $('#btn-add-rfc').addEventListener('click', () => {
      document.getElementById('rfc-add-name').value = '';
      document.getElementById('rfc-add-ac-count').value = '5';
      renderRfcAddAcFields();
      document.getElementById('rfc-add-modal').classList.remove('hidden');
      setTimeout(() => document.getElementById('rfc-add-name').focus(), 50);
    });

    /* close add modal */
    const closeAdd = () => document.getElementById('rfc-add-modal').classList.add('hidden');
    $('#btn-close-rfc-add').addEventListener('click', closeAdd);
    $('#btn-rfc-add-cancel').addEventListener('click', closeAdd);
    document.querySelector('#rfc-add-modal .modal-backdrop').addEventListener('click', closeAdd);

    /* AC count change → re-render fields */
    document.getElementById('rfc-add-ac-count').addEventListener('change', renderRfcAddAcFields);

    /* save new RFC */
    $('#btn-rfc-add-save').addEventListener('click', () => {
      const name = document.getElementById('rfc-add-name').value.trim();
      if (!name) {
        toast('Bitte einen RFC-Namen eingeben');
        return;
      }
      createRfcEntry(name);
      document.getElementById('rfc-add-modal').classList.add('hidden');
      toast(`RFC ${name} erstellt`);
    });

    /* AC toggle in sidebar */
    $('#rfc-list').addEventListener('click', (e) => {
      const item = e.target.closest('.rfc-ac-item');
      if (!item) return;
      toggleRfcAc(item.dataset.entryId, item.dataset.acId);
    });

    /* Detail button → open detail modal */
    $('#rfc-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.rfc-detail-btn');
      if (!btn) return;
      const entryId = btn.dataset.entryId;
      const entry = rfcEntries.find(e => e.id === entryId);
      if (!entry) return;
      document.getElementById('rfc-detail-title').textContent = 'Details: ' + entry.name;
      const body = document.getElementById('rfc-detail-body');
      body.innerHTML = Object.entries(entry.acs).map(([acId, ac]) => {
        const st = ac.passed ? 'green' : 'red';
        const statusText = ac.passed ? 'Bestanden' : 'Offen';
        return `
          <div class="rfc-detail-item" data-entry-id="${entry.id}" data-ac-id="${acId}">
            <span class="rfc-detail-dot ${st}"></span>
            <span class="rfc-detail-id">${acId}</span>
            <span class="rfc-detail-text">${ac.text || ''}</span>
            <span class="rfc-detail-status ${st}">${statusText}</span>
          </div>`;
      }).join('');
      document.getElementById('rfc-detail-modal').classList.remove('hidden');
    });

    /* toggle AC from detail modal — update in place, no close/reopen */
    document.getElementById('rfc-detail-body').addEventListener('click', (e) => {
      const item = e.target.closest('.rfc-detail-item');
      if (!item) return;
      const entryId = item.dataset.entryId;
      const acId = item.dataset.acId;
      toggleRfcAc(entryId, acId);
      /* update this item's appearance only */
      const entry = rfcEntries.find(e => e.id === entryId);
      if (!entry || !entry.acs[acId]) return;
      const ac = entry.acs[acId];
      const st = ac.passed ? 'green' : 'red';
      const statusText = ac.passed ? 'Bestanden' : 'Offen';
      item.querySelector('.rfc-detail-dot').className = 'rfc-detail-dot ' + st;
      item.querySelector('.rfc-detail-status').className = 'rfc-detail-status ' + st;
      item.querySelector('.rfc-detail-status').textContent = statusText;
    });

    /* close detail modal */
    const closeDetail = () => document.getElementById('rfc-detail-modal').classList.add('hidden');
    $('#btn-close-rfc-detail').addEventListener('click', closeDetail);
    document.querySelector('#rfc-detail-modal .modal-backdrop').addEventListener('click', closeDetail);
  }

  /* ===== Start ===== */
  document.addEventListener('DOMContentLoaded', () => {
    loadCampaigns();
    loadRfcEntries();
    init().then(() => {
      renderCampaigns();
      setupCampaignEvents();
      renderRfcSidebar();
      setupRfcEvents();
    });
  });
})(GridEngine);
