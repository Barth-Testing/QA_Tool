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

    const situations = data.testSituations;
    const numRows = situations.length;
    const versions = [data.currentVersion, data.previousVersion, data.referenceVersion];
    const colors = ['#22c55e', '#6366f1', '#ef4444'];
    const versionLabels = ['Aktuell', 'Vorher', 'Referenz'];

    const pad = {
      top: Math.max(20, Math.round(h * 0.025)),
      bottom: Math.max(40, Math.round(h * 0.05)),
      left: Math.max(150, Math.round(w * 0.14)),
      right: Math.max(70, Math.round(w * 0.06))
    };

    const chartW = Math.max(w - pad.left - pad.right, 100);
    const chartH = Math.max(h - pad.top - pad.bottom, 100);
    const rowH = Math.max(chartH / numRows, 22);

    const labelFontSize = Math.min(Math.max(11, Math.round(rowH * 0.4)), 16);
    const valueFontSize = Math.min(Math.max(10, Math.round(rowH * 0.35)), 14);
    const axisFontSize = Math.min(Math.max(10, Math.round(rowH * 0.3)), 13);

    const barH = Math.max(5, Math.round(rowH * 0.2));
    const barGap = Math.max(2, Math.round(barH * 0.4));

    let maxVal = 0;
    for (const v of versions) {
      const vals = data.versionData[v] || [];
      for (const val of vals) {
        if (val !== null && val > maxVal) maxVal = val;
      }
    }
    if (maxVal <= 0) maxVal = 1;

    ctx.clearRect(0, 0, w, h);

    /* background alternating rows */
    for (let i = 0; i < numRows; i++) {
      if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(pad.left, pad.top + i * rowH, chartW, rowH);
      }
    }

    /* y-axis labels */
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${labelFontSize}px -apple-system, sans-serif`;
    for (let i = 0; i < numRows; i++) {
      const y = pad.top + i * rowH + rowH / 2;
      const sit = situations[i];
      const maxChars = Math.max(15, Math.round(pad.left / (labelFontSize * 0.55)));
      const short = sit.length > maxChars ? sit.substring(0, maxChars - 1) + '…' : sit;
      ctx.fillStyle = '#e4e6ef';
      ctx.fillText(short, pad.left - 10, y);
    }

    /* x-axis grid lines + labels */
    const xSteps = Math.max(4, Math.min(8, Math.round(chartW / 140)));
    ctx.font = `${axisFontSize}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = 0; s <= xSteps; s++) {
      const x = pad.left + (chartW / xSteps) * s;
      const val = (maxVal / xSteps) * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + numRows * rowH);
      ctx.stroke();
      ctx.fillStyle = '#888ca3';
      ctx.fillText(Math.round(val) + ' ms', x, pad.top + numRows * rowH + 4);
    }

    /* bars */
    for (let i = 0; i < numRows; i++) {
      const y = pad.top + i * rowH;
      for (let vi = 0; vi < versions.length; vi++) {
        const vals = data.versionData[versions[vi]] || [];
        const val = vals[i];
        const bx = pad.left;
        const by = y + (rowH - (barH * 3 + barGap * 2)) / 2 + vi * (barH + barGap);
        const bw = val !== null && val !== undefined ? Math.max((val / maxVal) * chartW, 2) : 0;

        ctx.fillStyle = colors[vi];
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, barH, Math.min(3, barH / 2));
        ctx.fill();

        if (val !== null && val !== undefined) {
          ctx.fillStyle = '#888ca3';
          ctx.font = `${valueFontSize}px -apple-system, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(val + ' ms', bx + bw + 6, by + barH / 2);
        }
      }
    }

    /* legend */
    const legendY = h - Math.max(25, pad.bottom * 0.7);
    const legendFontSize = Math.min(labelFontSize + 1, 15);
    ctx.font = `500 ${legendFontSize}px -apple-system, sans-serif`;
    const boxSize = Math.max(12, legendFontSize - 1);
    for (let vi = 0; vi < versions.length; vi++) {
      const lx = pad.left + vi * Math.round(w * 0.16);
      ctx.fillStyle = colors[vi];
      ctx.fillRect(lx, legendY, boxSize, boxSize);
      ctx.fillStyle = '#e4e6ef';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(versions[vi] + ' (' + versionLabels[vi] + ')', lx + boxSize + 8, legendY + boxSize / 2);
    }
  }

  return { getChartType, drawDonut, drawBar, drawMiniDonut, drawResponseComparison };
})();
