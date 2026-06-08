const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'server-data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(express.json({ limit: '100mb' }));
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

const ALLOWED_KEYS = new Set([
  'qa_dashboard_state',
  'qa_dashboard_values',
  'qa_dashboard_theme',
  'qa_dashboard_campaigns',
  'qa_dashboard_rfc_entries',
  'qa_dashboard_rfc_tests_campaign',
  'qa_dashboard_abugs_campaign',
  'qa_dashboard_abugs_values',
  'qa_dashboard_responsedev_current',
  'qa_dashboard_responsedev_previous',
  'qa_dashboard_responsesta_current',
  'qa_dashboard_responsesta_previous',
  'qa_dashboard_recipientsearch_campaign'
]);

function sanitizeKey(key) {
  if (!key || typeof key !== 'string') return null;
  if (!ALLOWED_KEYS.has(key)) return null;
  return key;
}

function getFilePath(key) {
  return path.join(DATA_DIR, `${key}.json`);
}

app.get('/api/data', (_req, res) => {
  try {
    const all = {};
    for (const key of ALLOWED_KEYS) {
      const fp = getFilePath(key);
      if (fs.existsSync(fp)) {
        try {
          all[key] = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        } catch {
          all[key] = null;
        }
      } else {
        all[key] = null;
      }
    }
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/data/:key', (req, res) => {
  const key = sanitizeKey(req.params.key);
  if (!key) return res.status(400).json({ error: 'Ungültiger Key' });
  const fp = getFilePath(key);
  if (fs.existsSync(fp)) {
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      return res.json(data);
    } catch {
      return res.json({ value: null });
    }
  }
  res.json({ value: null });
});

app.post('/api/data/:key', (req, res) => {
  const key = sanitizeKey(req.params.key);
  if (!key) return res.status(400).json({ error: 'Ungültiger Key' });
  try {
    const fp = getFilePath(key);
    fs.writeFileSync(fp, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`QA Dashboard Server on http://0.0.0.0:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
