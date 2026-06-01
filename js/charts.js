const ChartEngine = (() => {
  'use strict';

  function getChartType(kpi) {
    if (kpi.unit === '%') return 'donut';
    const donutIds = [
      'uptime', 'pass-fail-rate', 'test-coverage-code', 'test-coverage-req',
      'test-automation-rate', 'flaky-test-rate', 'code-review-coverage',
      'change-failure-rate', 'failed-releases', 'error-log-density',
      'error-rate-5xx', 'cpu-mem-usage', 'backup-success-rate'
    ];
    if (donutIds.includes(kpi.id)) return 'donut';
    if (kpi.id === 'fe-response-dev' || kpi.id === 'fe-response-sta') return 'response-comparison';
    if (kpi.unit === 'Anzahl' || kpi.unit === 'Tests' || kpi.unit === 'PT') return 'numeric';
    return 'bar';
  }

  function getStatusColor(status) {
    return { green: '#22c55e', yellow: '#eab308', red: '#ef4444', neutral: '#6b7280' }[status] || '#6b7280';
  }

  function drawDonut(canvas, value, unit, status) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(w, h) / 2 - 6;
    const innerR = outerR * 0.6;
    const lw = outerR - innerR;

    const pct = Math.min(Math.max(value / 100, 0), 1);

    ctx.beginPath();
    ctx.arc(cx, cy, outerR - lw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = lw;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, outerR - lw / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = getStatusColor(status);
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    ctx.stroke();

    const displayVal = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    ctx.fillStyle = '#e4e6ef';
    ctx.font = `bold ${Math.round(outerR * 0.4)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayVal, cx, cy - 6);

    if (unit) {
      ctx.fillStyle = '#888ca3';
      ctx.font = `${Math.round(outerR * 0.18)}px -apple-system, sans-serif`;
      ctx.fillText(unit, cx, cy + outerR * 0.3);
    }
  }

  function drawBar(canvas, value, unit, status, thresholds) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = 8;
    const barX = pad;
    const barY = h * 0.35;
    const barW = w - pad * 2;
    const barH = h * 0.3;

    let maxVal = value * 1.5;
    if (thresholds) {
      const tVals = Object.values(thresholds).map(t => t.value);
      maxVal = Math.max(maxVal, ...tVals) * 1.3;
    }
    if (maxVal <= 0) maxVal = 100;

    const pct = Math.min(value / maxVal, 1);

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 4);
    ctx.fill();

    if (pct > 0) {
      ctx.fillStyle = getStatusColor(status);
      ctx.beginPath();
      ctx.roundRect(barX, barY, Math.max(barW * pct, 4), barH, 4);
      ctx.fill();
    }

    if (thresholds) {
      for (const key of ['green', 'yellow', 'red']) {
        const t = thresholds[key];
        if (!t) continue;
        const tPct = Math.min(t.value / maxVal, 1);
        ctx.strokeStyle = getStatusColor(key);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(barX + barW * tPct, barY + 2);
        ctx.lineTo(barX + barW * tPct, barY + barH - 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    const displayVal = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    ctx.fillStyle = '#e4e6ef';
    ctx.font = `bold 13px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayVal + (unit ? ' ' + unit : ''), w / 2, h * 0.2);
  }

  function drawMiniDonut(canvas, value, status) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(w, h) / 2 - 4;
    const innerR = outerR * 0.55;
    const lw = outerR - innerR;

    const pct = Math.min(Math.max(value / 100, 0), 1);
    if (status === undefined) status = value >= 80 ? 'green' : value >= 50 ? 'yellow' : 'red';

    ctx.beginPath();
    ctx.arc(cx, cy, outerR - lw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = lw;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, outerR - lw / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = getStatusColor(status);
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    ctx.stroke();

    ctx.fillStyle = '#888ca3';
    ctx.font = `bold ${Math.round(outerR * 0.35)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(value), cx, cy);
  }

  function drawResponseComparison(canvas, data) {
    const dpr = window.devicePixelRatio || 1;

    canvas.style.width = '100%';
    canvas.style.height = '100%';

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    /* read theme colors from CSS */
    const cs = getComputedStyle(document.documentElement);
    const textColor = cs.getPropertyValue('--text').trim() || '#e4e6ef';
    const mutedColor = cs.getPropertyValue('--text-muted').trim() || '#888ca3';
    const rowColor = cs.getPropertyValue('--row-stripe').trim() || 'rgba(255,255,255,0.025)';

    const situations = data.testSituations;
    const numRows = situations.length;
    const versions = [data.currentVersion, data.previousVersion, data.referenceVersion];
    const colors = ['#22c55e', '#818cf8', '#ef4444'];
    const versionLabels = ['Aktuell', 'Vorher', 'Referenz'];

    /* ---- layout split: chart (top) + value table (bottom) ---- */
    const chartShare = 0.44;
    const chartBottom = Math.round(h * chartShare);

    /* chart-area padding */
    const pad = {
      top: Math.max(12, Math.round(h * 0.015)),
      left: Math.max(55, Math.round(w * 0.06)),
      right: Math.max(10, Math.round(w * 0.015))
    };
    pad.bottom = Math.max(18, Math.round((chartBottom - pad.top) * 0.12));

    const chartH = chartBottom - pad.top - pad.bottom;
    const chartW = w - pad.left - pad.right;

    /* per-group width for the 26 test situations */
    const groupW = chartW / numRows;
    const barW = Math.max(4, Math.round(groupW * 0.18));
    const barGap = Math.max(2, Math.round(barW * 0.3));
    const groupOffset = (groupW - (barW * 3 + barGap * 2)) / 2;

    /* font sizes */
    const labelFontSize = Math.min(Math.max(9, Math.round(groupW * 0.2)), 12);
    const axisFontSize = Math.min(Math.max(9, Math.round(groupW * 0.14)), 12);
    const tableHeaderFont = Math.min(Math.max(11, Math.round((h - chartBottom) * 0.05)), 13);
    const tableFontSize = Math.max(9, Math.min(Math.round((h - chartBottom) * 0.04), 12));

    const barRound = Math.min(2, Math.round(barW * 0.25));

    /* max value */
    let maxVal = 0;
    for (const v of versions) {
      const vals = data.versionData[v] || [];
      for (const val of vals) {
        if (val !== null && val > maxVal) maxVal = val;
      }
    }
    if (maxVal <= 0) maxVal = 1;

    ctx.clearRect(0, 0, w, h);

    /* ---- VERTICAL BAR CHART ---- */

    /* y-axis gridlines + labels */
    const ySteps = 4;
    for (let s = 0; s <= ySteps; s++) {
      const y = pad.top + (chartH / ySteps) * (ySteps - s);
      const val = (maxVal / ySteps) * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = mutedColor;
      ctx.font = `${axisFontSize}px -apple-system, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(val) + ' ms', pad.left - 5, y);
    }

    /* bars — vertical, grouped */
    for (let i = 0; i < numRows; i++) {
      const gx = pad.left + i * groupW + groupOffset;
      for (let vi = 0; vi < versions.length; vi++) {
        const vals = data.versionData[versions[vi]] || [];
        const val = vals[i];
        const bx = gx + vi * (barW + barGap);
        const bh = val !== null && val !== undefined ? Math.max((val / maxVal) * chartH, 2) : 0;
        const by = pad.top + chartH - bh;

        ctx.fillStyle = colors[vi];
        ctx.beginPath();
        ctx.roundRect(bx, by, barW, bh, barRound);
        ctx.fill();
      }
    }

    /* x-axis index numbers (1–26) just below bar bottom */
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${axisFontSize}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const idxY = pad.top + chartH + 2;
    for (let i = 0; i < numRows; i++) {
      const cx = pad.left + i * groupW + groupW / 2;
      ctx.fillText(String(i + 1), cx, idxY);
    }

    /* ---- separator line between chart and table ---- */
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, chartBottom);
    ctx.lineTo(w, chartBottom);
    ctx.stroke();

    /* ---- VALUE TABLE ---- */
    const tPad = 6;
    const tLeft = tPad;
    const tRight = w - tPad;
    const tWidth = tRight - tLeft;
    const tableStartY = chartBottom + 14;

    /* column widths: # + situation name + 3 value columns + trend */
    const idxColW = Math.round(tWidth * 0.06);
    const sitColW = Math.round(tWidth * 0.28);
    const valColW = Math.round(tWidth * 0.17);
    const trendColW = Math.round(tWidth * 0.12);
    const headerY = tableStartY;

    /* table header */
    ctx.font = `600 ${tableHeaderFont}px -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = mutedColor;
    ctx.fillText('#', tLeft + idxColW / 2, headerY);
    ctx.textAlign = 'left';
    ctx.fillStyle = textColor;
    ctx.fillText('Testsituation', tLeft + idxColW + 4, headerY);

    for (let vi = 0; vi < versions.length; vi++) {
      const tx = tLeft + idxColW + sitColW + vi * valColW;
      ctx.fillStyle = colors[vi];
      ctx.textAlign = 'center';
      ctx.fillText(versionLabels[vi], tx + valColW / 2, headerY);
    }

    /* trend header */
    const trendHdrX = tLeft + idxColW + sitColW + versions.length * valColW;
    ctx.fillStyle = mutedColor;
    ctx.textAlign = 'center';
    ctx.fillText('Trend', trendHdrX + trendColW / 2, headerY);

    /* header underline */
    const headerBottomY = headerY + tableHeaderFont * 0.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tLeft, headerBottomY + 2);
    ctx.lineTo(tRight, headerBottomY + 2);
    ctx.stroke();

    /* data rows */
    const availH = h - headerBottomY - 8;
    const rowH_table = Math.min(Math.max(13, Math.floor(availH / numRows)), 18);
    ctx.font = `${tableFontSize}px -apple-system, sans-serif`;

    for (let i = 0; i < numRows; i++) {
      const ry = headerBottomY + 6 + i * rowH_table;
      const sit = situations[i];
      const shortSit = sit.length > 30 ? sit.substring(0, 28) + '…' : sit;

      /* alternating bg */
      if (i % 2 === 1) {
        ctx.fillStyle = rowColor;
        ctx.fillRect(tLeft, ry - rowH_table / 2, tWidth, rowH_table);
      }

      /* row # */
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = mutedColor;
      ctx.font = `600 ${tableFontSize}px -apple-system, sans-serif`;
      ctx.fillText(String(i + 1), tLeft + idxColW / 2, ry);

      /* situation name */
      ctx.textAlign = 'left';
      ctx.fillStyle = textColor;
      ctx.fillText(shortSit, tLeft + idxColW + 4, ry);
      ctx.font = `${tableFontSize}px -apple-system, sans-serif`;

      /* version values */
      const curVals = data.versionData[versions[0]] || [];
      const prvVals = data.versionData[versions[1]] || [];
      for (let vi = 0; vi < versions.length; vi++) {
        const vals = data.versionData[versions[vi]] || [];
        const val = vals[i];
        const tx = tLeft + idxColW + sitColW + vi * valColW;
        ctx.fillStyle = colors[vi];
        ctx.textAlign = 'center';
        ctx.fillText(val !== null && val !== undefined ? val + ' ms' : 'n.a.', tx + valColW / 2, ry);
      }

      /* trend arrow */
      const cur = curVals[i];
      const prv = prvVals[i];
      const trendTx = tLeft + idxColW + sitColW + versions.length * valColW;
      if (cur !== null && cur !== undefined && prv !== null && prv !== undefined) {
        const diff = cur - prv;
        const pct = prv !== 0 ? (diff / prv) * 100 : 0;
        const absPct = Math.abs(pct);
        let trendChar, trendColor;
        if (absPct < 10) {
          trendChar = '—';
          trendColor = mutedColor;
        } else if (pct < 0) {
          trendChar = '▲';
          trendColor = '#22c55e';
        } else if (pct < 25) {
          trendChar = '▲';
          trendColor = '#eab308';
        } else {
          trendChar = '▼';
          trendColor = '#ef4444';
        }
        ctx.fillStyle = trendColor;
        ctx.textAlign = 'center';
        ctx.font = `700 ${tableFontSize}px -apple-system, sans-serif`;
        ctx.fillText(trendChar, trendTx + trendColW / 2, ry);
        ctx.font = `${tableFontSize}px -apple-system, sans-serif`;
      }
    }
  }

  return { getChartType, drawDonut, drawBar, drawMiniDonut, drawResponseComparison };
})();
