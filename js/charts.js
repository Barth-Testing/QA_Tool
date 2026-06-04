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
    if (kpi.id === 'recipient-search-time') return 'time-evolution';
    if (kpi.unit === 'Anzahl' || kpi.unit === 'Tests' || kpi.unit === 'PT') return 'numeric';
    return 'bar';
  }

  function getStatusColor(status) {
    return { green: '#22c55e', yellow: '#eab308', red: '#ef4444', blue: '#3b82f6', neutral: '#6b7280' }[status] || '#6b7280';
  }

  function drawDonut(canvas, value, unit, status) {
    if (value === null || value === undefined || isNaN(value)) {
      value = 0;
      status = 'neutral';
    }
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
    const _dcs = getComputedStyle(document.documentElement);
    const _dText = _dcs.getPropertyValue('--text').trim() || '#e4e6ef';
    const _dMuted = _dcs.getPropertyValue('--text-muted').trim() || '#888ca3';
    const _dBgHex = (_dcs.getPropertyValue('--bg').trim() || '#0f1117').replace('#', '');
    const _dR = parseInt(_dBgHex.substring(0, 2), 16);
    const _dG = parseInt(_dBgHex.substring(2, 4), 16);
    const _dB = parseInt(_dBgHex.substring(4, 6), 16);
    const _dDark = (_dR * 299 + _dG * 587 + _dB * 114) / 1000 < 128;
    const _dBase = _dDark ? 255 : 0;

    ctx.beginPath();
    ctx.arc(cx, cy, outerR - lw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${_dBase},${_dBase},${_dBase},0.15)`;
    ctx.lineWidth = lw;
    ctx.stroke();

    if (pct > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR - lw / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.strokeStyle = getStatusColor(status);
      ctx.lineWidth = lw;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }

    const displayVal = value === 0 ? '0' : (Number.isInteger(value) ? value.toString() : value.toFixed(1));
    ctx.fillStyle = _dText;
    ctx.font = `bold ${Math.round(outerR * 0.4)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayVal, cx, cy - 6);

    if (unit) {
      ctx.fillStyle = _dMuted;
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

    const _bcs = getComputedStyle(document.documentElement);
    const _bBgHex = (_bcs.getPropertyValue('--bg').trim() || '#0f1117').replace('#', '');
    const _bR = parseInt(_bBgHex.substring(0, 2), 16);
    const _bG = parseInt(_bBgHex.substring(2, 4), 16);
    const _bB = parseInt(_bBgHex.substring(4, 6), 16);
    const _bDark = (_bR * 299 + _bG * 587 + _bB * 114) / 1000 < 128;
    const _bBase = _bDark ? 255 : 0;

    ctx.fillStyle = `rgba(${_bBase},${_bBase},${_bBase},0.06)`;
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

    const bc = getComputedStyle(document.documentElement);
    const bText = bc.getPropertyValue('--text').trim() || '#e4e6ef';
    const displayVal = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    ctx.fillStyle = bText;
    ctx.font = 'bold 13px -apple-system, sans-serif';
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
    const _mcs = getComputedStyle(document.documentElement);
    const _mText = _mcs.getPropertyValue('--text').trim() || '#e4e6ef';
    const _mBg = _mcs.getPropertyValue('--bg').trim() || '#0f1117';
    const _mHex = _mBg.replace('#', '');
    const _mR = parseInt(_mHex.substring(0, 2), 16);
    const _mG = parseInt(_mHex.substring(2, 4), 16);
    const _mB = parseInt(_mHex.substring(4, 6), 16);
    const _mDark = (_mR * 299 + _mG * 587 + _mB * 114) / 1000 < 128;
    const _mBase = _mDark ? 255 : 0;

    ctx.beginPath();
    ctx.arc(cx, cy, outerR - lw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${_mBase},${_mBase},${_mBase},0.15)`;
    ctx.lineWidth = lw;
    ctx.stroke();

    if (pct > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, outerR - lw / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.strokeStyle = getStatusColor(status);
      ctx.lineWidth = lw;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }

    ctx.fillStyle = _mText;
    ctx.font = `bold ${Math.round(outerR * 0.35)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(value) + '%', cx, cy);
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
    const surfaceColor = cs.getPropertyValue('--surface').trim() || '#1a1d27';
    const rowStr = cs.getPropertyValue('--row-stripe').trim() || 'rgba(255,255,255,0.025)';

    const situations = data.testSituations;
    const numRows = situations.length;
    const versions = [data.currentVersion, data.previousVersion, data.referenceVersion];
    const colors = ['#22c55e', '#818cf8', '#ef4444'];
    const versionLabels = [data.currentVersion, data.previousVersion, 'Referenz (R3.18.1)'];

    /* ---- layout: header area + chart (top) + value table (bottom) ---- */
    const headerH = 44;
    const chartShare = 0.44;
    const chartBottom = headerH + Math.round((h - headerH) * chartShare);
    const tableTop = chartBottom + 1;

    /* chart-area padding */
    const pad = {
      top: headerH + 10,
      left: Math.max(52, Math.round(w * 0.055)),
      right: Math.max(10, Math.round(w * 0.015))
    };
    pad.bottom = Math.max(16, Math.round((chartBottom - pad.top) * 0.10));

    const chartH = chartBottom - pad.top - pad.bottom;
    const chartW = w - pad.left - pad.right;

    /* per-group width for the 26 test situations */
    const groupW = chartW / numRows;
    const barW = Math.max(4, Math.round(groupW * 0.17));
    const barGap = Math.max(2, Math.round(barW * 0.25));
    const groupOffset = (groupW - (barW * 3 + barGap * 2)) / 2;

    /* font sizes */
    const axisFontSize = Math.min(Math.max(9, Math.round(groupW * 0.13)), 11);
    const tableHeaderFont = Math.min(Math.max(10, Math.round((h - tableTop) * 0.045)), 12);
    const tableFontSize = Math.max(8, Math.min(Math.round((h - tableTop) * 0.035), 11));

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

    /* ---- HEADER ---- */
    ctx.fillStyle = textColor;
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Frontend Response Times im Vergleich', Math.round(w * 0.03), 10);
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = mutedColor;
    ctx.fillText(`${new Date().toLocaleDateString('de-DE')} · ${numRows} Testsituationen · 3 Versionen`, Math.round(w * 0.03), 30);

    /* version legend */
    const legX = Math.round(w * 0.50);
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px -apple-system, sans-serif';
    for (let vi = 0; vi < versions.length; vi++) {
      const lx = legX + vi * Math.round(w * 0.14);
      ctx.fillStyle = colors[vi];
      ctx.beginPath();
      ctx.arc(lx + 6, 22, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.fillText(versionLabels[vi], lx + 14, 22);
    }

    /* header separator */
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(w * 0.03), headerH);
    ctx.lineTo(w - Math.round(w * 0.03), headerH);
    ctx.stroke();

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

    /* x-axis index numbers (1–26) */
    ctx.fillStyle = mutedColor;
    ctx.font = `600 ${axisFontSize}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const idxY = pad.top + chartH + 2;
    for (let i = 0; i < numRows; i++) {
      if (i % 2 === 0 || i === numRows - 1) {
        const cx = pad.left + i * groupW + groupW / 2;
        ctx.fillText(String(i + 1), cx, idxY);
      }
    }

    /* ---- separator between chart and table ---- */
    ctx.fillStyle = surfaceColor;
    ctx.fillRect(0, chartBottom, w, 1);

    /* ---- VALUE TABLE ---- */
    const tPad = 6;
    const tLeft = tPad;
    const tRight = w - tPad;
    const tWidth = tRight - tLeft;
    const tableStartY = tableTop + 8;

    /* column widths: # + situation name + 3 value columns + trend + diff */
    const idxColW = Math.round(tWidth * 0.04);
    const sitColW = Math.round(tWidth * 0.24);
    const valColW = Math.round(tWidth * 0.15);
    const trendColW = Math.round(tWidth * 0.08);
    const diffColW = Math.round(tWidth * 0.14);
    const headerY = tableStartY;

    /* table header background */
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.roundRect(tLeft, headerY - 10, tWidth, tableHeaderFont + 12, 4);
    ctx.fill();

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
      ctx.font = `600 ${tableHeaderFont - 1}px -apple-system, sans-serif`;
      ctx.fillText(versionLabels[vi], tx, headerY);
    }

    /* trend header */
    const trendHdrX = tLeft + idxColW + sitColW + versions.length * valColW;
    ctx.fillStyle = mutedColor;
    ctx.textAlign = 'center';
    ctx.font = `600 ${tableHeaderFont}px -apple-system, sans-serif`;
    ctx.fillText('Trend', trendHdrX + trendColW / 2, headerY);

    /* diff header */
    const diffHdrX = trendHdrX + trendColW;
    ctx.fillStyle = mutedColor;
    ctx.textAlign = 'left';
    ctx.fillText('Diff', diffHdrX, headerY);

    /* header underline */
    const headerBottomY = headerY + tableHeaderFont * 0.6 + 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tLeft, headerBottomY);
    ctx.lineTo(tRight, headerBottomY);
    ctx.stroke();

    /* data rows */
    const availH = h - headerBottomY - 6;
    const rowH_table = Math.max(14, Math.min(Math.floor(availH / numRows), 18));
    ctx.font = `${tableFontSize}px -apple-system, sans-serif`;

    for (let i = 0; i < numRows; i++) {
      const ry = headerBottomY + 4 + i * rowH_table + rowH_table / 2;
      const sit = situations[i];
      const shortSit = sit.length > 28 ? sit.substring(0, 26) + '…' : sit;

      /* alternating bg */
      if (i % 2 === 1) {
        ctx.fillStyle = rowStr;
        ctx.beginPath();
        ctx.roundRect(tLeft, ry - rowH_table / 2, tWidth, rowH_table, 2);
        ctx.fill();
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
          trendChar = '→';
          trendColor = mutedColor;
        } else if (pct < 0) {
          trendChar = '↑';
          trendColor = '#22c55e';
        } else if (pct < 25) {
          trendChar = '↑';
          trendColor = '#eab308';
        } else {
          trendChar = '↓';
          trendColor = '#ef4444';
        }
        ctx.fillStyle = trendColor;
        ctx.textAlign = 'center';
        ctx.font = `700 ${tableFontSize + 1}px -apple-system, sans-serif`;
        ctx.fillText(trendChar, trendTx + trendColW / 2, ry);
        ctx.font = `${tableFontSize}px -apple-system, sans-serif`;

        /* diff value */
        const diffTx = trendTx + trendColW;
        const signX = diffTx + Math.round(diffColW * 0.22);
        const numX = signX + 3;
        const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
        ctx.fillStyle = diff === 0 ? mutedColor : trendColor;
        ctx.textAlign = 'right';
        ctx.fillText(sign, signX, ry);
        ctx.textAlign = 'left';
        ctx.fillText(Math.abs(diff).toFixed(0) + ' ms', numX, ry);
      } else {
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
    const _scs = getComputedStyle(document.documentElement);
    const _sText = _scs.getPropertyValue('--text').trim() || '#e4e6ef';
    const _sBg = _scs.getPropertyValue('--bg').trim() || '#0f1117';
    const _sHex = _sBg.replace('#', '');
    const _sR = parseInt(_sHex.substring(0, 2), 16);
    const _sG = parseInt(_sHex.substring(2, 4), 16);
    const _sB = parseInt(_sHex.substring(4, 6), 16);
    const _sDark = (_sR * 299 + _sG * 587 + _sB * 114) / 1000 < 128;
    const _sBase = _sDark ? 255 : 0;

    /* background arc */
    ctx.beginPath();
    ctx.arc(cx, cy, outerR - lw / 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${_sBase},${_sBase},${_sBase},0.15)`;
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
    ctx.fillStyle = _sText;
    ctx.font = `bold ${Math.round(outerR * 0.35)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayPct + '%', cx, cy);
  }

  /* ===== Campaign Chart (full modal canvas) ===== */
  function drawCampaignChart(canvas, data) {
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

    /* detect dark vs light theme */
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const isDark = (r * 299 + g * 587 + b * 114) / 1000 < 128;
    const base = isDark ? 255 : 0;

    const M = Math.round(w * 0.04);
    const smallFont = 11;

    /* ===== totals ===== */
    const totPassed = data.values.reduce((s, v) => s + (v.passed || 0), 0);
    const totFailed = data.values.reduce((s, v) => s + (v.failed || 0), 0);
    const totBlocked = data.values.reduce((s, v) => s + (v.blocked || 0), 0);
    const totExec = totPassed + totFailed + totBlocked;
    const totPlanned = data.values.reduce((s, v) => s + (v.planned || 0), 0);
    const execPct = totPlanned > 0 ? Math.round((totExec / totPlanned) * 100) : 0;

    /* ===== header ===== */
    ctx.fillStyle = textColor;
    ctx.font = 'bold 20px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Übersicht Testausführung ${data.version}`, M, 14);

    ctx.font = `14px -apple-system, sans-serif`;
    ctx.fillStyle = mutedColor;
    ctx.fillText(`Erstellt am ${new Date().toLocaleDateString('de-DE')}`, M, 40);

    const sep1Y = 62;
    ctx.strokeStyle = `rgba(${base},${base},${base},0.12)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, sep1Y);
    ctx.lineTo(w - M, sep1Y);
    ctx.stroke();

    /* ===== main donut + summary card ===== */
    const cardY = sep1Y + Math.round(h * 0.03);
    const donutSize = Math.min(w * 0.18, h * 0.26);
    const donutCx = M + donutSize / 2;
    const donutCy = cardY + donutSize / 2;

    _drawMiniDonutAt(ctx, donutCx, donutCy, donutSize, { values: data.values }, false);

    /* legend below donut */
    const legY = donutCy + donutSize / 2 + 10;
    const legEntries = [
      { label: 'PASSED', count: totPassed, color: '#22c55e' },
      { label: 'FAILED', count: totFailed, color: '#ef4444' },
      { label: 'BLOCKED', count: totBlocked, color: '#3b82f6' }
    ];
    ctx.textBaseline = 'top';
    ctx.font = `${smallFont}px -apple-system, sans-serif`;
    const legLineH = 16;
    for (let li = 0; li < legEntries.length; li++) {
      const e = legEntries[li];
      const ly = legY + li * legLineH;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(donutCx - donutSize * 0.38 + 4, ly + 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.fillText(`${e.label}: ${e.count}`, donutCx - donutSize * 0.38 + 12, ly);
    }

    /* summary card */
    const cardX = donutCx + donutSize / 2 + Math.round(w * 0.035);
    const cardW = w - M - cardX;
    const cardH = Math.max(donutSize + 20, 120);

    ctx.fillStyle = `rgba(${base},${base},${base},0.04)`;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 8);
    ctx.fill();

    ctx.strokeStyle = `rgba(${base},${base},${base},0.08)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 8);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.fillStyle = textColor;
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.fillText('Zusammenfassung', cardX + 14, cardY + 12);

    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillStyle = mutedColor;
    ctx.fillText('Gesamt ausgeführte Tests', cardX + 14, cardY + 38);
    ctx.fillStyle = textColor;
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.fillText(String(totExec), cardX + 14, cardY + 56);

    ctx.font = 'bold 15px -apple-system, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    const ratePct = `${execPct}%`;
    ctx.fillText(ratePct, cardX + cardW - 14, cardY + 56);

    ctx.font = '12px -apple-system, sans-serif';
    ctx.fillStyle = mutedColor;
    ctx.textAlign = 'right';
    ctx.fillText('Ausführungsrate', cardX + cardW - 14, cardY + 38);

    /* mini KPI row in card */
    const kpiY = cardY + 92;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const kpis = [
      { label: 'PASSED', val: totPassed, pct: totPlanned > 0 ? Math.round((totPassed / totPlanned) * 100) : 0, color: '#22c55e' },
      { label: 'FAILED', val: totFailed, pct: totPlanned > 0 ? Math.round((totFailed / totPlanned) * 100) : 0, color: '#ef4444' },
      { label: 'BLOCKED', val: totBlocked, pct: totPlanned > 0 ? Math.round((totBlocked / totPlanned) * 100) : 0, color: '#3b82f6' }
    ];
    const kpiStep = (cardW - 28) / 3;
    for (let ki = 0; ki < kpis.length; ki++) {
      const kx = cardX + 14 + ki * kpiStep;
      ctx.fillStyle = kpis[ki].color;
      ctx.font = `bold 16px -apple-system, sans-serif`;
      ctx.fillText(kpis[ki].val, kx, kpiY);
      ctx.fillStyle = kpis[ki].color;
      ctx.font = `11px -apple-system, sans-serif`;
      ctx.fillText(`${kpis[ki].label} (${kpis[ki].pct}%)`, kx, kpiY + 20);
    }

    /* ===== separator before table ===== */
    const legBottom = legY + legEntries.length * legLineH + 6;
    const tableSepY = Math.max(cardY + cardH + 16, legBottom);
    ctx.strokeStyle = `rgba(${base},${base},${base},0.12)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, tableSepY);
    ctx.lineTo(w - M, tableSepY);
    ctx.stroke();

    /* ===== table ===== */
    const tblTopY = tableSepY + 12;
    const tblLeft = M;
    const tblRight = w - M;
    const tblW = tblRight - tblLeft;

    const colPcts = [0.18, 0.13, 0.15, 0.15, 0.15, 0.13, 0.11];
    const colLabels = ['Bereich', 'Geplant', 'PASSED', 'FAILED', 'BLOCKED', 'Ausgeführt', 'Ausf.-Rate'];
    const colAligns = ['left', 'right', 'right', 'right', 'right', 'right', 'right'];

    let colX = tblLeft;
    const colStarts = colPcts.map(p => { const x = colX; colX += Math.round(tblW * p); return x; });
    const colEnds = colPcts.map((p, i) => colStarts[i] + Math.round(tblW * p));

    const hFont = 12;
    const dFont = 12;
    const rowH = 24;

    /* header */
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${hFont}px -apple-system, sans-serif`;
    ctx.fillStyle = mutedColor;
    for (let ci = 0; ci < colLabels.length; ci++) {
      ctx.textAlign = colAligns[ci];
      const x = colAligns[ci] === 'right' ? colEnds[ci] - 4 : colStarts[ci] + 4;
      ctx.fillText(colLabels[ci], x, tblTopY + rowH / 2);
    }

    /* header underline */
    const hdrBot = tblTopY + rowH;
    ctx.strokeStyle = `rgba(${base},${base},${base},0.15)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tblLeft, hdrBot);
    ctx.lineTo(tblRight, hdrBot);
    ctx.stroke();

    /* data rows */
    const areaLabels = ['Manual', 'Automation', 'RFC', 'Mobile'];
    ctx.font = `${dFont}px -apple-system, sans-serif`;

    for (let mi = 0; mi < 4; mi++) {
      const v = data.values[mi] || {};
      const passed = v.passed || 0;
      const failed = v.failed || 0;
      const blocked = v.blocked || 0;
      const executed = passed + failed + blocked;
      const planned = v.planned || 0;
      const pct = planned > 0 ? Math.round((executed / planned) * 100) : 0;

      const ry = hdrBot + 4 + mi * rowH;
      if (mi % 2 === 1) {
        ctx.fillStyle = `rgba(${base},${base},${base},0.03)`;
        ctx.fillRect(tblLeft, ry, tblW, rowH);
      }

      const cells = [areaLabels[mi], planned, passed, failed, blocked, executed, pct + '%'];
      ctx.fillStyle = textColor;
      for (let ci = 0; ci < cells.length; ci++) {
        ctx.textAlign = colAligns[ci];
        const x = colAligns[ci] === 'right' ? colEnds[ci] - 4 : colStarts[ci] + 4;
        ctx.fillText(String(cells[ci]), x, ry + rowH / 2);
      }
    }

    /* footer underline */
    const footTop = hdrBot + 4 + 4 * rowH;
    ctx.strokeStyle = `rgba(${base},${base},${base},0.15)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tblLeft, footTop);
    ctx.lineTo(tblRight, footTop);
    ctx.stroke();

    /* summary row */
    const sumCells = ['Gesamt', totPlanned, totPassed, totFailed, totBlocked, totExec, execPct + '%'];
    ctx.font = `600 ${dFont}px -apple-system, sans-serif`;
    ctx.fillStyle = textColor;
    for (let ci = 0; ci < sumCells.length; ci++) {
      ctx.textAlign = colAligns[ci];
      const x = colAligns[ci] === 'right' ? colEnds[ci] - 4 : colStarts[ci] + 4;
      ctx.fillText(String(sumCells[ci]), x, footTop + 4 + rowH / 2);
    }

    /* ===== separator before mini donuts ===== */
    const miniSepY = footTop + 4 + rowH + 16;
    ctx.strokeStyle = `rgba(${base},${base},${base},0.08)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, miniSepY);
    ctx.lineTo(w - M, miniSepY);
    ctx.stroke();

    /* ===== mini donuts visual row ===== */
    const miniSize = Math.min(w * 0.09, h * 0.1);
    const miniGap = (w - 2 * M - 4 * miniSize) / 5;
    const miniY = miniSepY + 16;
    const miniCy = miniY + miniSize / 2;

    for (let mi = 0; mi < 4; mi++) {
      const mx = M + miniGap + mi * (miniSize + miniGap);
      const v = data.values[mi] || {};
      _drawMiniDonutAt(ctx, mx + miniSize / 2, miniCy, miniSize, { values: [v] }, true);

      ctx.fillStyle = mutedColor;
      ctx.font = `bold 11px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(areaLabels[mi], mx + miniSize / 2, miniCy + miniSize / 2 + 4);
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
    const cs2 = getComputedStyle(document.documentElement);
    const bg2 = cs2.getPropertyValue('--bg').trim() || '#0f1117';
    const hex2 = bg2.replace('#', '');
    const r2 = parseInt(hex2.substring(0, 2), 16);
    const g2 = parseInt(hex2.substring(2, 4), 16);
    const b2 = parseInt(hex2.substring(4, 6), 16);
    const isDark2 = (r2 * 299 + g2 * 587 + b2 * 114) / 1000 < 128;
    const base2 = isDark2 ? 255 : 0;
    ctx.strokeStyle = `rgba(${base2},${base2},${base2},0.15)`;
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
    ctx.fillStyle = cs2.getPropertyValue('--text').trim() || '#e4e6ef';
    ctx.font = `bold ${Math.round(outerR * 0.35)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(allPct + '%', cx, cy);
  }

  /* ===== Time Evolution Line Chart ===== */
  function drawTimeEvolution(canvas, data, compact) {
    const dpr = window.devicePixelRatio || 1;
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
    const rowColor = cs.getPropertyValue('--row-stripe').trim() || 'rgba(255,255,255,0.025)';

    const situations = data.testSituations;
    const versions = data.xAxisOrder;
    const numVersions = versions.length;
    const numSits = situations.length;

    /* line colors for 6 dimensions */
    const lineColors = ['#6366f1', '#22c55e', '#eab308', '#f97316', '#ef4444', '#3b82f6'];

    if (compact) {
      /* ===== COMPACT TILE VERSION ===== */
      const pad = { top: 8, left: 30, right: 8, bottom: 14 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;

      /* find max value */
      let maxVal = 0;
      for (const ver of versions) {
        const vals = data.versionData[ver] || [];
        for (const v of vals) {
          if (v !== null && v > maxVal) maxVal = v;
        }
      }
      if (maxVal <= 0) maxVal = 1;

      /* draw grid lines */
      ctx.strokeStyle = `rgba(255,255,255,0.06)`;
      ctx.lineWidth = 1;
      for (let s = 0; s <= 3; s++) {
        const y = pad.top + (chartH / 3) * (3 - s);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
      }

      /* draw lines */
      for (let si = 0; si < numSits; si++) {
        ctx.strokeStyle = lineColors[si];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let vi = 0; vi < numVersions; vi++) {
          const vals = data.versionData[versions[vi]] || [];
          const val = vals[si];
          if (val === null || val === undefined) { continue; }
          const x = pad.left + (vi / (numVersions - 1)) * chartW;
          const y = pad.top + chartH - (val / maxVal) * chartH;
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      /* x-axis version labels (show every 3rd) */
      ctx.fillStyle = mutedColor;
      ctx.font = '500 7px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let vi = 0; vi < numVersions; vi++) {
        if (vi % 3 !== 0 && vi !== numVersions - 1) continue;
        const x = pad.left + (vi / (numVersions - 1)) * chartW;
        ctx.fillText(versions[vi], x, pad.top + chartH + 1);
      }

      /* y-axis label */
      ctx.fillStyle = mutedColor;
      ctx.font = '500 7px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(maxVal.toFixed(1) + 's', pad.left - 3, pad.top + 2);
      ctx.fillText('0', pad.left - 3, pad.top + chartH);

    } else {
      /* ===== FULL MODAL VERSION ===== */
      const headerH = 52;
      const pad2 = { top: headerH + 12, left: Math.max(55, Math.round(w * 0.055)), right: Math.max(120, Math.round(w * 0.08)), bottom: Math.max(48, Math.round(h * 0.065)) };
      const chartW = w - pad2.left - pad2.right;
      const chartH = h - pad2.top - pad2.bottom;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);

      /* title */
      ctx.fillStyle = textColor;
      ctx.font = 'bold 17px -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Empfängersuche nach Parametern — Evolution über Releases', Math.round(w * 0.03), 12);
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillStyle = mutedColor;
      ctx.fillText(`${new Date().toLocaleDateString('de-DE')} · ${numVersions} Releases · ${numSits} Suchdimensionen`, Math.round(w * 0.03), 33);

      /* separator */
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(w * 0.03), headerH);
      ctx.lineTo(w - Math.round(w * 0.03), headerH);
      ctx.stroke();

      /* max value */
      let maxVal = 0;
      for (const ver of versions) {
        const vals = data.versionData[ver] || [];
        for (const v of vals) {
          if (v !== null && v > maxVal) maxVal = v;
        }
      }
      if (maxVal <= 0) maxVal = 1;

      /* y-axis grid */
      const ySteps = 4;
      for (let s = 0; s <= ySteps; s++) {
        const y = pad2.top + (chartH / ySteps) * (ySteps - s);
        const val = (maxVal / ySteps) * s;
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad2.left, y);
        ctx.lineTo(w - pad2.right, y);
        ctx.stroke();
        ctx.fillStyle = mutedColor;
        ctx.font = '10px -apple-system, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(val.toFixed(1) + ' s', pad2.left - 6, y);
      }

      /* draw lines — connect only known points, skip nulls */
      for (let si = 0; si < numSits; si++) {
        ctx.strokeStyle = lineColors[si];
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        for (let vi = 0; vi < numVersions; vi++) {
          const vals = data.versionData[versions[vi]] || [];
          const val = vals[si];
          if (val === null || val === undefined) { continue; }
          const x = pad2.left + (vi / (numVersions - 1)) * chartW;
          const y = pad2.top + chartH - (val / maxVal) * chartH;
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        /* draw data point dots */
        for (let vi = 0; vi < numVersions; vi++) {
          const vals = data.versionData[versions[vi]] || [];
          const val = vals[si];
          if (val === null || val === undefined) continue;
          const x = pad2.left + (vi / (numVersions - 1)) * chartW;
          const y = pad2.top + chartH - (val / maxVal) * chartH;
          ctx.fillStyle = bgColor;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = lineColors[si];
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      /* x-axis version labels (angled) */
      ctx.fillStyle = mutedColor;
      ctx.font = '9px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      for (let vi = 0; vi < numVersions; vi++) {
        const x = pad2.left + (vi / (numVersions - 1)) * chartW;
        const label = versions[vi];
        ctx.save();
        ctx.translate(x, pad2.top + chartH + 6);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }

      /* x-axis label */
      ctx.fillStyle = mutedColor;
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('Release', w / 2, h - 12);

      /* legend on the right side */
      const legX = w - Math.round(w * 0.075) + 4;
      const legStartY = pad2.top + 10;
      ctx.textBaseline = 'middle';
      ctx.font = '600 10px -apple-system, sans-serif';
      ctx.fillStyle = mutedColor;
      ctx.textAlign = 'left';
      ctx.fillText('Legende', legX + 6, legStartY - 14);

      ctx.font = '10px -apple-system, sans-serif';
      for (let si = 0; si < numSits; si++) {
        const ly = legStartY + si * 22;
        ctx.fillStyle = lineColors[si];
        ctx.beginPath();
        ctx.arc(legX + 4, ly, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.fillText(situations[si], legX + 14, ly);
      }
    }
  }

  return { getChartType, drawDonut, drawBar, drawMiniDonut, drawResponseComparison, drawSegmentedDonut, drawCampaignChart, drawTimeEvolution };
})();
