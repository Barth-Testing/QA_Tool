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
    migrateAcStorage();
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
        if (tile.w < 1) tile.w = 1;
        if (tile.h < 1) tile.h = 1;
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
      const isAcKpi = currentVal && typeof currentVal === 'object' && currentVal.acs;

      if (isAcKpi) {
        html += renderAcValuesField(kpi, currentVal, vals);
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

    setupAcFormEvents();
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
    document.addEventListener('tile:ac-detail', (e) => {
      const { kpiName, acId, acText } = e.detail;
      showAcDetail(kpiName, acId, acText);
    });
    document.addEventListener('app:toast', (e) => toast(e.detail.message));
    document.addEventListener('tile:value-change', (e) => {
      const { kpiId, value } = e.detail;
      const existing = getCustomValues()[kpiId];
      const isAc = existing && typeof existing === 'object' && existing.acs;
      if (!isAc) setCustomValue(kpiId, value);
      const kpi = kpiMap[kpiId];
      render();
      if (kpi && !isAc) toast(`„${kpi.name}" → ${formatExportValue(value)}${kpi.unit ? ' ' + kpi.unit : ''}`);
    });

    /* Keyboard */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCatalog();
        $('#campaign-modal').classList.add('hidden');
        columnModal.classList.add('hidden');
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
        if (!c.colors) {
          c.colors = ['green', 'green', 'green', 'green', 'green'];
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
    list.innerHTML = campaigns.map(c => {
      const avg = c.values.length > 0 ? Math.round(c.values.reduce((a, b) => a + b, 0) / c.values.length) : 0;
      const miniLabels = ['Manual', 'Automation', 'RFC', 'Mobile'];
      const colors = c.colors || ['green', 'green', 'green', 'green', 'green'];
      const colorIcon = (clr) => {
        const hex = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }[clr] || '#6b7280';
        return `<span class="campaign-color-dot" style="background:${hex}"></span>`;
      };
      return `
        <div class="campaign-tile" data-campaign-id="${c.id}">
          <div class="campaign-tile-header">Testkampagne ${c.version}</div>
          <div class="campaign-main-wrap" data-campaign-id="${c.id}" data-color-index="0" title="Klicken zum Farbe wechseln">
            <canvas class="campaign-main-donut" data-campaign-id="${c.id}"></canvas>
          </div>
          <div class="campaign-mini-row">
            ${c.values.map((v, i) => `
              <div class="campaign-mini-donut-wrap" data-campaign-id="${c.id}" data-index="${i}">
                <canvas class="campaign-mini-canvas" data-campaign-id="${c.id}" data-index="${i}"></canvas>
                <span class="campaign-mini-label" data-color-index="${i + 1}" title="Klicken zum Farbe wechseln">${colorIcon(colors[i + 1])}${miniLabels[i] || ''}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }).join('');
    requestAnimationFrame(drawCampaignDonuts);
  }

  function drawCampaignDonuts() {
    for (const c of campaigns) {
      const colors = c.colors || ['green', 'green', 'green', 'green', 'green'];
      const mainCanvas = document.querySelector(`.campaign-main-donut[data-campaign-id="${c.id}"]`);
      if (mainCanvas) {
        const avg = c.values.length > 0 ? Math.round(c.values.reduce((a, b) => a + b, 0) / c.values.length) : 0;
        ChartEngine.drawDonut(mainCanvas, avg, '%', colors[0]);
      }
      document.querySelectorAll(`.campaign-mini-canvas[data-campaign-id="${c.id}"]`).forEach(canvas => {
        const idx = parseInt(canvas.dataset.index);
        const val = c.values[idx] || 0;
        ChartEngine.drawMiniDonut(canvas, val, colors[idx + 1]);
      });
    }
  }

  function createCampaign(version) {
    const id = 'cmp_' + Date.now();
    const newCampaign = { id, version, values: [0, 0, 0, 0], colors: ['green', 'green', 'green', 'green', 'green'] };
    campaigns.unshift(newCampaign);
    saveCampaigns();
    renderCampaigns();
  }

  function setupCampaignEvents() {
    const modal = $('#campaign-modal');
    const versionInput = $('#campaign-version');
    const backdrop = modal.querySelector('.modal-backdrop');

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

    /* Mini donut value editing */
    $('#campaign-list').addEventListener('click', (e) => {
      const wrap = e.target.closest('.campaign-mini-donut-wrap');
      if (!wrap) return;
      if (e.target.closest('.campaign-mini-label')) return;
      const campaignId = wrap.dataset.campaignId;
      const idx = parseInt(wrap.dataset.index);
      const c = campaigns.find(c => c.id === campaignId);
      if (!c) return;
      const current = c.values[idx] || 0;
      const input = prompt(`Wert für ${wrap.querySelector('.campaign-mini-label')?.textContent || 'Test'} eingeben (0-100):`, current);
      if (input === null) return;
      const num = parseFloat(input);
      if (isNaN(num) || num < 0 || num > 100) {
        toast('Bitte einen Wert zwischen 0 und 100 eingeben');
        return;
      }
      c.values[idx] = num;
      saveCampaigns();
      renderCampaigns();
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
  }

  /* ===== Start ===== */
  document.addEventListener('DOMContentLoaded', () => {
    loadCampaigns();
    init().then(() => {
      renderCampaigns();
      setupCampaignEvents();
    });
  });
})(GridEngine);
