/* ===== Grid Engine ===== */
const GridEngine = (() => {
  const state = {
    columns: 4,
    tiles: [],
    kpiMap: {},
    customValues: {},
    callbacks: { onUpdate: null },
    campaigns: [],
    selectedCampaignIds: {}
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

  function setCampaigns(campaigns, selectedMap) {
    state.campaigns = campaigns || [];
    state.selectedCampaignIds = { ...selectedMap };
    if (!state.selectedCampaignIds['rfc-tests']) {
      state.selectedCampaignIds['rfc-tests'] = state.campaigns.length > 0 ? state.campaigns[0].id : null;
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
      const sits = rawValue.testSituations;

      const trendClass = (cur, prv) => {
        if (cur == null || prv == null) return 'trend-neutral';
        const diff = cur - prv;
        const pct = prv !== 0 ? (diff / prv) * 100 : 0;
        const absPct = Math.abs(pct);
        if (absPct < 10) return 'trend-neutral';
        if (pct < 0) return 'trend-up';
        if (pct < 25) return 'trend-warn';
        return 'trend-down';
      };

      const diffSymbol = (diff) => diff > 0 ? '+' : diff < 0 ? '−' : '±';

      const diffClass = (cls) => {
        if (cls === 'trend-up') return 'diff-good';
        if (cls === 'trend-warn') return 'diff-warn';
        if (cls === 'trend-down') return 'diff-bad';
        return 'diff-neutral';
      };

      rcTableHtml = `<div class="tile-rc-table-wrap"><table class="tile-rc-table"><thead><tr>
        <th class="col-idx">#</th>
        <th>Testsituation</th>
        ${versions.map((v, vi) => `<th class="col-${['current','prev','ref'][vi]}">${versionLabels[vi]}</th>`).join('')}
        <th class="col-trend">Trend</th>
        <th class="col-diff">Diff</th>
      </tr></thead><tbody>
      ${sits.map((sit, i) => {
        const cur = (rawValue.versionData[versions[0]] || [])[i];
        const prv = (rawValue.versionData[versions[1]] || [])[i];
        const cls = trendClass(cur, prv);
        const hasData = cur != null && prv != null;
        const diff = hasData ? cur - prv : 0;
        const trendSym = cls === 'trend-neutral' ? '—' : (cls === 'trend-up' ? '▲' : '▼');
        const trendTitle = hasData ? `title="${diff > 0 ? '+' : ''}${diff.toFixed(0)} ms (${prv ? ((diff/prv)*100).toFixed(1) : '0'}%)"` : '';
        const trendHtml = `<span class="${cls}" ${trendTitle}>${trendSym}</span>`;
        const diffHtml = hasData ? `<span class="${diffClass(cls)}">${diffSymbol(diff)}${Math.abs(diff).toFixed(0)} ms</span>` : '<span class="diff-neutral">—</span>';

        return `<tr${i % 2 === 1 ? ' class="row-stripe"' : ''}>
          <td class="col-idx-val">${i + 1}</td>
          <td class="tile-rc-sit" title="${sit.replace(/"/g, '&quot;')}"><span class="tile-rc-sit-text">${sit}</span></td>
          ${versions.map((v, vi) => {
            const val = (rawValue.versionData[v] || [])[i];
            return `<td class="val-${['cur','prv','ref'][vi]}">${val != null ? val + ' ms' : '<span class="na">n.a.</span>'}</td>`;
          }).join('')}
          <td class="col-trend">${trendHtml}</td>
          <td class="col-diff">${diffHtml}</td>
        </tr>`;
      }).join('')}
      </tbody></table></div>`;
    }

    let teTableHtml = '';
    if (isTeKpi) {
      const versions = rawValue.xAxisOrder;
      const sits = rawValue.testSituations;
      const lineColors = ['#6366f1', '#22c55e', '#eab308', '#f97316', '#ef4444', '#3b82f6'];
      const latest = rawValue.latestVersion;
      const defaultComp = getDefaultTEComparison(versions);
      const compA = defaultComp.versionA;
      const compB = defaultComp.versionB;

      const versionOptsA = versions.map(v =>
        `<option value="${v}"${v === compA ? ' selected' : ''}>${v}${v === latest ? ' (aktuell)' : ''}</option>`
      ).join('');
      const versionOptsB = versions.map(v =>
        `<option value="${v}"${v === compB ? ' selected' : ''}>${v}${v === latest ? ' (aktuell)' : ''}</option>`
      ).join('');

      teTableHtml = `
        <div class="te-compare-bar">
          <div class="te-compare-selectors">
            <label class="te-compare-label">Vergleich:</label>
            <select class="te-version-select" data-te-side="a">${versionOptsA}</select>
            <span class="te-compare-vs">vs</span>
            <select class="te-version-select" data-te-side="b">${versionOptsB}</select>
          </div>
          <div class="te-compare-summary" id="te-compare-${tile.id}"></div>
        </div>
        <div class="tile-rc-table-wrap">
          <table class="tile-rc-table te-table">
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
                  <tr class="${ver === latest ? 'te-row-latest' : ''}">
                    <td class="tile-rc-sit">${ver}${ver === latest ? ' <span class="te-latest-badge">aktuell</span>' : ''}</td>
                    ${sits.map((_, si) => {
                      const v = vals[si];
                      if (v === null || v === undefined) return '<td style="color:var(--text-muted)">—</td>';
                      return `<td>${v.toFixed(2)} s</td>`;
                    }).join('')}
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    let chartAreaHtml = '';
    if (isRcKpi) {
      chartAreaHtml = `<div class="tile-chart-area tile-chart-area--rc"><canvas class="tile-chart" data-chart-type="response-comparison"></canvas></div>`;
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

    const campaignTileIds = ['rfc-tests', 'a-bugs-post-release', 'fe-response-dev', 'fe-response-sta', 'recipient-search-time'];
    const rcTileIds = ['fe-response-dev', 'fe-response-sta'];
    let rfcVersionHtml = '';
    if (rcTileIds.includes(tile.kpi_id)) {
      const currentId = state.selectedCampaignIds[tile.kpi_id + '-current'] || (state.campaigns.length > 0 ? state.campaigns[0].id : '');
      const previousId = state.selectedCampaignIds[tile.kpi_id + '-previous'] || '';
      let opts = '<option value="">Version wählen...</option>';
      for (const c of state.campaigns) opts += `<option value="${c.id}">${c.version}</option>`;
      rfcVersionHtml = `
        <div class="tile-rc-selects">
          <label class="tile-rc-select-label">Aktuell
            <select class="tile-rfc-version-select" data-kpi-id="${tile.kpi_id}" data-compare-type="current">${opts.replace('<option value="' + currentId + '">', '<option value="' + currentId + '" selected>')}</select>
          </label>
          <label class="tile-rc-select-label">Vergleich
            <select class="tile-rfc-version-select" data-kpi-id="${tile.kpi_id}" data-compare-type="previous">${previousId ? opts.replace('<option value="' + previousId + '">', '<option value="' + previousId + '" selected>') : opts}</select>
          </label>
        </div>`;
    } else if (campaignTileIds.includes(tile.kpi_id)) {
      const selCampId = state.selectedCampaignIds[tile.kpi_id] || (state.campaigns.length > 0 ? state.campaigns[0].id : '');
      let optionsHtml = '<option value="">Version wählen...</option>';
      for (const c of state.campaigns) {
        const selected = c.id === selCampId ? ' selected' : '';
        optionsHtml += `<option value="${c.id}"${selected}>${c.version}</option>`;
      }
      rfcVersionHtml = `<select class="tile-rfc-version-select" data-kpi-id="${tile.kpi_id}">${optionsHtml}</select>`;
    }

    const hasResizeHandle = chartType !== 'numeric' || campaignTileIds.includes(tile.kpi_id);

    el.innerHTML = `
      <div class="tile-status-bar"></div>
      <div class="tile-header">
        <span class="tile-name">${kpi.name}</span>
        ${rfcVersionHtml}
        <div class="tile-actions">
          <button class="tile-btn tile-btn-print" title="Als Bild speichern" aria-label="Als Bild speichern"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
          ${isRcKpi || isTeKpi ? '<button class="tile-btn tile-btn-chart" title="Diagramm in Dialog anzeigen" aria-label="Diagramm in Dialog anzeigen"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></button>' : ''}
          ${hasResizeHandle ? '<button class="tile-btn tile-btn-resize" title="Größe ändern" aria-label="Größe ändern"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="3" y1="9" x2="9" y2="3"/></svg></button>' : ''}
          <button class="tile-btn tile-btn-info" title="Details">ℹ</button>
          <button class="tile-btn tile-btn-remove" title="Entfernen">✕</button>
        </div>
      </div>
      ${chartAreaHtml}
      ${isRcKpi ? rcTableHtml : ''}
      ${isTeKpi ? teTableHtml : ''}
      ${acListHtml}
      <div class="tile-footer">
        <span>${kpi.category === 'dev' ? 'Entwicklung' : 'Betrieb'}${isAcKpi ? ` · ${acInfo.covered}/${acInfo.total} ACs` : ''}${isRcKpi ? ` · ${rawValue.testSituations.length} Testsituationen` : ''}${isTeKpi ? ` · ${rawValue.xAxisOrder.length} Releases · ${rawValue.testSituations.length} Dim.` : ''}</span>
        <button class="tile-info-btn" data-kpi-id="${kpi.id}">Details</button>
      </div>
    `;

    el.querySelector('.tile-btn-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      const evt = new CustomEvent('tile:remove', { detail: { tileId: tile.id } });
      document.dispatchEvent(evt);
    });

    el.querySelector('.tile-btn-print').addEventListener('click', (e) => {
      e.stopPropagation();
      if (isRcKpi || isTeKpi) {
        const rawValue = state.customValues[tile.kpi_id] !== undefined
          ? state.customValues[tile.kpi_id] : kpi.example_value;
        const evt = new CustomEvent('tile:chart-modal', {
          detail: { kpiId: tile.kpi_id, kpi, data: rawValue }
        });
        document.dispatchEvent(evt);
      } else {
        downloadTileAsImage(el, kpi.name);
      }
    });

    const chartBtn = el.querySelector('.tile-btn-chart');
    if (chartBtn) {
      chartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rawValue = state.customValues[tile.kpi_id] !== undefined
          ? state.customValues[tile.kpi_id] : kpi.example_value;
        const evt = new CustomEvent('tile:chart-modal', {
          detail: { kpiId: tile.kpi_id, kpi, data: rawValue }
        });
        document.dispatchEvent(evt);
      });
    }

    el.querySelector('.tile-btn-info').addEventListener('click', (e) => {
      e.stopPropagation();
      const evt = new CustomEvent('tile:info', { detail: { kpi } });
      document.dispatchEvent(evt);
    });

    const resizeBtn = el.querySelector('.tile-btn-resize');
    if (resizeBtn) {
      resizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const evt = new CustomEvent('tile:resize-dialog', {
          detail: { tileId: tile.id, kpiId: tile.kpi_id, w: tile.w, h: tile.h }
        });
        document.dispatchEvent(evt);
      });
    }

    el.querySelector('.tile-info-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const evt = new CustomEvent('tile:info', { detail: { kpi } });
      document.dispatchEvent(evt);
    });

    const versionSelects = el.querySelectorAll('.tile-rfc-version-select');
    if (versionSelects.length > 0) {
      versionSelects.forEach(sel => {
        sel.addEventListener('change', (e) => {
          e.stopPropagation();
          const kpiId = sel.dataset.kpiId || 'rfc-tests';
          const versionType = sel.dataset.compareType || '';
          const evt = new CustomEvent('tile:rfc-campaign-change', {
            detail: { campaignId: e.target.value, kpiId, versionType }
          });
          document.dispatchEvent(evt);
        });
      });
    }

    if (!isRcKpi && kpi.data_source_type !== 'computed') {
      el.querySelector('.tile-chart-area').addEventListener('click', (e) => {
        if (e.target.closest('.tile-edit-input')) return;
        e.stopPropagation();
        startValueEdit(el, tile, kpi);
      });
    }

    if (isTeKpi) {
      const selA = el.querySelector('.te-version-select[data-te-side="a"]');
      const selB = el.querySelector('.te-version-select[data-te-side="b"]');
      if (selA && selB) {
        const updateComparison = () => {
          renderTEComparison(el, tile, kpi, selA.value, selB.value);
        };
        selA.addEventListener('change', updateComparison);
        selB.addEventListener('change', updateComparison);
        requestAnimationFrame(updateComparison);
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

  /* ===== Time Evolution Helpers ===== */
  function parseTEVersion(ver) {
    const m = ver.match(/R?(\d+)\.(\d+)\.(\d+)/);
    if (!m) return null;
    return { major: parseInt(m[1]), minor: parseInt(m[2]), patch: parseInt(m[3]), raw: ver };
  }

  function getDefaultTEComparison(versions) {
    const parsed = versions.map(v => parseTEVersion(v)).filter(Boolean);
    if (parsed.length < 2) return { versionA: null, versionB: null };
    parsed.sort((a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch);
    const latest = parsed[0];
    const prevMinor = parsed.filter(v => v.minor < latest.minor && v.major === latest.major);
    const latestPrevMinor = prevMinor.length > 0 ? prevMinor.sort((a, b) => b.patch - a.patch)[0] : parsed[1];
    return {
      versionB: latest.raw,
      versionA: latestPrevMinor.raw
    };
  }

  function computeDiffColor(pctDiff, currentBetter) {
    const abs = Math.abs(pctDiff);
    if (abs < 10) return 'diff-neutral';
    if (abs <= 25) return currentBetter ? 'diff-warning-improved' : 'diff-warning-regressed';
    return currentBetter ? 'diff-good' : 'diff-bad';
  }

  function getPctDiff(a, b) {
    if (a == null || b == null || a === 0) return 0;
    return ((b - a) / a) * 100;
  }

  function renderTEComparison(el, tile, kpi, verA, verB) {
    const rawValue = state.customValues[tile.kpi_id] !== undefined
      ? state.customValues[tile.kpi_id] : kpi.example_value;
    if (!rawValue || !rawValue.versionData) return;
    const sits = rawValue.testSituations;
    const lineColors = ['#6366f1', '#22c55e', '#eab308', '#f97316', '#ef4444', '#3b82f6'];
    const valsA = rawValue.versionData[verA] || [];
    const valsB = rawValue.versionData[verB] || [];

    const summaryEl = el.querySelector('#te-compare-' + tile.id);
    if (!summaryEl) return;

    let totalPassed = 0;
    let totalFailed = 0;
    let html = '';

    for (let si = 0; si < sits.length; si++) {
      const a = valsA[si];
      const b = valsB[si];
      const hasData = a != null && b != null;
      const pctDiff = hasData ? getPctDiff(a, b) : 0;
      const absPct = Math.abs(pctDiff);
      const currentBetter = b < a;
      const diffColor = hasData ? computeDiffColor(pctDiff, currentBetter) : 'diff-neutral';
      const isPassed = hasData && currentBetter;
      const isFailed = hasData && !currentBetter;
      if (hasData) {
        if (isPassed) totalPassed++;
        else totalFailed++;
      }

      let statusBadge = '';
      if (hasData && absPct <= 25) {
        statusBadge = isPassed
          ? '<span class="te-badge te-badge-passed">PASSED</span>'
          : '<span class="te-badge te-badge-failed">FAILED</span>';
      }

      html += `
        <div class="te-compare-row">
          <span class="te-compare-sit" style="color:${lineColors[si]}">${sits[si]}</span>
          <span class="te-compare-val">${hasData ? a.toFixed(2) + ' s' : '—'}</span>
          <span class="te-compare-arrow">→</span>
          <span class="te-compare-val te-compare-val-b">${hasData ? b.toFixed(2) + ' s' : '—'}</span>
          <span class="te-compare-diff ${diffColor}">${hasData ? (pctDiff > 0 ? '+' : '') + pctDiff.toFixed(1) + '%' : '—'}</span>
          <span class="te-compare-badge">${statusBadge || ''}</span>
        </div>`;
    }

    resultsEl.innerHTML = html;

    const verdict = totalPassed + totalFailed > 0 && totalPassed >= totalFailed;
    summaryEl.innerHTML = `
      <span class="te-summary-label">Ergebnis:</span>
      <span class="te-summary-count" style="color:var(--green)">${totalPassed} bestanden</span>
      <span class="te-summary-sep">·</span>
      <span class="te-summary-count" style="color:var(--red)">${totalFailed} durchgefallen</span>
      <span class="te-summary-sep">·</span>
      <span class="te-summary-verdict ${verdict ? 'te-verdict-passed' : 'te-verdict-failed'}">${verdict ? 'PASSED' : 'FAILED'}</span>`;
  }

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
  function setupResize(container) {}

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
