/* ===== Grid Engine ===== */
const GridEngine = (() => {
  const state = {
    columns: 4,
    tiles: [],
    kpiMap: {},
    customValues: {},
    callbacks: { onUpdate: null },
    campaigns: [],
    selectedRfcCampaignId: null
  };

  function init(columns, kpiMap) {
    state.columns = columns;
    state.kpiMap = kpiMap;
  }

  function onUpdate(cb) {
    state.callbacks.onUpdate = cb;
  }

  function getOccupiedPositions(tiles) {
    const occupied = new Set();
    for (const t of tiles) {
      for (let dx = 0; dx < t.w; dx++) {
        for (let dy = 0; dy < t.h; dy++) {
          occupied.add(`${t.x + dx},${t.y + dy}`);
        }
      }
    }
    return occupied;
  }

  function findFreeSlot(tiles, w, h) {
    const occupied = getOccupiedPositions(tiles);
    let maxY = 0;
    for (const t of tiles) {
      for (let dy = 0; dy < t.h; dy++) {
        if (t.y + dy > maxY) maxY = t.y + dy;
      }
    }
    for (let y = 0; y <= maxY + 4; y++) {
      for (let x = 0; x <= state.columns - w; x++) {
        let free = true;
        for (let dx = 0; dx < w && free; dx++) {
          for (let dy = 0; dy < h && free; dy++) {
            if (occupied.has(`${x + dx},${y + dy}`)) free = false;
          }
        }
        if (free) return { x, y };
      }
    }
    return { x: 0, y: maxY + 1 };
  }

  function compactGrid(tiles) {
    const sorted = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
    const placed = [];
    for (const tile of sorted) {
      const slot = findFreeSlot(placed, tile.w, tile.h);
      placed.push({ ...tile, x: slot.x, y: slot.y });
    }
    return placed;
  }

  function getAcValue(value) {
    if (value && typeof value === 'object' && value.acs) {
      const keys = Object.keys(value.acs);
      const total = keys.length;
      const covered = keys.filter(k => value.acs[k].passed).length;
      const pct = total > 0 ? (covered / total) * 100 : 0;
      return { pct, total, covered, acs: value.acs, raw: value };
    }
    return null;
  }

  function setCustomValues(vals) {
    state.customValues = vals || {};
  }

  function setCampaigns(campaigns, selectedId) {
    state.campaigns = campaigns || [];
    if (selectedId && state.campaigns.some(c => c.id === selectedId)) {
      state.selectedRfcCampaignId = selectedId;
    } else if (state.campaigns.length > 0) {
      state.selectedRfcCampaignId = state.campaigns[0].id;
    } else {
      state.selectedRfcCampaignId = null;
    }
  }

  function renderGrid(container, tiles, columns) {
    state.columns = columns || state.columns;
    state.tiles = tiles;
    container.style.gridTemplateColumns = `repeat(${state.columns}, 1fr)`;
    container.innerHTML = '';

    if (!tiles || tiles.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">◆</div>
          <div class="empty-state-text">Noch keine KPIs auf diesem Dashboard</div>
          <div class="empty-state-hint">Klicke auf „+ KPI hinzufügen", um dein Dashboard zu befüllen</div>
        </div>`;
      return;
    }

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const kpi = state.kpiMap[tile.kpi_id];
      if (!kpi) continue;
      const el = createTileElement(tile, kpi);
      el.style.gridColumn = `${tile.x + 1} / span ${tile.w}`;
      el.style.gridRow = `${tile.y + 1} / span ${tile.h}`;
      el.style.animationDelay = `${i * 30}ms`;
      container.appendChild(el);
    }

    drawAllCharts(container);
    setupDragDrop(container);
    setupResize(container);
  }

  function isResponseComparisonValue(val) {
    return val && typeof val === 'object' && val.versionData && val.testSituations;
  }

  function isTimeEvolutionValue(val) {
    return val && typeof val === 'object' && val.versionData && val.xAxisOrder && val.testSituations;
  }

  function drawAllCharts(container) {
    requestAnimationFrame(() => {
      const canvases = container.querySelectorAll('.tile-chart');
      for (const canvas of canvases) {
        const tile = canvas.closest('.tile');
        if (!tile) continue;
        const tileId = tile.dataset.tileId;
        const tileData = state.tiles.find(t => t.id === tileId);
        if (!tileData) continue;
        const kpi = state.kpiMap[tileData.kpi_id];
        if (!kpi) continue;
        const customVal = state.customValues[tileData.kpi_id];
        const rawValue = customVal !== undefined ? customVal : kpi.example_value;
        const acInfo = getAcValue(rawValue);
        const rcInfo = isResponseComparisonValue(rawValue);
        const teInfo = isTimeEvolutionValue(rawValue);
        const value = acInfo ? acInfo.pct : (rcInfo || teInfo ? null : rawValue);
        const status = (rcInfo || teInfo) ? 'neutral' : getStatus(kpi, value);
        const chartType = ChartEngine.getChartType(kpi);

        if (chartType === 'donut') {
          ChartEngine.drawDonut(canvas, value, kpi.unit, status);
        } else if (chartType === 'response-comparison' && rcInfo) {
          ChartEngine.drawResponseComparison(canvas, rawValue);
        } else if (chartType === 'time-evolution' && teInfo) {
          ChartEngine.drawTimeEvolution(canvas, rawValue, true);
        } else if (chartType !== 'numeric') {
          ChartEngine.drawBar(canvas, value, kpi.unit, status, kpi.thresholds);
        }
      }
    });
  }

  function getStatus(kpi, value) {
    if (value === undefined || value === null) return 'neutral';
    if (!kpi.thresholds) return 'neutral';
    const t = kpi.thresholds;
    const v = Number(value);
    const check = (op, threshold) => {
      switch (op) {
        case 'lt': return v < threshold;
        case 'gt': return v > threshold;
        case 'lte': return v <= threshold;
        case 'gte': return v >= threshold;
        case 'eq': return v === threshold;
        default: return false;
      }
    };
    if (t.red && check(t.red.operator, t.red.value)) return 'red';
    if (t.yellow && check(t.yellow.operator, t.yellow.value)) return 'yellow';
    if (t.green && check(t.green.operator, t.green.value)) return 'green';
    return 'neutral';
  }

  function createTileElement(tile, kpi) {
    const customVal = state.customValues[tile.kpi_id];
    const rawValue = customVal !== undefined ? customVal : kpi.example_value;
    const acInfo = getAcValue(rawValue);
    const rcInfo = isResponseComparisonValue(rawValue);
    const teInfo = isTimeEvolutionValue(rawValue);
    const value = acInfo ? acInfo.pct : (rcInfo || teInfo ? null : rawValue);
    const status = (rcInfo || teInfo) ? 'neutral' : getStatus(kpi, value);
    const el = document.createElement('div');
    const isAcKpi = !!acInfo;
    const isRcKpi = !!rcInfo;
    const isTeKpi = !!teInfo;
    let extraClass = '';
    if (isAcKpi) extraClass += ' tile--ac';
    if (isRcKpi) extraClass += ' tile--rc';
    if (isTeKpi) extraClass += ' tile--te';
    el.className = `tile status-${status}${extraClass}`;
    el.dataset.tileId = tile.id;
    el.draggable = true;

    const statusLabels = { green: 'Gut', yellow: 'Warnung', red: 'Kritisch', neutral: 'Keine Daten' };
    const chartType = ChartEngine.getChartType(kpi);

    let acListHtml = '';
    if (isAcKpi) {
      const dots = { true: 'green', false: 'red' };
      acListHtml = `<div class="tile-ac-list">`;
      for (const [acId, ac] of Object.entries(acInfo.acs)) {
        acListHtml += `
          <div class="tile-ac-item" data-ac="${acId}" data-ac-text="${ac.text.replace(/"/g, '&quot;')}">
            <span class="tile-ac-dot ${dots[ac.passed]}"></span>
            <span class="tile-ac-name">${acId}</span>
          </div>`;
      }
      acListHtml += `</div>`;
    }

    let rcTableHtml = '';
    if (isRcKpi) {
      const versions = [rawValue.currentVersion, rawValue.previousVersion, rawValue.referenceVersion];
      const versionLabels = ['Aktuell', 'Vorher', 'Referenz'];
      const versionColors = ['status-green', 'status-blue', 'status-red'];
      const sits = rawValue.testSituations;

      const computeTrend = (current, previous) => {
        if (current === null || previous === null) return '';
        const diff = current - previous;
        const pct = previous !== 0 ? (diff / previous) * 100 : 0;
        const absPct = Math.abs(pct);
        if (absPct < 10) return '<span class="trend-neutral" title="Innerhalb ±10 % — tolerierbare Abweichung">—</span>';
        if (pct < 0) return '<span class="trend-up" title="Verbesserung um ' + (-diff).toFixed(1) + ' ms (' + (-pct).toFixed(1) + ' %)">▲</span>';
        if (pct < 25) return '<span class="trend-warn" title="Verschlechterung um ' + diff.toFixed(1) + ' ms (' + pct.toFixed(1) + ' %)">▲</span>';
        return '<span class="trend-down" title="Verschlechterung um ' + diff.toFixed(1) + ' ms (' + pct.toFixed(1) + ' %)">▼</span>';
      };

      rcTableHtml = `
        <div class="tile-rc-versions">
          ${versions.map((v, i) => `<span class="tile-rc-version-tag ${versionColors[i]}">${versionLabels[i]}: ${v}</span>`).join('')}
        </div>
        <div class="tile-rc-table-wrap">
          <table class="tile-rc-table">
            <thead>
              <tr>
                <th>Testsituation</th>
                <th class="col-current">${rawValue.currentVersion}</th>
                <th class="col-prev">${rawValue.previousVersion}</th>
                <th class="col-ref">${rawValue.referenceVersion}</th>
                <th class="col-trend">Trend</th>
              </tr>
            </thead>
            <tbody>
              ${sits.map((sit, si) => {
                const vals = versions.map(v => {
                  const vd = rawValue.versionData[v];
                  return vd && vd[si] !== null && vd[si] !== undefined ? vd[si] : null;
                });
                const fmt = (v) => v !== null ? v + ' ms' : 'n.a.';
                return `
                  <tr>
                    <td class="tile-rc-sit">${sit}</td>
                    <td class="col-current">${fmt(vals[0])}</td>
                    <td class="col-prev">${fmt(vals[1])}</td>
                    <td class="col-ref">${fmt(vals[2])}</td>
                    <td class="col-trend">${computeTrend(vals[0], vals[1])}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="tile-rc-actions">
          <button class="tile-rc-chart-btn" title="Diagramm anzeigen">📊 Diagramm anzeigen</button>
        </div>`;
    }

    let teTableHtml = '';
    if (isTeKpi) {
      const versions = rawValue.xAxisOrder;
      const sits = rawValue.testSituations;
      const lineColors = ['#6366f1', '#22c55e', '#eab308', '#f97316', '#ef4444', '#3b82f6'];

      teTableHtml = `
        <div class="tile-te-versions">
          <span class="tile-rc-version-tag status-green">Aktuell: ${rawValue.latestVersion}</span>
          <span class="tile-rc-version-tag status-blue">Vorher: ${rawValue.previousVersion}</span>
        </div>
        <div class="tile-rc-table-wrap">
          <table class="tile-rc-table">
            <thead>
              <tr>
                <th>Release</th>
                ${sits.map((sit, si) => `<th style="color:${lineColors[si]}">${sit}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${versions.map((ver, vi) => {
                const vals = rawValue.versionData[ver] || [];
                return `
                  <tr>
                    <td class="tile-rc-sit">${ver}</td>
                    ${sits.map((_, si) => {
                      const v = vals[si];
                      if (v === null || v === undefined) return '<td style="color:var(--text-muted)">—</td>';
                      return `<td>${v.toFixed(2)} s</td>`;
                    }).join('')}
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="tile-rc-actions">
          <button class="tile-te-chart-btn" title="Diagramm anzeigen">📊 Diagramm anzeigen</button>
        </div>`;
    }

    let chartAreaHtml = '';
    if (isRcKpi) {
      chartAreaHtml = `<div class="tile-chart-area tile-chart-area--rc"></div>`;
    } else if (isTeKpi) {
      chartAreaHtml = `<div class="tile-chart-area"><canvas class="tile-chart" data-chart-type="time-evolution"></canvas></div>`;
    } else if (chartType === 'numeric') {
      chartAreaHtml = `
        <div class="tile-chart-area tile-chart-area--numeric">
          <div class="tile-numeric-value">${value} <span class="tile-numeric-unit">${kpi.unit || ''}</span></div>
        </div>`;
    } else {
      chartAreaHtml = `
        <div class="tile-chart-area">
          <canvas class="tile-chart" data-chart-type="${chartType}"></canvas>
          <span class="tile-status-badge">${statusLabels[status]}</span>
        </div>`;
    }

    let rfcVersionHtml = '';
    if (tile.kpi_id === 'rfc-tests') {
      let optionsHtml = '<option value="">Version wählen...</option>';
      for (const c of state.campaigns) {
        const selected = c.id === state.selectedRfcCampaignId ? ' selected' : '';
        optionsHtml += `<option value="${c.id}"${selected}>${c.version}</option>`;
      }
      rfcVersionHtml = `<select class="tile-rfc-version-select">${optionsHtml}</select>`;
    }

    const hasResizeHandle = chartType !== 'numeric' || tile.kpi_id === 'rfc-tests';

    el.innerHTML = `
      <div class="tile-status-bar"></div>
      <div class="tile-header">
        <span class="tile-name">${kpi.name}</span>
        ${rfcVersionHtml}
        <div class="tile-actions">
          <button class="tile-btn tile-btn-print" title="Als Bild speichern" aria-label="Als Bild speichern"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
          <button class="tile-btn tile-btn-info" title="Details">ℹ</button>
          <button class="tile-btn tile-btn-remove" title="Entfernen">✕</button>
        </div>
      </div>
      ${isRcKpi ? rcTableHtml : ''}
      ${isTeKpi ? teTableHtml : ''}
      ${chartAreaHtml}
      ${acListHtml}
      <div class="tile-footer">
        <span>${kpi.category === 'dev' ? 'Entwicklung' : 'Betrieb'}${isAcKpi ? ` · ${acInfo.covered}/${acInfo.total} ACs` : ''}${isRcKpi ? ` · ${rawValue.testSituations.length} Testsituationen` : ''}${isTeKpi ? ` · ${rawValue.xAxisOrder.length} Releases · ${rawValue.testSituations.length} Dim.` : ''}</span>
        <button class="tile-info-btn" data-kpi-id="${kpi.id}">Details</button>
      </div>
      ${hasResizeHandle ? '<div class="tile-resize-handle"></div>' : ''}
    `;

    el.querySelector('.tile-btn-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      const evt = new CustomEvent('tile:remove', { detail: { tileId: tile.id } });
      document.dispatchEvent(evt);
    });

    el.querySelector('.tile-btn-print').addEventListener('click', (e) => {
      e.stopPropagation();
      downloadTileAsImage(el, kpi.name);
    });

    el.querySelector('.tile-btn-info').addEventListener('click', (e) => {
      e.stopPropagation();
      const evt = new CustomEvent('tile:info', { detail: { kpi } });
      document.dispatchEvent(evt);
    });

    el.querySelector('.tile-info-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const evt = new CustomEvent('tile:info', { detail: { kpi } });
      document.dispatchEvent(evt);
    });

    const versionSelect = el.querySelector('.tile-rfc-version-select');
    if (versionSelect) {
      versionSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        const evt = new CustomEvent('tile:rfc-campaign-change', {
          detail: { campaignId: e.target.value }
        });
        document.dispatchEvent(evt);
      });
    }

    if (!isRcKpi && kpi.data_source_type !== 'computed') {
      el.querySelector('.tile-chart-area').addEventListener('click', (e) => {
        if (e.target.closest('.tile-edit-input')) return;
        e.stopPropagation();
        startValueEdit(el, tile, kpi);
      });
    }

    if (isRcKpi) {
      const chartBtn = el.querySelector('.tile-rc-chart-btn');
      if (chartBtn) {
        chartBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rcVal = state.customValues[tile.kpi_id] !== undefined
            ? state.customValues[tile.kpi_id] : kpi.example_value;
          const evt = new CustomEvent('tile:chart-modal', {
            detail: { kpiId: tile.kpi_id, kpi, data: rcVal }
          });
          document.dispatchEvent(evt);
        });
      }
    }

    if (isTeKpi) {
      const chartBtn = el.querySelector('.tile-te-chart-btn');
      if (chartBtn) {
        chartBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const teVal = state.customValues[tile.kpi_id] !== undefined
            ? state.customValues[tile.kpi_id] : kpi.example_value;
          const evt = new CustomEvent('tile:chart-modal', {
            detail: { kpiId: tile.kpi_id, kpi, data: teVal }
          });
          document.dispatchEvent(evt);
        });
      }
    }

    if (isAcKpi) {
      el.querySelectorAll('.tile-ac-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const acId = item.dataset.ac;
          const acText = item.dataset.acText;
          const evt = new CustomEvent('tile:ac-detail', {
            detail: { kpiName: kpi.name, acId, acText, kpiId: tile.kpi_id }
          });
          document.dispatchEvent(evt);
        });
      });
    }

    return el;
  }

  function startValueEdit(el, tile, kpi) {
    const chartArea = el.querySelector('.tile-chart-area');
    if (!chartArea || chartArea.querySelector('.tile-edit-input')) return;
    const current = state.customValues[tile.kpi_id] !== undefined
      ? state.customValues[tile.kpi_id] : kpi.example_value;
    if (current && typeof current === 'object') {
      toast('Komplexe Werte (AC/RC/TE) im Werte-Tab bearbeiten');
      return;
    }
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.className = 'tile-edit-input';
    input.value = current;

    const commit = () => {
      const raw = input.value.trim();
      if (raw === '') return;
      const num = parseFloat(raw);
      if (isNaN(num)) return;
      input.remove();
      const evt = new CustomEvent('tile:value-change', {
        detail: { kpiId: tile.kpi_id, tileId: tile.id, value: num }
      });
      document.dispatchEvent(evt);
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') { input.remove(); }
    });

    chartArea.appendChild(input);
    input.focus();
    input.select();
  }

  function formatValue(value, unit) {
    if (value === undefined || value === null) return '—';
    if (unit === '%' || unit === 'req/min') return value;
    if (value >= 1000) return value.toLocaleString('de-DE');
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(1);
  }

  /* ===== Drag & Drop ===== */
  function setupDragDrop(container) {
    let dragTileId = null;

    container.addEventListener('dragstart', (e) => {
      const tile = e.target.closest('.tile');
      if (!tile) return;
      dragTileId = tile.dataset.tileId;
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragTileId);
    });

    container.addEventListener('dragend', (e) => {
      const tile = e.target.closest('.tile');
      if (tile) tile.classList.remove('dragging');
      container.querySelectorAll('.tile.drag-over').forEach(el => el.classList.remove('drag-over'));
      dragTileId = null;
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('.tile');
      if (target) target.classList.add('drag-over');
    });

    container.addEventListener('dragleave', (e) => {
      const target = e.target.closest('.tile');
      if (target) target.classList.remove('drag-over');
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      container.querySelectorAll('.tile.drag-over').forEach(el => el.classList.remove('drag-over'));
      const targetTile = e.target.closest('.tile');
      if (!targetTile || !dragTileId) return;
      const targetId = targetTile.dataset.tileId;
      if (dragTileId === targetId) return;

      const evt = new CustomEvent('tile:swap', {
        detail: { sourceId: dragTileId, targetId }
      });
      document.dispatchEvent(evt);
    });
  }

  /* ===== Resize ===== */
  function setupResize(container) {
    container.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.tile-resize-handle');
      if (!handle) return;
      e.preventDefault();
      const tile = handle.closest('.tile');
      const tileId = tile.dataset.tileId;
      const startX = e.clientX;
      const startY = e.clientY;

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const tileW = tile.offsetWidth;
        const tileH = tile.offsetHeight;
        const cellW = tileW / (tile.style.gridColumn.split('span ')[1] || 1);
        const cellH = tileH / (tile.style.gridRow.split('span ')[1] || 1);
        let newW = Math.max(1, Math.min(state.columns, Math.round((tileW + dx) / cellW)));
        let newH = Math.max(1, Math.min(4, Math.round((tileH + dy) / cellH)));

        const tileData = state.tiles.find(t => t.id === tileId);
        if (tileData && tileData.kpi_id === 'rfc-tests') {
          const size = Math.max(newW, newH, 1);
          newW = size;
          newH = size;
        }

        tile.style.gridColumn = `${tile.style.gridColumn.split('/')[0].trim()} / span ${newW}`;
        tile.style.gridRow = `${tile.style.gridRow.split('/')[0].trim()} / span ${newH}`;
        handle.dataset.newW = newW;
        handle.dataset.newH = newH;
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const nw = parseInt(handle.dataset.newW) || 1;
        const nh = parseInt(handle.dataset.newH) || 1;
        const evt = new CustomEvent('tile:resize', {
          detail: { tileId, w: nw, h: nh }
        });
        document.dispatchEvent(evt);
        delete handle.dataset.newW;
        delete handle.dataset.newH;
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function toast(msg) {
    const evt = new CustomEvent('app:toast', { detail: { message: msg } });
    document.dispatchEvent(evt);
  }

  function downloadTileAsImage(el, name) {
    const safe = name.replace(/[^a-zA-Z0-9]/g, '_');
    if (typeof html2canvas === 'undefined') {
      toast('html2canvas nicht geladen');
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    html2canvas(el, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: null,
      onclone: doc => injectCssVars(doc)
    }).then(canvas => {
      const link = document.createElement('a');
      link.download = `${safe}_${date}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast(`„${name}" als PNG gespeichert`);
    }).catch(() => {
      toast('Fehler beim Erstellen des Bildes');
    });
  }

  function injectCssVars(doc) {
    const root = doc.documentElement;
    const src = document.documentElement;
    const props = ['--bg','--surface','--surface-hover','--border','--text','--text-muted','--primary','--primary-hover','--green','--green-bg','--yellow','--yellow-bg','--red','--red-bg','--neutral','--neutral-bg','--radius','--shadow','--transition'];
    for (const p of props) {
      const v = getComputedStyle(src).getPropertyValue(p).trim();
      if (v) root.style.setProperty(p, v);
    }
  }

  return { init, renderGrid, compactGrid, findFreeSlot, getStatus, setCustomValues, setCampaigns, onUpdate, getState: () => state };
})();
