'use strict';

const axios   = require('axios');
const cheerio = require('cheerio');

// ─── Constants ────────────────────────────────────────────────────────────────

const GOOGLE_SEARCH_URL = 'https://www.google.com/search';
const SERPAPI_URL       = 'https://serpapi.com/search.json';

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept-Language': 'cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control':   'no-cache',
  Pragma:            'no-cache',
  'Sec-Fetch-Dest':  'document',
  'Sec-Fetch-Mode':  'navigate',
  'Sec-Fetch-Site':  'none',
  'Sec-Ch-Ua':          '"Chromium";v="123"',
  'Sec-Ch-Ua-Mobile':   '?0',
  'Sec-Ch-Ua-Platform': '"Linux"',
};

// ─── Result Schema ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SearchResult
 * @property {number}  position    - 1-based rank among organic results
 * @property {string}  title       - Page title
 * @property {string}  url         - Full URL of the result
 * @property {string}  displayUrl  - Display URL shown by Google (often shortened)
 * @property {string}  description - Snippet / meta description
 */

// ─── Validation ───────────────────────────────────────────────────────────────

function validateResult(result) {
  if (!result || typeof result !== 'object') {
    throw new TypeError('Result must be a plain object');
  }

  const required = ['position', 'title', 'url', 'displayUrl', 'description'];
  for (const field of required) {
    if (!(field in result)) {
      throw new TypeError(`Result is missing required field: "${field}"`);
    }
  }

  if (typeof result.position !== 'number' || result.position < 1) {
    throw new TypeError('Result.position must be a positive number');
  }
  if (typeof result.title !== 'string' || result.title.trim() === '') {
    throw new TypeError('Result.title must be a non-empty string');
  }
  if (typeof result.url !== 'string' || !result.url.startsWith('http')) {
    throw new TypeError('Result.url must be a valid URL starting with http');
  }

  return result;
}

// ─── HTML Parser (direct scraping path) ──────────────────────────────────────

function parseGoogleHtml(html) {
  if (typeof html !== 'string' || html.trim() === '') {
    throw new TypeError('html must be a non-empty string');
  }

  const $ = cheerio.load(html);
  const results = [];

  $('div.g, div[data-sokoban-container]').each((_i, el) => {
    const container = $(el);

    if (container.parents('div.g').length > 0) return;

    const titleAnchor = container.find('a[href] h3').first().parent('a');
    if (!titleAnchor.length) return;

    const href = titleAnchor.attr('href') || '';
    if (!href.startsWith('http') || href.includes('google.com/aclk')) return;

    const title = titleAnchor.find('h3').first().text().trim();
    if (!title) return;

    const displayUrl = container
      .find('cite, [role="text"]')
      .first()
      .text()
      .trim();

    const description = container
      .find('[data-sncf="1"], div[style*="-webkit-line-clamp"], .VwiC3b, span.aCOpRe')
      .first()
      .text()
      .trim();

    results.push({
      position:    results.length + 1,
      title,
      url:         href,
      displayUrl:  displayUrl || new URL(href).hostname,
      description: description || '',
    });
  });

  return results;
}

// ─── SerpAPI adapter ──────────────────────────────────────────────────────────

async function fetchViaSerpApi(query, options = {}) {
  const { hl = 'cs', gl = 'cz', num = 10, _fetch } = options;

  const params = new URLSearchParams({
    engine:  'google',
    q:       query.trim(),
    hl,
    gl,
    num:     String(num),
    api_key: process.env.SERPAPI_KEY,
  });

  const fetchFn = _fetch || ((...args) => axios.get(...args));
  const response = await fetchFn(`${SERPAPI_URL}?${params}`, { timeout: 15_000 });

  console.log('[SerpAPI raw]', JSON.stringify(response.data).slice(0, 500));
  const organicResults = response.data.organic_results || [];

  return organicResults.map((item, i) => ({
    position:    i + 1,
    title:       item.title          || '',
    url:         item.link           || '',
    displayUrl:  item.displayed_link || item.link || '',
    description: item.snippet        || '',
  })).map(validateResult);
}

// ─── Direct scraping adapter ──────────────────────────────────────────────────

async function fetchDirect(query, options = {}) {
  const { hl = 'cs', gl = 'cz', num = 10, _fetch } = options;

  const params = new URLSearchParams({
    q:   query.trim(),
    hl,
    gl,
    num: String(num),
    udm: '14',
  });

  const fetchFn = _fetch || ((...args) => axios.get(...args));
  const response = await fetchFn(`${GOOGLE_SEARCH_URL}?${params}`, {
    headers: REQUEST_HEADERS,
    timeout: 15_000,
  });

  const html = response.data;

  if (
    /captcha|recaptcha|g-recaptcha/i.test(html) ||
    html.includes('detected unusual traffic') ||
    html.includes('consent.google')
  ) {
    throw new Error(
      'Google returned a CAPTCHA or consent page. ' +
      'Set SERPAPI_KEY in .env to use the reliable API path.'
    );
  }

  const results = parseGoogleHtml(html);
  return results.map(validateResult);
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchOrganicResults(query, options = {}) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new TypeError('query must be a non-empty string');
  }

  if (process.env.SERPAPI_KEY) {
    return fetchViaSerpApi(query, options);
  }

  return fetchDirect(query, options);
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function toJson(value) {
  return JSON.stringify(value, null, 2);
}

function toCsv(results) {
  if (!results || results.length === 0) return '';

  const headers = ['position', 'title', 'url', 'displayUrl', 'description'];
  const escape  = (val) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return str.includes(',') || str.includes('\n') || str.includes('"')
      ? `"${str}"`
      : str;
  };

  const rows = results.map((r) => headers.map((h) => escape(r[h])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  fetchOrganicResults,
  fetchViaSerpApi,
  fetchDirect,
  parseGoogleHtml,
  validateResult,
  toJson,
  toCsv,
  GOOGLE_SEARCH_URL,
  SERPAPI_URL,
};
