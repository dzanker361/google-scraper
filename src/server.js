'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { fetchOrganicResults, toJson, toCsv } = require('./scraper');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/search', async (req, res) => {
  const query  = (req.query.q      || '').trim();
  const format = (req.query.format || 'json').toLowerCase();
  const hl     =  req.query.hl     || 'cs';
  const gl     =  req.query.gl     || 'cz';

  if (!query) return res.status(400).json({ error: 'chybí q' });
  if (!['json', 'csv'].includes(format)) return res.status(400).json({ error: 'format musí být json nebo csv' });

  try {
    const results = await fetchOrganicResults(query, { hl, gl });
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="serp-${encodeURIComponent(query)}.csv"`);
      return res.send(toCsv(results));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(toJson({ query, timestamp: new Date().toISOString(), results }));
  } catch (err) {
    console.error('[search error]', err.message);
    return res.status(502).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString(), mode: process.env.SERPAPI_KEY ? 'serpapi' : 'direct' });
});

const mode = process.env.SERPAPI_KEY ? 'serpapi' : 'direct';
app.listen(PORT, () => {
  console.log(`🔍 SERP Scraper → http://localhost:${PORT}  [mode: ${mode}]`);
});

module.exports = app;
