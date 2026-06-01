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
    return { green: '#22c55e', yellow: '#eab308', red: '#ef4444', blue: '#3b82f6', neutral: '#6b7280' }[status] || '#6b7280';
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
    const bgColor = cs.getPropertyValue('--bg').trim() || '#0f1117';
    const textColor = cs.getPropertyValue('--text').trim() || '#e4e6ef';
    const mutedColor = cs.getPropertyValue('--text-muted').trim() || '#888ca3';
    const rowColor = cs.getPropertyValue('--row-stripe').trim() || 'rgba(255,255,255,0.025)';

    const situations = data.testSituations;
    const numRows = situations.length;
    const versions = [data.currentVersion, data.previousVersion, data.referenceVersion];
    const colors = ['#22c55e', '#818cf8', '#ef4444'];
    const versionLabels = [data.currentVersion, data.previousVersion, 'Referenz'];

    /* ---- layout split: chart (top) + value table (bottom) ---- */
    const chartShare = 0.50;
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
    const tableHeaderFont = Math.min(Math.max(10, Math.round((h - chartBottom) * 0.045)), 12);
    const tableFontSize = Math.max(8, Math.min(Math.round((h - chartBottom) * 0.035), 11));

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
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

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

    /* column widths: # + situation name + 3 value columns + trend + diff */
    const idxColW = Math.round(tWidth * 0.05);
    const sitColW = Math.round(tWidth * 0.22);
    const valColW = Math.round(tWidth * 0.14);
    const trendColW = Math.round(tWidth * 0.10);
    const diffColW = Math.round(tWidth * 0.14);
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
      ctx.textAlign = 'left';
      ctx.fillText(versionLabels[vi], tx, headerY);
    }

    /* trend header */
    const trendHdrX = tLeft + idxColW + sitColW + versions.length * valColW;
    ctx.fillStyle = mutedColor;
    ctx.textAlign = 'center';
    ctx.fillText('Trend', trendHdrX + trendColW / 2, headerY);

    /* diff header */
    const diffHdrX = trendHdrX + trendColW;
    ctx.fillStyle = mutedColor;
    ctx.textAlign = 'left';
    ctx.fillText('Diff', diffHdrX, headerY);

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
    const rowH_table = Math.min(Math.floor(availH / numRows), 18);
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

      /* version values — left-aligned */
      const curVals = data.versionData[versions[0]] || [];
      const prvVals = data.versionData[versions[1]] || [];
      for (let vi = 0; vi < versions.length; vi++) {
        const vals = data.versionData[versions[vi]] || [];
        const val = vals[i];
        const tx = tLeft + idxColW + sitColW + vi * valColW;
        ctx.fillStyle = colors[vi];
        ctx.textAlign = 'left';
        ctx.fillText(val !== null && val !== undefined ? val + ' ms' : 'n.a.', tx, ry);
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

        /* diff value — sign und Zahl getrenkt für saubere Ausrichtung */
        const diffTx = trendTx + trendColW;
        const signX = diffTx + Math.round(diffColW * 0.25);
        const numX = signX + 3;
        if (diff === 0) {
          ctx.fillStyle = mutedColor;
          ctx.textAlign = 'center';
          ctx.fillText('±0', diffTx + diffColW / 2, ry);
        } else {
          const sign = diff > 0 ? '+' : '−';
          ctx.fillStyle = trendColor;
          ctx.textAlign = 'right';
          ctx.fillText(sign, signX, ry);
          ctx.textAlign = 'left';
          ctx.fillText(Math.abs(diff).toFixed(0) + ' ms', numX, ry);
        }
      } else {
        /* diff — n.a. */
        const diffTx = trendTx + trendColW;
        ctx.fillStyle = mutedColor;
        ctx.textAlign = 'center';
        ctx.fillText('—', diffTx + diffColW / 2, ry);
      }
    }
  }

  /* ===== Segmented Donut (Campaign) ===== */
  function drawSegmentedDonut(canvas, passed, failed, blocked, planned) {
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

    const executed = passed + failed + blocked;
    const pct = planned > 0 ? Math.min(executed / planned, 1) : 0;

    /* background arc */
    ctx.beginPath();
    ctx.arc(cx, cy, outerR - lw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = lw;
    ctx.stroke();

    if (pct > 0 && executed > 0) {
      const segments = [
        { count: failed, color: '#ef4444' },
        { count: blocked, color: '#3b82f6' },
        { count: passed, color: '#22c55e' }
      ];
      let angleStart = -Math.PI / 2;
      for (const seg of segments) {
        if (seg.count <= 0) continue;
        const segAngle = (seg.count / executed) * pct * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR - lw / 2, angleStart, angleStart + segAngle);
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'butt';
        ctx.stroke();
        angleStart += segAngle;
      }
    }

    /* center text: percentage */
    const displayPct = Math.round(pct * 100);
    ctx.fillStyle = '#e4e6ef';
    ctx.font = `bold ${Math.round(outerR * 0.35)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayPct, cx, cy);
  }

  /* ===== Campaign Chart (full modal canvas) ===== */
  function drawCampaignChart(canvas, campaignsData) {
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

    const cs = getComputedStyle(document.documentElement);
    const bgColor = cs.getPropertyValue('--bg').trim() || '#0f1117';
    const textColor = cs.getPropertyValue('--text').trim() || '#e4e6ef';
    const mutedColor = cs.getPropertyValue('--text-muted').trim() || '#888ca3';

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    /* ---- Layout: donuts row + table ---- */
    const headerH = Math.round(h * 0.07);
    const donutAreaH = Math.round(h * 0.38);
    const tableStartY = headerH + donutAreaH + 10;

    /* title */
    ctx.fillStyle = textColor;
    ctx.font = `bold ${Math.min(18, Math.round(headerH * 0.5))}px -apple-system, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Testkampagnen — Übersicht', 12, headerH / 2);

    /* separator */
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(w, headerH);
    ctx.stroke();

    /* ---- Donuts row ---- */
    const donutCols = campaignsData.length;
    if (donutCols === 0) return;
    const colW = w / donutCols;
    const donutSize = Math.min(colW * 0.45, donutAreaH * 0.7);
    const miniSize = donutSize * 0.45;

    for (let ci = 0; ci < campaignsData.length; ci++) {
      const camp = campaignsData[ci];
      const cx = colW * ci + colW / 2;
      const donutY = headerH + (donutAreaH - donutSize) / 2;

      /* main donut */
      const totalExec = camp.values.reduce((s, v) => s + (v.passed || 0) + (v.failed || 0) + (v.blocked || 0), 0);
      const totalPlan = camp.values.reduce((s, v) => s + (v.planned || 0), 0);
      const avgPct = totalPlan > 0 ? Math.round((totalExec / totalPlan) * 100) : 0;

      /* draw main donut using helper */
      _drawMiniDonutAt(ctx, cx, donutY, donutSize, camp);

      /* version label under main donut */
      ctx.fillStyle = textColor;
      ctx.font = `bold ${Math.round(donutSize * 0.16)}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(camp.version, cx, donutY + donutSize / 2 + 4);

      /* mini donuts row under version label */
      const miniY = donutY + donutSize / 2 + Math.round(donutSize * 0.22);
      const miniLabels = ['Manual', 'Automation', 'RFC', 'Mobile'];
      for (let mi = 0; mi < 4; mi++) {
        const mx = cx + (mi - 1.5) * (miniSize + 6);
        const v = camp.values[mi] || {};
        _drawMiniDonutAt(ctx, mx, miniY, miniSize, { values: [v] }, true);

        ctx.fillStyle = mutedColor;
        ctx.font = `${Math.round(miniSize * 0.2)}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(miniLabels[mi], mx, miniY + miniSize / 2 + 2);
      }
    }

    /* ---- separator before table ---- */
    const sepY = tableStartY - 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, sepY);
    ctx.lineTo(w, sepY);
    ctx.stroke();

    /* ---- TABLE ---- */
    const tLeft = 8;
    const tRight = w - 8;
    const tWidth = tRight - tLeft;
    const tableTop = tableStartY + 4;

    const colConfig = [
      { label: 'Kampagne', pct: 0.14, align: 'left' },
      { label: 'Bereich', pct: 0.12, align: 'left' },
      { label: 'Geplant', pct: 0.10, align: 'right' },
      { label: 'Bestanden', pct: 0.10, align: 'right' },
      { label: 'Fehlgeschlagen', pct: 0.14, align: 'right' },
      { label: 'Blockiert', pct: 0.10, align: 'right' },
      { label: 'Ausgeführt', pct: 0.12, align: 'right' },
      { label: 'Ausf.-Rate', pct: 0.10, align: 'right' }
    ];

    let colX = tLeft;
    const colStarts = colConfig.map(c => {
      const x = colX;
      colX += Math.round(tWidth * c.pct);
      return x;
    });

    const headerFont = Math.min(11, Math.round((h - tableTop) * 0.045));
    const dataFont = Math.max(8, Math.min(Math.round((h - tableTop) * 0.035), 11));

    ctx.font = `600 ${headerFont}px -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = mutedColor;
    for (let ci = 0; ci < colConfig.length; ci++) {
      ctx.textAlign = colConfig[ci].align;
      const x = colConfig[ci].align === 'right' ? colStarts[ci] + Math.round(tWidth * colConfig[ci].pct) - 2 : colStarts[ci];
      ctx.fillText(colConfig[ci].label, x, tableTop + headerFont * 0.6);
    }

    /* header underline */
    const hdrBottom = tableTop + headerFont * 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tLeft, hdrBottom);
    ctx.lineTo(tRight, hdrBottom);
    ctx.stroke();

    /* data rows */
    const availH = h - hdrBottom - 4;
    const rowH = Math.min(Math.floor(availH / (campaignsData.length * 4 + 1)), 16);
    if (rowH < 8) return;

    let rowIdx = 0;
    const miniLabels2 = ['Manual', 'Automation', 'RFC', 'Mobile'];
    for (const camp of campaignsData) {
      for (let mi = 0; mi < 4; mi++) {
        const ry = hdrBottom + 4 + rowIdx * rowH;
        if (rowIdx % 2 === 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.025)';
          ctx.fillRect(tLeft, ry - rowH / 2, tWidth, rowH);
        }
        const v = camp.values[mi] || {};
        const executed = (v.passed || 0) + (v.failed || 0) + (v.blocked || 0);
        const pct = v.planned > 0 ? Math.round((executed / v.planned) * 100) : 0;
        const cells = [
          rowIdx < 4 ? camp.version : '',
          miniLabels2[mi],
          v.planned || 0,
          v.passed || 0,
          v.failed || 0,
          v.blocked || 0,
          executed,
          pct + '%'
        ];
        ctx.font = `${dataFont}px -apple-system, sans-serif`;
        ctx.fillStyle = textColor;
        for (let ci = 0; ci < cells.length; ci++) {
          ctx.textAlign = colConfig[ci].align;
          const x = colConfig[ci].align === 'right' ? colStarts[ci] + Math.round(tWidth * colConfig[ci].pct) - 2 : colStarts[ci];
          ctx.fillText(String(cells[ci]), x, ry);
        }
        rowIdx++;
      }
    }

    /* summary row */
    if (rowH >= 8) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tLeft, hdrBottom + 4 + rowIdx * rowH);
      ctx.lineTo(tRight, hdrBottom + 4 + rowIdx * rowH);
      ctx.stroke();
      ctx.font = `600 ${dataFont}px -apple-system, sans-serif`;
      const sumPlanned = campaignsData.reduce((s, c) => s + c.values.reduce((s2, v) => s2 + (v.planned || 0), 0), 0);
      const sumPassed = campaignsData.reduce((s, c) => s + c.values.reduce((s2, v) => s2 + (v.passed || 0), 0), 0);
      const sumFailed = campaignsData.reduce((s, c) => s + c.values.reduce((s2, v) => s2 + (v.failed || 0), 0), 0);
      const sumBlocked = campaignsData.reduce((s, c) => s + c.values.reduce((s2, v) => s2 + (v.blocked || 0), 0), 0);
      const sumExec = sumPassed + sumFailed + sumBlocked;
      const sumPct = sumPlanned > 0 ? Math.round((sumExec / sumPlanned) * 100) : 0;
      const summaryCells = ['', 'Gesamt', sumPlanned, sumPassed, sumFailed, sumBlocked, sumExec, sumPct + '%'];
      ctx.fillStyle = textColor;
      for (let ci = 0; ci < summaryCells.length; ci++) {
        ctx.textAlign = colConfig[ci].align;
        const x = colConfig[ci].align === 'right' ? colStarts[ci] + Math.round(tWidth * colConfig[ci].pct) - 2 : colStarts[ci];
        ctx.fillText(String(summaryCells[ci]), x, hdrBottom + 4 + rowIdx * rowH + rowH / 2);
      }
    }
  }

  /* helper: draw one campaign donut cluster or single value donut at given position */
  function _drawMiniDonutAt(ctx, cx, cy, size, camp, singleValue) {
    const outerR = size / 2 - 2;
    const innerR = outerR * 0.55;
    const lw = outerR - innerR;

    let segments;
    if (singleValue) {
      const v = camp.values[0] || {};
      const passed = v.passed || 0;
      const failed = v.failed || 0;
      const blocked = v.blocked || 0;
      const executed = passed + failed + blocked;
      const planned = v.planned || 0;
      const pct = planned > 0 ? Math.min(executed / planned, 1) : 0;
      segments = [];
      if (pct > 0 && executed > 0) {
        segments = [
          { count: failed, color: '#ef4444', pct: (failed / executed) * pct },
          { count: blocked, color: '#3b82f6', pct: (blocked / executed) * pct },
          { count: passed, color: '#22c55e', pct: (passed / executed) * pct }
        ];
      }
    } else {
      const totalExec = camp.values.reduce((s, v) => s + (v.passed || 0) + (v.failed || 0) + (v.blocked || 0), 0);
      const totalPlan = camp.values.reduce((s, v) => s + (v.planned || 0), 0);
      const pct = totalPlan > 0 ? Math.min(totalExec / totalPlan, 1) : 0;
      const totalFailed = camp.values.reduce((s, v) => s + (v.failed || 0), 0);
      const totalBlocked = camp.values.reduce((s, v) => s + (v.blocked || 0), 0);
      const totalPassed = camp.values.reduce((s, v) => s + (v.passed || 0), 0);
      segments = [];
      if (pct > 0 && totalExec > 0) {
        segments = [
          { count: totalFailed, color: '#ef4444', pct: (totalFailed / totalExec) * pct },
          { count: totalBlocked, color: '#3b82f6', pct: (totalBlocked / totalExec) * pct },
          { count: totalPassed, color: '#22c55e', pct: (totalPassed / totalExec) * pct }
        ];
      }
    }

    /* background arc */
    ctx.beginPath();
    ctx.arc(cx, cy, outerR - lw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = lw;
    ctx.stroke();

    /* segmented foreground */
    let angleStart = -Math.PI / 2;
    for (const seg of segments) {
      if (seg.count <= 0) continue;
      const segAngle = seg.pct * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR - lw / 2, angleStart, angleStart + segAngle);
      ctx.strokeStyle = seg.color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'butt';
      ctx.stroke();
      angleStart += segAngle;
    }

    /* percentage text */
    const total = segments.reduce((s, seg) => s + seg.count, 0);
    const allPct = total > 0 ? Math.round(segments.reduce((s, seg) => s + seg.pct, 0) * 100) : 0;
    ctx.fillStyle = '#888ca3';
    ctx.font = `bold ${Math.round(outerR * 0.35)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(allPct, cx, cy);
  }

  return { getChartType, drawDonut, drawBar, drawMiniDonut, drawResponseComparison, drawSegmentedDonut, drawCampaignChart };
})();
