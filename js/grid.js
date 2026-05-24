/* ===== Grid Engine ===== */
const GridEngine = (() => {
  const state = {
    columns: 4,
    tiles: [],
    kpiMap: {},
    customValues: {},
    callbacks: { onUpdate: null }
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

  function setCustomValues(vals) {
    state.customValues = vals || {};
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

    for (const tile of tiles) {
      const kpi = state.kpiMap[tile.kpi_id];
      if (!kpi) continue;
      const el = createTileElement(tile, kpi);
      el.style.gridColumn = `${tile.x + 1} / span ${tile.w}`;
      el.style.gridRow = `${tile.y + 1} / span ${tile.h}`;
      container.appendChild(el);
    }

    drawAllCharts(container);
    setupDragDrop(container);
    setupResize(container);
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
        const value = customVal !== undefined ? customVal : kpi.example_value;
        const status = getStatus(kpi, value);
        const chartType = ChartEngine.getChartType(kpi);

        if (chartType === 'donut') {
          ChartEngine.drawDonut(canvas, value, kpi.unit, status);
        } else {
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
    const value = customVal !== undefined ? customVal : kpi.example_value;
    const status = getStatus(kpi, value);
    const el = document.createElement('div');
    el.className = `tile status-${status}`;
    el.dataset.tileId = tile.id;
    el.draggable = true;

    const statusLabels = { green: '🟢 Gut', yellow: '🟡 Warnung', red: '🔴 Kritisch', neutral: '⚪ Keine Daten' };
    const isCustom = customVal !== undefined;
    const chartType = ChartEngine.getChartType(kpi);

    el.innerHTML = `
      <div class="tile-status-bar"></div>
      <div class="tile-header">
        <span class="tile-name">${kpi.name}</span>
        <div class="tile-actions">
          <button class="tile-btn tile-btn-info" title="Details">ℹ</button>
          <button class="tile-btn tile-btn-remove" title="Entfernen">✕</button>
        </div>
      </div>
      <div class="tile-chart-area">
        <canvas class="tile-chart" data-chart-type="${chartType}"></canvas>
        <span class="tile-status-badge">${statusLabels[status]}</span>
      </div>
      <div class="tile-footer">
        <span>${kpi.category === 'dev' ? 'Entwicklung' : 'Betrieb'}</span>
        <button class="tile-info-btn" data-kpi-id="${kpi.id}">Details</button>
      </div>
      <div class="tile-resize-handle"></div>
    `;

    el.querySelector('.tile-btn-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      const evt = new CustomEvent('tile:remove', { detail: { tileId: tile.id } });
      document.dispatchEvent(evt);
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

    el.querySelector('.tile-chart-area').addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startValueEdit(el, tile, kpi);
    });

    return el;
  }

  function startValueEdit(el, tile, kpi) {
    const chartArea = el.querySelector('.tile-chart-area');
    if (!chartArea || chartArea.querySelector('.tile-edit-input')) return;
    const current = state.customValues[tile.kpi_id] !== undefined
      ? state.customValues[tile.kpi_id] : kpi.example_value;
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
        const newW = Math.max(1, Math.min(state.columns, Math.round((tileW + dx) / cellW)));
        const newH = Math.max(1, Math.min(4, Math.round((tileH + dy) / cellH)));

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

  return { init, renderGrid, compactGrid, findFreeSlot, getStatus, setCustomValues, onUpdate, getState: () => state };
})();
