/* ===== QA Dashboard App ===== */
((Grid) => {
  'use strict';

  const DASHBOARDS_URL = 'data/dashboards.json';
  const KPIS_URL = 'data/kpis.json';
  const VALUES_URL = 'data/values.json';
  const EXPORT_URL = 'data/qa-dashboard-export.json';
  const STORAGE_KEY = 'qa_dashboard_state';
  const VALUES_KEY = 'qa_dashboard_values';
  const SERVER_BASE = window.location.origin;

  /* ===== Server-Synchronisation (Multi-User) ===== */
  async function loadFromServer() {
    try {
      const resp = await fetch(`${SERVER_BASE}/api/data`);
      if (!resp.ok) return;
      const all = await resp.json();
      for (const [key, data] of Object.entries(all)) {
        if (data && data.value !== null && data.value !== undefined) {
          try {
            const val = data.value;
            localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
          } catch {}
        }
      }
    } catch {}
  }

  function syncToServer(key, value) {
    setTimeout(async () => {
      try {
        await fetch(`${SERVER_BASE}/api/data/${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value })
        });
      } catch {}
    }, 0);
  }

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
    syncToServer(THEME_KEY, next);
    updateThemeBtn(next);
    render();
  }
  function updateThemeBtn(theme) {
    const btn = $('#btn-theme');
    if (!btn) return;
    const isDark = theme === 'dark';
    btn.innerHTML = isDark
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    btn.setAttribute('aria-label', isDark ? 'Helles Theme' : 'Dunkles Theme');
  }

  /* ===== Initialize ===== */
  async function init() {
    initTheme();
    await loadData();
    await loadFromServer();
    loadCampaigns();
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
        if (tile.kpi_id === 'rfc-tests' || tile.kpi_id === 'a-bugs-post-release') {
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
      syncToServer(STORAGE_KEY, state);
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
    const isVersionedTile = kpiId === 'rfc-tests' || kpiId === 'a-bugs-post-release';
    const hasChart = !isVersionedTile && kpi && ChartEngine.getChartType(kpi);
    const w = isVersionedTile ? 1 : (hasChart ? 2 : 1);
    const h = isVersionedTile ? 1 : (hasChart ? 2 : 1);
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
    const tile = db.tiles.find(t => t.id === tileId);
    if (!tile) return;
    const kpi = kpiMap[tile.kpi_id];
    const name = kpi ? kpi.name : tile.kpi_id;
    if (!confirm(`„${name}" vom Dashboard entfernen?`)) return;
    db.tiles = db.tiles.filter(t => t.id !== tileId);
    db.tiles = Grid.compactGrid(db.tiles);
    saveState();
    render();
    toast(`„${name}" entfernt`);
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
    if (tile.kpi_id === 'rfc-tests' || tile.kpi_id === 'a-bugs-post-release') {
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
          <button class="btn-close" id="info-close" aria-label="Schließen">&times;</button>
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
    if (t.green) parts.push(`<span style="color:var(--green);font-weight:600">● ${opLabel(t.green.operator)} ${t.green.value}</span>`);
    if (t.yellow) parts.push(`<span style="color:var(--yellow);font-weight:600">● ${opLabel(t.yellow.operator)} ${t.yellow.value}</span>`);
    if (t.red) parts.push(`<span style="color:var(--red);font-weight:600">● ${opLabel(t.red.operator)} ${t.red.value}</span>`);
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
          <button class="btn-close" id="info-close" aria-label="Schließen">&times;</button>
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
    el.setAttribute('role', 'status');
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 400ms';
      setTimeout(() => el.remove(), 400);
    }, 4000);
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

  const COMPUTED_KPI_IDS = new Set([...Object.keys(COMPUTED_KPIS), 'test-coverage-new-features']);

  function isComputedKpi(kpiId) {
    return COMPUTED_KPI_IDS.has(kpiId);
  }

  /* ===== RFC Tests & A-Bugs Campaign Selection ===== */
  const RFC_TESTS_CAMPAIGN_KEY = 'qa_dashboard_rfc_tests_campaign';
  const ABUGS_CAMPAIGN_KEY = 'qa_dashboard_abugs_campaign';
  const ABUGS_VALUES_KEY = 'qa_dashboard_abugs_values';

  function getRfcTestsCampaignId() {
    try {
      return localStorage.getItem(RFC_TESTS_CAMPAIGN_KEY);
    } catch { return null; }
  }

  function setRfcTestsCampaignId(id) {
    try {
      if (id) {
        localStorage.setItem(RFC_TESTS_CAMPAIGN_KEY, id);
        syncToServer(RFC_TESTS_CAMPAIGN_KEY, id);
      } else {
        localStorage.removeItem(RFC_TESTS_CAMPAIGN_KEY);
        syncToServer(RFC_TESTS_CAMPAIGN_KEY, null);
      }
    } catch {}
  }

  function getABugsCampaignId() {
    try {
      return localStorage.getItem(ABUGS_CAMPAIGN_KEY);
    } catch { return null; }
  }

  function setABugsCampaignId(id) {
    try {
      if (id) {
        localStorage.setItem(ABUGS_CAMPAIGN_KEY, id);
        syncToServer(ABUGS_CAMPAIGN_KEY, id);
      } else {
        localStorage.removeItem(ABUGS_CAMPAIGN_KEY);
        syncToServer(ABUGS_CAMPAIGN_KEY, null);
      }
    } catch {}
  }

  /* ===== Response Times Campaign Selection ===== */
  const RESPONSEDEV_CURRENT_KEY = 'qa_dashboard_responsedev_current';
  const RESPONSEDEV_PREVIOUS_KEY = 'qa_dashboard_responsedev_previous';
  const RESPONSESTA_CURRENT_KEY = 'qa_dashboard_responsesta_current';
  const RESPONSESTA_PREVIOUS_KEY = 'qa_dashboard_responsesta_previous';
  const RECIPIENTSEARCH_CAMPAIGN_KEY = 'qa_dashboard_recipientsearch_campaign';

  function getResponseDevCurrentCampaignId() {
    try { return localStorage.getItem(RESPONSEDEV_CURRENT_KEY); } catch { return null; }
  }
  function setResponseDevCurrentCampaignId(id) {
    try {
      if (id) { localStorage.setItem(RESPONSEDEV_CURRENT_KEY, id); syncToServer(RESPONSEDEV_CURRENT_KEY, id); }
      else { localStorage.removeItem(RESPONSEDEV_CURRENT_KEY); syncToServer(RESPONSEDEV_CURRENT_KEY, null); }
    } catch {}
  }
  function getResponseDevPreviousCampaignId() {
    try { return localStorage.getItem(RESPONSEDEV_PREVIOUS_KEY); } catch { return null; }
  }
  function setResponseDevPreviousCampaignId(id) {
    try {
      if (id) { localStorage.setItem(RESPONSEDEV_PREVIOUS_KEY, id); syncToServer(RESPONSEDEV_PREVIOUS_KEY, id); }
      else { localStorage.removeItem(RESPONSEDEV_PREVIOUS_KEY); syncToServer(RESPONSEDEV_PREVIOUS_KEY, null); }
    } catch {}
  }
  function getResponseStaCurrentCampaignId() {
    try { return localStorage.getItem(RESPONSESTA_CURRENT_KEY); } catch { return null; }
  }
  function setResponseStaCurrentCampaignId(id) {
    try {
      if (id) { localStorage.setItem(RESPONSESTA_CURRENT_KEY, id); syncToServer(RESPONSESTA_CURRENT_KEY, id); }
      else { localStorage.removeItem(RESPONSESTA_CURRENT_KEY); syncToServer(RESPONSESTA_CURRENT_KEY, null); }
    } catch {}
  }
  function getResponseStaPreviousCampaignId() {
    try { return localStorage.getItem(RESPONSESTA_PREVIOUS_KEY); } catch { return null; }
  }
  function setResponseStaPreviousCampaignId(id) {
    try {
      if (id) { localStorage.setItem(RESPONSESTA_PREVIOUS_KEY, id); syncToServer(RESPONSESTA_PREVIOUS_KEY, id); }
      else { localStorage.removeItem(RESPONSESTA_PREVIOUS_KEY); syncToServer(RESPONSESTA_PREVIOUS_KEY, null); }
    } catch {}
  }
  function getRecipientSearchCampaignId() {
    try { return localStorage.getItem(RECIPIENTSEARCH_CAMPAIGN_KEY); } catch { return null; }
  }
  function setRecipientSearchCampaignId(id) {
    try {
      if (id) { localStorage.setItem(RECIPIENTSEARCH_CAMPAIGN_KEY, id); syncToServer(RECIPIENTSEARCH_CAMPAIGN_KEY, id); }
      else { localStorage.removeItem(RECIPIENTSEARCH_CAMPAIGN_KEY); syncToServer(RECIPIENTSEARCH_CAMPAIGN_KEY, null); }
    } catch {}
  }

  function getABugsValues() {
    try {
      const raw = localStorage.getItem(ABUGS_VALUES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveABugsValue(campaignId, value) {
    const vals = getABugsValues();
    vals[campaignId] = value;
    try {
      localStorage.setItem(ABUGS_VALUES_KEY, JSON.stringify(vals));
      syncToServer(ABUGS_VALUES_KEY, vals);
    } catch {}
  }

  /* ===== Parse version for comparison ===== */
  function parseCampVersion(ver) {
    const m = (ver || '').match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? { major: parseInt(m[1]), minor: parseInt(m[2]), patch: parseInt(m[3]) } : null;
  }

  function findPreviousCampaign(campaigns, currentId) {
    const cur = campaigns.find(c => c.id === currentId);
    if (!cur) return null;
    const curVer = parseCampVersion(cur.version);
    if (!curVer) return null;
    const sorted = campaigns
      .filter(c => c.id !== currentId && !c.archived)
      .map(c => ({ ...c, _parsed: parseCampVersion(c.version) }))
      .filter(c => c._parsed)
      .sort((a, b) => b._parsed.major - a._parsed.major || b._parsed.minor - a._parsed.minor || b._parsed.patch - a._parsed.patch);
    return sorted.find(c =>
      c._parsed.major < curVer.major ||
      (c._parsed.major === curVer.major && c._parsed.minor < curVer.minor) ||
      (c._parsed.major === curVer.major && c._parsed.minor === curVer.minor && c._parsed.patch < curVer.patch)
    ) || sorted[0] || null;
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
    /* RFC Tests value from campaigns — auto-computed from unique BEAR refs + offset */
    const rfcCampId = getRfcTestsCampaignId();
    const rfcC = rfcCampId ? campaigns.find(c => c.id === rfcCampId) : null;
    const rfcFallback = !rfcC && campaigns.length > 0 ? campaigns[0] : null;
    const rfcSrc = rfcC || rfcFallback;
    if (rfcSrc && rfcSrc.values[2]) {
      const computed = countUniqueBearRefs(rfcSrc.id);
      const offset = rfcSrc.rfcTestOffset || 0;
      const total = computed + offset;
      merged['rfc-tests'] = total;
      rfcSrc.values[2].planned = total;
      if (!rfcC && rfcFallback) setRfcTestsCampaignId(rfcFallback.id);
    }
      /* Testabdeckung neuer Funktionen — AC coverage per campaign */
      const acNewCampId = getRfcTestsCampaignId();
      const acNewC = acNewCampId ? campaigns.find(c => c.id === acNewCampId) : null;
      const acNewSrc = acNewC || (campaigns.length > 0 ? campaigns[0] : null);
      if (acNewSrc) {
        const relevantRfcs = rfcEntries.filter(e => !e.archived && e.campaignId === acNewSrc.id);
        let totalAcs = 0;
        let passedAcs = 0;
        for (const entry of relevantRfcs) {
          for (const ac of Object.values(entry.acs)) {
            totalAcs++;
            if (ac.status === 'passed') passedAcs++;
          }
        }
        merged['test-coverage-new-features'] = totalAcs > 0 ? Math.round((passedAcs / totalAcs) * 100) : 0;
      }
      /* A-Bugs value from per-campaign storage */
      const bugsCampId = getABugsCampaignId();
      const bugsCamp = bugsCampId ? campaigns.find(c => c.id === bugsCampId) : null;
      const bugsFallback = !bugsCamp && campaigns.length > 0 ? campaigns[0] : null;
      const bugsSrc = bugsCamp || bugsFallback;
      if (bugsSrc) {
        const bugsValues = getABugsValues();
        if (bugsValues[bugsSrc.id] !== undefined) {
          merged['a-bugs-post-release'] = bugsValues[bugsSrc.id];
        }
        if (!bugsCamp && bugsFallback) setABugsCampaignId(bugsFallback.id);
      }
      /* FE Response DEV from campaigns */
      const rcDevCurrentId = getResponseDevCurrentCampaignId();
      const rcDevPrevId = getResponseDevPreviousCampaignId();
      const rcDevCamp = rcDevCurrentId ? campaigns.find(c => c.id === rcDevCurrentId) : null;
      const rcDevFallback = !rcDevCamp && campaigns.length > 0 ? campaigns[0] : null;
      const rcDevSrc = rcDevCamp || rcDevFallback;
      let rcDevPrevCamp = rcDevPrevId ? campaigns.find(c => c.id === rcDevPrevId) : null;
      if (!rcDevPrevCamp && rcDevSrc) rcDevPrevCamp = findPreviousCampaign(campaigns, rcDevSrc.id);
      if (rcDevSrc && rcDevSrc.responseDev) {
        const kpiDev = kpiMap['fe-response-dev'];
        const testSits = kpiDev?.example_value?.testSituations || [];
        const refData = kpiDev?.example_value?.versionData?.['R3.18.1'] || [];
        const vd = {};
        vd[rcDevSrc.version] = [...rcDevSrc.responseDev];
        if (rcDevPrevCamp) vd[rcDevPrevCamp.version] = [...rcDevPrevCamp.responseDev];
        vd['R3.18.1'] = refData.length === 26 ? refData : new Array(26).fill(null);
        merged['fe-response-dev'] = {
          currentVersion: rcDevSrc.version,
          previousVersion: rcDevPrevCamp ? rcDevPrevCamp.version : '',
          referenceVersion: 'R3.18.1',
          testSituations: testSits,
          versionData: vd
        };
        if (!rcDevCamp && rcDevFallback) setResponseDevCurrentCampaignId(rcDevFallback.id);
      }
      /* FE Response STA from campaigns */
      const rcStaCurrentId = getResponseStaCurrentCampaignId();
      const rcStaPrevId = getResponseStaPreviousCampaignId();
      const rcStaCamp = rcStaCurrentId ? campaigns.find(c => c.id === rcStaCurrentId) : null;
      const rcStaFallback = !rcStaCamp && campaigns.length > 0 ? campaigns[0] : null;
      const rcStaSrc = rcStaCamp || rcStaFallback;
      let rcStaPrevCamp = rcStaPrevId ? campaigns.find(c => c.id === rcStaPrevId) : null;
      if (!rcStaPrevCamp && rcStaSrc) rcStaPrevCamp = findPreviousCampaign(campaigns, rcStaSrc.id);
      if (rcStaSrc && rcStaSrc.responseSta) {
        const kpiSta = kpiMap['fe-response-sta'];
        const testSits = kpiSta?.example_value?.testSituations || [];
        const refData = kpiSta?.example_value?.versionData?.['R3.18.1'] || [];
        const vd = {};
        vd[rcStaSrc.version] = [...rcStaSrc.responseSta];
        if (rcStaPrevCamp) vd[rcStaPrevCamp.version] = [...rcStaPrevCamp.responseSta];
        vd['R3.18.1'] = refData.length === 26 ? refData : new Array(26).fill(null);
        merged['fe-response-sta'] = {
          currentVersion: rcStaSrc.version,
          previousVersion: rcStaPrevCamp ? rcStaPrevCamp.version : '',
          referenceVersion: 'R3.18.1',
          testSituations: testSits,
          versionData: vd
        };
        if (!rcStaCamp && rcStaFallback) setResponseStaCurrentCampaignId(rcStaFallback.id);
      }
      /* Recipient Search from campaigns */
      const teId = getRecipientSearchCampaignId();
      const teCamp = teId ? campaigns.find(c => c.id === teId) : null;
      const teFallback = !teCamp && campaigns.length > 0 ? campaigns[0] : null;
      const teSrc = teCamp || teFallback;
      if (teSrc && campaigns.some(c => c.recipientSearch && c.recipientSearch.some(v => v !== null))) {
        const kpiTe = kpiMap['recipient-search-time'];
        const testSits = kpiTe?.example_value?.testSituations || [];
        const withData = campaigns.filter(c => !c.archived && c.recipientSearch && c.recipientSearch.some(v => v !== null))
          .sort((a, b) => {
            const av = parseCampVersion(a.version), bv = parseCampVersion(b.version);
            if (!av || !bv) return 0;
            return av.major - bv.major || av.minor - bv.minor || av.patch - bv.patch;
          });
        const xAxisOrder = withData.map(c => c.version);
        const vd = {};
        for (const c of withData) vd[c.version] = [...c.recipientSearch];
        const latest = withData[withData.length - 1];
        const prev = withData.length > 1 ? withData[withData.length - 2] : null;
        if (latest) {
          merged['recipient-search-time'] = {
            latestVersion: latest.version,
            previousVersion: prev ? prev.version : '',
            testSituations: testSits,
            xAxisOrder,
            versionData: vd
          };
        }
        if (!teCamp && teFallback) setRecipientSearchCampaignId(teFallback.id ? teFallback.id : (withData[withData.length - 1]?.id || ''));
      }
      return merged;
    } catch { return { ...fileValues }; }
  }

  function setCustomValue(kpiId, value) {
    const vals = getCustomValues();
    vals[kpiId] = value;
    localStorage.setItem(VALUES_KEY, JSON.stringify(vals));
    syncToServer(VALUES_KEY, vals);
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
    Grid.setCampaigns(campaigns, {
      'rfc-tests': getRfcTestsCampaignId(),
      'test-coverage-new-features': getRfcTestsCampaignId(),
      'a-bugs-post-release': getABugsCampaignId(),
      'fe-response-dev-current': getResponseDevCurrentCampaignId(),
      'fe-response-dev-previous': getResponseDevPreviousCampaignId(),
      'fe-response-sta-current': getResponseStaCurrentCampaignId(),
      'fe-response-sta-previous': getResponseStaPreviousCampaignId(),
      'recipient-search-time': getRecipientSearchCampaignId()
    });
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
    const noValueChangeTiles = ['fe-response-dev', 'fe-response-sta', 'recipient-search-time'];
    const hasChanges = tiles.some(t => {
      const kpi = kpiMap[t.kpi_id];
      if (!kpi || noValueChangeTiles.includes(t.kpi_id)) return false;
      return vals[t.kpi_id] !== undefined && vals[t.kpi_id] !== kpi.example_value;
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
      } else if (isRcKpi || isTeKpi) {
        const campaignSuffix = isRcKpi ? 'Response-Zeiten' : 'Empfängersuchzeiten';
        html += `
          <div class="values-field values-field--computed" data-kpi-id="${kpi.id}">
            <div class="values-field-label">
              <div class="values-field-name">${kpi.name}</div>
              <div class="values-field-unit">${kpi.unit || '—'} · wird pro Release-Kandidat verwaltet</div>
            </div>
            <div class="values-field-computed-value" style="font-size:0.8rem;color:var(--text-muted)">
              ${isRcKpi ? `${currentVal.testSituations.length} Testsituationen · ${Object.keys(currentVal.versionData).length} Versionen` : `${currentVal.testSituations.length} Suchdimensionen · ${currentVal.xAxisOrder.length} Releases`}
            </div>
            <span class="values-field-badge neutral">—</span>
          </div>`;
      } else if (isComputedKpi(kpi.id) || kpi.data_source_type === 'computed') {
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

    /* ===== Response Times Editor ===== */
    const activeCamps = campaigns.filter(c => !c.archived);
    if (activeCamps.length > 0) {
      html += '<div class="values-section-divider"><span>Response Times pro Release-Kandidat</span></div>';
      const testSitsDev = kpiMap['fe-response-dev']?.example_value?.testSituations || [];
      const testSitsSearch = kpiMap['recipient-search-time']?.example_value?.testSituations || [];
      for (const camp of activeCamps) {
        html += renderCampaignResponseTimes(camp, testSitsDev, testSitsSearch);
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

    setupResponseTimesEvents();
    setupAcFormEvents();
  }

  function renderCampaignResponseTimes(camp, testSitsDev, testSitsSearch) {
    return `
      <div class="campaign-rt-block" data-campaign-id="${camp.id}">
        <div class="campaign-rt-header">
          <span class="campaign-rt-version">${camp.version}</span>
          <div class="campaign-rt-tabs" data-camp="${camp.id}">
            <button class="rt-tab-btn active" data-rt-tab="dev">FE Response DEV</button>
            <button class="rt-tab-btn" data-rt-tab="sta">FE Response STA</button>
            <button class="rt-tab-btn" data-rt-tab="search">Empfängersuche</button>
          </div>
        </div>
        <div class="campaign-rt-body">
          <div class="campaign-rt-panel active" data-rt-panel="${camp.id}-dev">
            ${renderRtInputs('responseDev', camp.id, camp.responseDev, testSitsDev, 'ms')}
          </div>
          <div class="campaign-rt-panel" data-rt-panel="${camp.id}-sta">
            ${renderRtInputs('responseSta', camp.id, camp.responseSta, testSitsDev, 'ms')}
          </div>
          <div class="campaign-rt-panel" data-rt-panel="${camp.id}-search">
            ${renderRtInputs('recipientSearch', camp.id, camp.recipientSearch, testSitsSearch, 's')}
          </div>
        </div>
      </div>`;
  }

  function renderRtInputs(field, campId, values, labels, unit) {
    return `<div class="rt-input-grid">${labels.map((label, i) => `
      <div class="rt-input-row">
        <span class="rt-input-label" title="${label}">${i + 1}. ${label}</span>
        <input type="number" step="any" class="rt-input" data-camp="${campId}" data-field="${field}" data-idx="${i}" value="${values && values[i] !== null ? values[i] : ''}" placeholder="—">
        <span class="rt-input-unit">${unit}</span>
      </div>`).join('')}</div>`;
  }

  function setupResponseTimesEvents() {
    valuesForm.querySelectorAll('.rt-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const block = btn.closest('.campaign-rt-block');
        if (!block) return;
        const campId = btn.closest('.campaign-rt-tabs')?.dataset.camp;
        const tab = btn.dataset.rtTab;
        block.querySelectorAll('.rt-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        block.querySelectorAll('.campaign-rt-panel').forEach(p => p.classList.remove('active'));
        const panel = block.querySelector(`[data-rt-panel="${campId}-${tab}"]`);
        if (panel) panel.classList.add('active');
      });
    });

    valuesForm.querySelectorAll('.rt-input').forEach(input => {
      const commit = () => {
        const campId = input.dataset.camp;
        const field = input.dataset.field;
        const idx = parseInt(input.dataset.idx);
        const camp = campaigns.find(c => c.id === campId);
        if (!camp || !camp[field]) return;
        const raw = input.value.trim();
        const num = raw !== '' ? parseFloat(raw) : null;
        camp[field][idx] = (num !== null && !isNaN(num)) ? num : null;
        saveCampaigns();
      };
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      });
    });
  }

  /* ===== Resize Modal ===== */
  let resizeTileId = null;
  let resizeKpiId = null;

  const RESIZE_PRESETS = [
    { w: 1, h: 1 }, { w: 1, h: 2 }, { w: 1, h: 3 }, { w: 1, h: 4 },
    { w: 2, h: 1 }, { w: 2, h: 2 }, { w: 2, h: 3 }, { w: 2, h: 4 },
    { w: 3, h: 1 }, { w: 3, h: 2 }, { w: 3, h: 3 }, { w: 3, h: 4 },
    { w: 4, h: 1 }, { w: 4, h: 2 }, { w: 4, h: 3 }, { w: 4, h: 4 }
  ];

  function getResizeLabel(w, h) {
    if (w >= 3) return 'Groß';
    if (w >= 2 && h >= 2) return 'Mittel';
    if (w >= 2) return 'Breit';
    if (h >= 2) return 'Hoch';
    return 'Klein';
  }

  function openResizeModal(tileId, kpiId, currentW, currentH) {
    resizeTileId = tileId;
    resizeKpiId = kpiId;
    const db = getCurrentDashboard();
    const cols = db ? db.columns : 4;
    const isVersionedTile = kpiId === 'rfc-tests' || kpiId === 'a-bugs-post-release';
    const grid = $('#resize-grid');
    grid.innerHTML = RESIZE_PRESETS
      .filter(p => p.w <= cols && (isVersionedTile ? p.w === p.h : true))
      .map(p => {
        const active = p.w === currentW && p.h === currentH;
        return `<button class="resize-btn${active ? ' resize-btn--active' : ''}" data-w="${p.w}" data-h="${p.h}">
          <span>${p.w}×${p.h}</span>
          <span class="resize-btn-label">${getResizeLabel(p.w, p.h)}</span>
        </button>`;
      }).join('');
    grid.querySelectorAll('.resize-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        commitResize(parseInt(btn.dataset.w), parseInt(btn.dataset.h));
      });
    });
    $('#resize-modal').classList.remove('hidden');
  }

  function commitResize(w, h) {
    if (!resizeTileId) return;
    const evt = new CustomEvent('tile:resize', {
      detail: { tileId: resizeTileId, w, h }
    });
    document.dispatchEvent(evt);
    closeResizeModal();
  }

  function closeResizeModal() {
    $('#resize-modal').classList.add('hidden');
    resizeTileId = null;
    resizeKpiId = null;
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
    const btn = $('#btn-export');
    btn.disabled = true;
    btn.textContent = 'Exportiere...';
    setTimeout(() => {
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
        rfcTestsCampaignId: getRfcTestsCampaignId(),
        aBugsCampaignId: getABugsCampaignId(),
        aBugsValues: getABugsValues()
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
      btn.disabled = false;
      btn.textContent = 'Export';
    }, 100);
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
          syncToServer(THEME_KEY, data.theme);
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
          syncToServer(VALUES_KEY, data.customValues);
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
        if (data.aBugsCampaignId) {
          setABugsCampaignId(data.aBugsCampaignId);
        }
        if (data.aBugsValues) {
          try {
            localStorage.setItem(ABUGS_VALUES_KEY, JSON.stringify(data.aBugsValues));
            syncToServer(ABUGS_VALUES_KEY, data.aBugsValues);
          } catch {}
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
    /* Aria-labels for close buttons */
    document.querySelectorAll('.btn-close').forEach(el => el.setAttribute('aria-label', 'Schließen'));

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
    $('#btn-import').addEventListener('click', () => {
      const btn = $('#btn-import');
      if (btn.disabled) return;
      $('#btn-import-file').click();
    });
    $('#btn-import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const btn = $('#btn-import');
        btn.disabled = true;
        btn.textContent = 'Importiere...';
        importConfig(file);
        btn.disabled = false;
        btn.textContent = 'Import';
      }
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
    document.addEventListener('tile:resize-dialog', (e) => {
      const { tileId, kpiId, w, h } = e.detail;
      openResizeModal(tileId, kpiId, w, h);
    });
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
        toast(`„${kpiMap[kpiId]?.name || 'RFC Tests'}" → ${formatExportValue(value)} Tests`);
        return;
      }
      if (kpiId === 'a-bugs-post-release') {
        const campaignId = getABugsCampaignId();
        if (campaignId) {
          saveABugsValue(campaignId, value);
        } else if (campaigns.length > 0) {
          saveABugsValue(campaigns[0].id, value);
          setABugsCampaignId(campaigns[0].id);
        } else {
          setCustomValue(kpiId, value);
        }
        render();
        toast(`„${kpiMap[kpiId]?.name || 'A-Fehler'}" → ${formatExportValue(value)} ${kpiMap[kpiId]?.unit || ''}`);
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

    /* Campaign version change (from tile version selector) */
    document.addEventListener('tile:rfc-campaign-change', (e) => {
      const { campaignId, kpiId, versionType } = e.detail;
      if (kpiId === 'a-bugs-post-release') {
        setABugsCampaignId(campaignId);
      } else if (kpiId === 'fe-response-dev') {
        if (versionType === 'previous') setResponseDevPreviousCampaignId(campaignId);
        else setResponseDevCurrentCampaignId(campaignId);
      } else if (kpiId === 'fe-response-sta') {
        if (versionType === 'previous') setResponseStaPreviousCampaignId(campaignId);
        else setResponseStaCurrentCampaignId(campaignId);
      } else if (kpiId === 'recipient-search-time') {
        setRecipientSearchCampaignId(campaignId);
      } else {
        setRfcTestsCampaignId(campaignId);
      }
      render();
    });

    /* RFC Tests offset adjustment */
    document.addEventListener('tile:rfc-offset-change', (e) => {
      const { delta } = e.detail;
      const campaignId = getRfcTestsCampaignId();
      const campaign = campaigns.find(c => c.id === campaignId);
      if (!campaign) {
        toast('Kein Release für RFC-Tests ausgewählt');
        return;
      }
      campaign.rfcTestOffset = (campaign.rfcTestOffset || 0) + delta;
      saveCampaigns();
      render();
    });

    /* Chart modal */
    let chartModalData = null;
    let chartModalIsTe = false;

    document.addEventListener('tile:chart-modal', (e) => {
      const { kpiId, kpi, data } = e.detail;
      if (!data) return;
      chartModalData = data;
      chartModalIsTe = !!(data.xAxisOrder && data.versionData);
      $('#chart-modal-title').textContent = chartModalIsTe
        ? `${kpi.name} — Evolution`
        : kpi.name;
      $('#chart-modal').classList.remove('hidden');
      /* reset to chart tab */
      setChartTab('chart');
      requestAnimationFrame(() => {
        const canvas = $('#chart-modal-canvas');
        if (chartModalIsTe) {
          ChartEngine.drawTimeEvolution(canvas, data, false);
        } else {
          ChartEngine.drawResponseComparison(canvas, data, kpi.name);
        }
      });
    });

    function setChartTab(tab) {
      document.querySelectorAll('.chart-tab').forEach(b => b.classList.toggle('active', b.dataset.chartTab === tab));
      const isChart = tab === 'chart';
      $('#chart-modal-canvas').classList.toggle('hidden', !isChart);
      $('#chart-modal-data').classList.toggle('hidden', isChart);
      if (!isChart && chartModalData) renderChartDataTable();
    }

    function renderChartDataTable() {
      const data = chartModalData;
      const container = $('#chart-modal-data');
      if (!data || !container) return;
      if (chartModalIsTe) {
        renderTeDataTable(container, data);
      } else {
        renderRcDataTable(container, data);
      }
    }

    function renderRcDataTable(container, data) {
      const versions = [data.currentVersion, data.previousVersion, data.referenceVersion];
      const versionLabels = ['Aktuell', 'Vorher', 'Referenz'];
      const versionColors = ['val-current', 'val-previous', 'val-reference'];
      const sits = data.testSituations;
      let html = `<table><thead><tr><th>#</th><th>Testsituation</th>`;
      for (let vi = 0; vi < versions.length; vi++) {
        html += `<th class="val-ms ${versionColors[vi]}">${versionLabels[vi]}<br>${versions[vi]}</th>`;
      }
      html += `</tr></thead><tbody>`;
      for (let i = 0; i < sits.length; i++) {
        const valClasses = [];
        for (let vi = 0; vi < versions.length; vi++) {
          const vals = data.versionData[versions[vi]] || [];
          const v = vals[i];
          valClasses.push(v != null ? v + ' ms' : '<span style="color:var(--text-muted);font-style:italic">n.a.</span>');
        }
        html += `<tr${i % 2 === 1 ? ' class="row-stripe"' : ''}>
          <td style="text-align:center;color:var(--text-muted);font-weight:500">${i + 1}</td>
          <td>${sits[i]}</td>
          ${valClasses.map((vc, vi) => `<td class="val-ms ${versionColors[vi]}">${vc}</td>`).join('')}
        </tr>`;
      }
      html += `</tbody></table>`;
      container.innerHTML = html;
    }

    function renderTeDataTable(container, data) {
      const versions = data.xAxisOrder;
      const sits = data.testSituations;
      const lineColors = ['#6366f1', '#22c55e', '#eab308', '#f97316', '#ef4444', '#3b82f6'];
      let html = `<table><thead><tr><th>Release</th>`;
      for (let si = 0; si < sits.length; si++) {
        html += `<th style="color:${lineColors[si]}">${sits[si]}</th>`;
      }
      html += `</tr></thead><tbody>`;
      for (let vi = 0; vi < versions.length; vi++) {
        const vals = data.versionData[versions[vi]] || [];
        html += `<tr${vi % 2 === 1 ? ' class="row-stripe"' : ''}><td style="font-weight:600;color:var(--text)">${versions[vi]}</td>`;
        for (let si = 0; si < sits.length; si++) {
          const v = vals[si];
          if (v === null || v === undefined) {
            html += '<td style="color:var(--text-muted)">—</td>';
          } else {
            const isLatest = versions[vi] === data.latestVersion;
            html += `<td style="text-align:right;${isLatest ? 'color:var(--green);font-weight:600' : ''}">${v.toFixed(2)} s</td>`;
          }
        }
        html += `</tr>`;
      }
      html += `</tbody></table>`;
      container.innerHTML = html;
    }

    document.querySelectorAll('.chart-tab').forEach(tab => {
      tab.addEventListener('click', () => setChartTab(tab.dataset.chartTab));
    });

    $('#btn-close-chart').addEventListener('click', () => {
      $('#chart-modal').classList.add('hidden');
      chartModalData = null;
    });
    $('#chart-modal .modal-backdrop').addEventListener('click', () => {
      $('#chart-modal').classList.add('hidden');
      chartModalData = null;
    });

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

    /* Resize modal */
    $('#btn-close-resize').addEventListener('click', closeResizeModal);
    $('#btn-resize-cancel').addEventListener('click', closeResizeModal);
    $('#resize-modal .modal-backdrop').addEventListener('click', closeResizeModal);

    /* Keyboard */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCatalog();
        closeCampaignEdit();
        closeResizeModal();
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
        if (!c.responseDev || c.responseDev.length !== 26) {
          c.responseDev = new Array(26).fill(null);
          changed = true;
        }
        if (!c.responseSta || c.responseSta.length !== 26) {
          c.responseSta = new Array(26).fill(null);
          changed = true;
        }
        if (!c.recipientSearch || c.recipientSearch.length !== 6) {
          c.recipientSearch = new Array(6).fill(null);
          changed = true;
        }
        if (c.rfcTestOffset === undefined) {
          c.rfcTestOffset = 0;
          changed = true;
        }
      }
      /* Migration: alte RC/TE-Daten aus values.json in erste Campaign übernehmen */
      if (campaigns.length > 0 && !campaigns[0]._migrated) {
        const oldVals = getCustomValues();
        const oldRcDev = oldVals['fe-response-dev'];
        const oldRcSta = oldVals['fe-response-sta'];
        const oldTe = oldVals['recipient-search-time'];
        if (oldRcDev && oldRcDev.versionData) {
          const versions = Object.keys(oldRcDev.versionData).filter(v => v !== 'R3.18.1');
          for (const v of versions) {
            const camp = campaigns.find(c => c.version === v.replace('R', ''));
            if (camp && oldRcDev.versionData[v]) {
              camp.responseDev = [...oldRcDev.versionData[v]];
              changed = true;
            }
          }
        }
        if (oldRcSta && oldRcSta.versionData) {
          const versions = Object.keys(oldRcSta.versionData).filter(v => v !== 'R3.18.1');
          for (const v of versions) {
            const camp = campaigns.find(c => c.version === v.replace('R', ''));
            if (camp && oldRcSta.versionData[v]) {
              camp.responseSta = [...oldRcSta.versionData[v]];
              changed = true;
            }
          }
        }
        if (oldTe && oldTe.versionData) {
          for (const v of oldTe.xAxisOrder || []) {
            const camp = campaigns.find(c => c.version === v.replace('R', ''));
            if (camp && oldTe.versionData[v]) {
              camp.recipientSearch = [...oldTe.versionData[v]];
              changed = true;
            }
          }
        }
        for (const c of campaigns) c._migrated = true;
      }
      if (changed) saveCampaigns();
    } catch { campaigns = []; }
  }

  function saveCampaigns() {
    try {
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
      syncToServer(CAMPAIGNS_KEY, campaigns);
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
      completed: 'passed',
      responseDev: new Array(26).fill(null),
      responseSta: new Array(26).fill(null),
      recipientSearch: new Array(6).fill(null),
      rfcTestOffset: 0
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

    function acStatusClass(status) {
    if (status === 'passed') return 'green';
    if (status === 'blocked') return 'blue';
    return 'red';
  }
  function acStatusLabel(status) {
    if (status === 'passed') return 'PASSED';
    if (status === 'blocked') return 'BLOCKED';
    return 'FAILED';
  }

  function countUniqueBearRefs(campaignId) {
    if (!campaignId) return 0;
    const bears = new Set();
    for (const entry of rfcEntries) {
      if (entry.archived || entry.campaignId !== campaignId) continue;
      for (const ac of Object.values(entry.acs)) {
        const ref = (ac.testRef || '').trim();
        if (ref) bears.add(ref);
      }
    }
    return bears.size;
  }

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
            acs[k] = { text: v.text || k, status: v.passed ? 'passed' : 'failed', testRef: v.testRef || '' };
          }
          rfcEntries.push({ id: 'rfc_' + Date.now(), name: 'RFC (migriert)', campaignId: null, archived: false, acs });
          saveRfcEntries();
        }
      }
      /* migrate existing entries: add missing fields + passed→status */
      for (const entry of rfcEntries) {
        if (entry.campaignId === undefined) entry.campaignId = null;
        if (entry.archived === undefined) entry.archived = false;
        if (entry.acs) {
          for (const ac of Object.values(entry.acs)) {
            if (ac.testRef === undefined) ac.testRef = '';
            if (ac.status === undefined) {
              ac.status = ac.passed ? 'passed' : 'failed';
              delete ac.passed;
            }
          }
        }
      }
    } catch { rfcEntries = []; }
  }

  function saveRfcEntries() {
    try {
      localStorage.setItem(RFC_KEY, JSON.stringify(rfcEntries));
      syncToServer(RFC_KEY, rfcEntries);
    } catch {}
  }

  function renderRfcSidebar() {
    const container = $('#sidebar-rfc');
    const list = $('#rfc-list');

    /* build campaign filter dropdown */
    const activeCampaigns = campaigns.filter(c => !c.archived);
    const storedFilter = localStorage.getItem('qa_dashboard_rfc_filter') || '';
    let filterCampaignId = storedFilter || '';
    let filterHtml = '<option value="" selected>Alle RFCs</option>';
    for (const c of activeCampaigns) {
      const sel = c.id === filterCampaignId ? ' selected' : '';
      filterHtml += `<option value="${c.id}"${sel}>${c.version}</option>`;
    }
    /* ensure dropdown exists or create it */
    let filterWrap = container.querySelector('.rfc-filter-wrap');
    if (!filterWrap) {
      filterWrap = document.createElement('div');
      filterWrap.className = 'rfc-filter-wrap';
      filterWrap.innerHTML = `<label class="rfc-filter-label">Release:</label><select class="rfc-filter-select">${filterHtml}</select>`;
      container.insertBefore(filterWrap, list);
    } else {
      filterWrap.querySelector('.rfc-filter-select').innerHTML = filterHtml;
    }

    const campaignVersionMap = {};
    for (const c of activeCampaigns) campaignVersionMap[c.id] = c.version;

    /* filter: show active (non-archived) entries matching campaign filter */
    const visible = rfcEntries.filter(e => {
      if (e.archived) return false;
      if (filterCampaignId && e.campaignId !== filterCampaignId) return false;
      return true;
    });

    if (visible.length === 0) {
      list.innerHTML = '<div class="empty-state-text" style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.85rem">Keine RFC-Daten vorhanden</div>';
      /* still update archive link */
      updateRfcArchiveLink();
      return;
    }

    list.innerHTML = visible.map((entry) => {
      const acEntries = Object.entries(entry.acs);
      const total = acEntries.length;
      const covered = acEntries.filter(([, ac]) => ac.status === 'passed').length;
      const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
      const campaignLabel = entry.campaignId && campaignVersionMap[entry.campaignId]
        ? campaignVersionMap[entry.campaignId] : '';

      let acGridHtml = '';
      for (const [acId, ac] of acEntries) {
        acGridHtml += `<div class="rfc-ac-item ${ac.status || 'failed'}" data-entry-id="${entry.id}" data-ac-id="${acId}">${acId}</div>`;
      }

      return `
        <div class="rfc-tile">
          <div class="rfc-tile-header">
            <span>${entry.name}${campaignLabel ? ' <span style="font-weight:400;color:var(--text-muted);font-size:0.75rem">(' + campaignLabel + ')</span>' : ''}</span>
            <div style="display:flex;gap:0.2rem;align-items:center">
              <button class="rfc-btn-archive" title="Archivieren" data-entry-id="${entry.id}">📦</button>
              <button class="rfc-btn-print" title="Als Bild speichern" aria-label="Als Bild speichern" data-entry-id="${entry.id}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
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

    updateRfcArchiveLink();
    requestAnimationFrame(drawRfcDonuts);
  }

  function updateRfcArchiveLink() {
    const container = $('#sidebar-rfc');
    let link = container.querySelector('.rfc-archive-link');
    const archivedCount = rfcEntries.filter(e => e.archived).length;
    if (archivedCount > 0) {
      if (!link) {
        link = document.createElement('div');
        link.className = 'sidebar-archive-link rfc-archive-link';
        link.innerHTML = `<button class="btn-archive-link">📦 Archiv (${archivedCount})</button>`;
        container.appendChild(link);
        link.querySelector('.btn-archive-link').addEventListener('click', () => openRfcArchive());
      } else {
        link.innerHTML = `<button class="btn-archive-link">📦 Archiv (${archivedCount})</button>`;
        link.querySelector('.btn-archive-link').addEventListener('click', () => openRfcArchive());
      }
    } else if (link) {
      link.remove();
    }
  }

  function drawRfcDonuts() {
    for (const entry of rfcEntries) {
      const canvas = document.querySelector(`.rfc-main-donut[data-entry-id="${entry.id}"]`);
      if (!canvas) continue;
      const acEntries = Object.entries(entry.acs);
      const total = acEntries.length;
      const covered = acEntries.filter(([, ac]) => ac.status === 'passed').length;
      const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
      const status = pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red';
      ChartEngine.drawDonut(canvas, pct, '%', status);
    }
  }

  function saveRfcSync() {
    const merged = getCustomValues();
    merged['test-coverage-rfc'] = { entries: rfcEntries };
    setCustomValue('test-coverage-rfc', merged['test-coverage-rfc']);
    saveRfcEntries();
  }

  function toggleRfcAc(entryId, acId) {
    const entry = rfcEntries.find(e => e.id === entryId);
    if (!entry || !entry.acs[acId]) return;
    const ac = entry.acs[acId];
    if (ac.status === 'passed') ac.status = 'failed';
    else if (ac.status === 'failed') ac.status = 'blocked';
    else ac.status = 'passed';
    saveRfcSync();
    renderRfcSidebar();
  }

  function createRfcEntry(name, campaignId) {
    const id = 'rfc_' + Date.now();
    const acCount = parseInt(document.getElementById('rfc-add-ac-count').value) || 3;
    const acInputs = document.querySelectorAll('.rfc-add-ac-row input');
    const acs = {};
    for (let i = 0; i < acCount; i++) {
      const acId = 'AC' + (i + 1);
      const text = acInputs[i] ? acInputs[i].value.trim() : 'AC ' + (i + 1);
      acs[acId] = { text: text || 'AC ' + (i + 1), status: 'passed', testRef: '' };
    }
    const newEntry = { id, name, campaignId: campaignId || null, archived: false, acs };
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

  function openRfcArchive() {
    const modal = document.getElementById('rfc-archive-modal');
    const list = document.getElementById('rfc-archive-list');
    const archived = rfcEntries.filter(e => e.archived);
    if (archived.length === 0) {
      list.innerHTML = '<div class="archive-empty">Keine archivierten RFCs</div>';
    } else {
      list.innerHTML = archived.map(e => {
        const acEntries = Object.entries(e.acs);
        const total = acEntries.length;
        const covered = acEntries.filter(([, ac]) => ac.status === 'passed').length;
        const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
        return `
          <div class="archive-campaign-tile" data-entry-id="${e.id}">
            <div class="archive-campaign-header">
              <span>${e.name}</span>
              <button class="btn-campaign-restore" data-entry-id="${e.id}">Wiederherstellen</button>
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted)">${covered}/${total} ACs · ${pct}% abgedeckt</div>
          </div>`;
      }).join('');
    }
    modal.classList.remove('hidden');
  }

  function archiveRfc(id) {
    const entry = rfcEntries.find(e => e.id === id);
    if (!entry) return;
    entry.archived = true;
    saveRfcSync();
    renderRfcSidebar();
    toast('RFC archiviert');
  }

  function unarchiveRfc(id) {
    const entry = rfcEntries.find(e => e.id === id);
    if (!entry) return;
    entry.archived = false;
    saveRfcSync();
    renderRfcSidebar();
    toast('RFC wiederhergestellt');
  }

  function renderRfcDetailModal(entry) {
    document.getElementById('rfc-detail-title').textContent = 'Details: ' + entry.name;
    const body = document.getElementById('rfc-detail-body');

    const activeCampaigns = campaigns.filter(c => !c.archived);
    let campaignOpts = '<option value="">Kein Release</option>';
    for (const c of activeCampaigns) {
      const sel = c.id === entry.campaignId ? ' selected' : '';
      campaignOpts += `<option value="${c.id}"${sel}>${c.version}</option>`;
    }
    const campaignSelectHtml = `
      <div class="rfc-detail-campaign-row">
        <label>Release:</label>
        <select class="rfc-detail-campaign-select" data-entry-id="${entry.id}">${campaignOpts}</select>
      </div>`;

    body.innerHTML = campaignSelectHtml + Object.entries(entry.acs).map(([acId, ac]) => {
      const st = acStatusClass(ac.status);
      const statusText = acStatusLabel(ac.status);
      return `
        <div class="rfc-detail-item" data-entry-id="${entry.id}" data-ac-id="${acId}">
          <span class="rfc-detail-dot ${st}"></span>
          <span class="rfc-detail-id">${acId}</span>
          <input class="rfc-detail-text-input" value="${(ac.text || '').replace(/"/g, '&quot;')}" placeholder="AC Beschreibung">
          <input class="rfc-detail-testref" value="${(ac.testRef || '').replace(/"/g, '&quot;')}" placeholder="BEAR-xxxx">
          <button class="rfc-detail-status-btn ${st}" title="Status umschalten">${statusText}</button>
          <button class="rfc-detail-ac-remove" title="AC entfernen">×</button>
        </div>`;
    }).join('');
    body.innerHTML += `<div class="rfc-detail-actions"><button class="btn btn-sm btn-secondary rfc-detail-ac-add">+ AC hinzufügen</button></div>`;
    document.getElementById('rfc-detail-modal').classList.remove('hidden');
  }

  function setupRfcEvents() {
    /* RFC filter change */
    const container = $('#sidebar-rfc');
    container.addEventListener('change', (e) => {
      const sel = e.target.closest('.rfc-filter-select');
      if (!sel) return;
      localStorage.setItem('qa_dashboard_rfc_filter', sel.value);
      renderRfcSidebar();
    });

    /* archive button */
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.rfc-btn-archive');
      if (!btn) return;
      e.stopPropagation();
      archiveRfc(btn.dataset.entryId);
    });

    /* delete RFC */
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.rfc-btn-remove');
      if (!btn) return;
      e.stopPropagation();
      removeRfcEntry(btn.dataset.entryId);
    });

    /* print RFC tile */
    container.addEventListener('click', (e) => {
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
      const campaignSelect = document.getElementById('rfc-add-campaign-field');
      const campaignId = campaignSelect ? campaignSelect.value : '';
      createRfcEntry(name, campaignId);
      document.getElementById('rfc-add-modal').classList.add('hidden');
      toast(`RFC ${name} erstellt`);
    });

    /* AC toggle in sidebar */
    container.addEventListener('click', (e) => {
      const item = e.target.closest('.rfc-ac-item');
      if (!item) return;
      toggleRfcAc(item.dataset.entryId, item.dataset.acId);
    });

    /* Detail button → open detail modal */
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.rfc-detail-btn');
      if (!btn) return;
      const entry = rfcEntries.find(e => e.id === btn.dataset.entryId);
      if (!entry) return;
      renderRfcDetailModal(entry);
    });

    /* --- Detail modal events --- */
    const detailBody = document.getElementById('rfc-detail-body');

    /* toggle AC state from detail modal (dot or text input click) */
    function cycleDetailAcState(item) {
      const entryId = item.dataset.entryId;
      const acId = item.dataset.acId;
      toggleRfcAc(entryId, acId);
      const entry = rfcEntries.find(e => e.id === entryId);
      if (!entry || !entry.acs[acId]) return;
      const ac = entry.acs[acId];
      const st = acStatusClass(ac.status);
      const statusText = acStatusLabel(ac.status);
      item.querySelector('.rfc-detail-dot').className = 'rfc-detail-dot ' + st;
      item.querySelector('.rfc-detail-status-btn').className = 'rfc-detail-status-btn ' + st;
      item.querySelector('.rfc-detail-status-btn').textContent = statusText;
    }

    detailBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.rfc-detail-status-btn');
      if (btn) {
        cycleDetailAcState(btn.closest('.rfc-detail-item'));
        return;
      }
    });

    /* save AC text/testRef on input change */
    detailBody.addEventListener('change', (e) => {
      const input = e.target.closest('.rfc-detail-text-input, .rfc-detail-testref');
      if (!input) return;
      const item = input.closest('.rfc-detail-item');
      if (!item) return;
      const entryId = item.dataset.entryId;
      const acId = item.dataset.acId;
      const entry = rfcEntries.find(e => e.id === entryId);
      if (!entry || !entry.acs[acId]) return;
      const ac = entry.acs[acId];
      if (input.classList.contains('rfc-detail-text-input')) {
        ac.text = input.value;
      } else if (input.classList.contains('rfc-detail-testref')) {
        ac.testRef = input.value;
      }
      saveRfcSync();
      renderRfcSidebar();
    });

    /* remove AC from detail modal */
    detailBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.rfc-detail-ac-remove');
      if (!btn) return;
      const item = btn.closest('.rfc-detail-item');
      if (!item) return;
      const entryId = item.dataset.entryId;
      const acId = item.dataset.acId;
      const entry = rfcEntries.find(e => e.id === entryId);
      if (!entry || !entry.acs[acId]) return;
      delete entry.acs[acId];
      saveRfcSync();
      renderRfcSidebar();
      /* update modal in-place */
      const entry2 = rfcEntries.find(e => e.id === entryId);
      if (entry2) renderRfcDetailModal(entry2);
    });

    /* add AC in detail modal */
    detailBody.addEventListener('click', (e) => {
      const btn = e.target.closest('.rfc-detail-ac-add');
      if (!btn) return;
      const item = detailBody.querySelector('.rfc-detail-item');
      if (!item) return;
      const entryId = item.dataset.entryId;
      const entry = rfcEntries.find(e => e.id === entryId);
      if (!entry) return;
      /* find next available AC id */
      let maxNum = 0;
      for (const k of Object.keys(entry.acs)) {
        const m = k.match(/^AC(\d+)$/);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
      }
      const newId = 'AC' + (maxNum + 1);
      entry.acs[newId] = { text: '', status: 'passed', testRef: '' };
      saveRfcSync();
      renderRfcSidebar();
      renderRfcDetailModal(entry);
      /* focus the new AC text input */
      setTimeout(() => {
        const newItem = detailBody.querySelector(`[data-ac-id="${newId}"]`);
        if (newItem) newItem.querySelector('.rfc-detail-text-input').focus();
      }, 50);
    });

    /* close detail modal */
    const closeDetail = () => {
      document.getElementById('rfc-detail-modal').classList.add('hidden');
      renderRfcSidebar();
    };
    $('#btn-close-rfc-detail').addEventListener('click', closeDetail);
    document.querySelector('#rfc-detail-modal .modal-backdrop').addEventListener('click', closeDetail);

    /* change RFC release from detail modal */
    detailBody.addEventListener('change', (e) => {
      const sel = e.target.closest('.rfc-detail-campaign-select');
      if (!sel) return;
      const entryId = sel.dataset.entryId;
      const entry = rfcEntries.find(e => e.id === entryId);
      if (!entry) return;
      entry.campaignId = sel.value || null;
      saveRfcSync();
      renderRfcSidebar();
    });

    /* --- Archive modal events --- */
    document.getElementById('rfc-archive-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-campaign-restore');
      if (!btn) return;
      unarchiveRfc(btn.dataset.entryId);
      /* update archive list in-place */
      openRfcArchive();
    });
    $('#btn-close-rfc-archive').addEventListener('click', () => document.getElementById('rfc-archive-modal').classList.add('hidden'));
    document.querySelector('#rfc-archive-modal .modal-backdrop').addEventListener('click', () => document.getElementById('rfc-archive-modal').classList.add('hidden'));

    /* --- Add modal campaign dropdown --- */
    function renderRfcAddCampaignSelect() {
      const field = document.getElementById('rfc-add-campaign-field');
      if (!field) return;
      const active = campaigns.filter(c => !c.archived);
      let html = '<option value="">Kein Release</option>';
      for (const c of active) {
        html += `<option value="${c.id}">${c.version}</option>`;
      }
      field.innerHTML = html;
    }
    renderRfcAddCampaignSelect();
  }

  /* ===== Start ===== */
  document.addEventListener('DOMContentLoaded', () => {
    loadRfcEntries();
    init().then(() => {
      renderCampaigns();
      setupCampaignEvents();
      renderRfcSidebar();
      setupRfcEvents();
    });
  });
})(GridEngine);
