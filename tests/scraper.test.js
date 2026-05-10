'use strict';

const {
  parseGoogleHtml,
  validateResult,
  toJson,
  toCsv,
  fetchOrganicResults,
} = require('../src/scraper');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Minimal Google-like HTML snippet with two organic results.
 * Mirrors the DOM structure Cheerio will encounter.
 */
const MOCK_HTML_TWO_RESULTS = `
<html><body>
  <div id="search">
    <div class="g">
      <div>
        <a href="https://example.com/page-one">
          <h3>First Organic Result</h3>
        </a>
        <cite>example.com › page-one</cite>
        <div class="VwiC3b">This is the snippet for the first result.</div>
      </div>
    </div>
    <div class="g">
      <div>
        <a href="https://another-site.org/article">
          <h3>Second Organic Result</h3>
        </a>
        <cite>another-site.org</cite>
        <div class="VwiC3b">Snippet text for the second result here.</div>
      </div>
    </div>
  </div>
</body></html>
`;

const MOCK_HTML_EMPTY = `<html><body><div id="search"></div></body></html>`;

const MOCK_HTML_WITH_NESTED_G = `
<html><body>
  <div class="g">
    <a href="https://parent-result.com"><h3>Parent Result</h3></a>
    <cite>parent-result.com</cite>
    <div class="VwiC3b">Parent snippet.</div>
    <!-- Nested .g inside featured snippet – must be skipped -->
    <div class="g">
      <a href="https://nested.com"><h3>Nested Sub-result</h3></a>
    </div>
  </div>
</body></html>
`;

const MOCK_HTML_GOOGLE_INTERNAL_LINK = `
<html><body>
  <div class="g">
    <!-- Internal Google link – should be ignored -->
    <a href="https://www.google.com/aclk?sa=...">
      <h3>Ad Result</h3>
    </a>
  </div>
  <div class="g">
    <a href="https://legit-result.net/page">
      <h3>Legitimate Organic Result</h3>
    </a>
    <cite>legit-result.net</cite>
    <div class="VwiC3b">Real snippet.</div>
  </div>
</body></html>
`;

const VALID_RESULT = {
  position: 1,
  title: 'Test Page Title',
  url: 'https://example.com',
  displayUrl: 'example.com',
  description: 'A short description.',
};

// ─── parseGoogleHtml ──────────────────────────────────────────────────────────

describe('parseGoogleHtml()', () => {
  test('returns array of results from valid HTML', () => {
    const results = parseGoogleHtml(MOCK_HTML_TWO_RESULTS);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
  });

  test('first result has all required fields', () => {
    const [first] = parseGoogleHtml(MOCK_HTML_TWO_RESULTS);
    expect(first).toMatchObject({
      position: 1,
      title: 'First Organic Result',
      url: 'https://example.com/page-one',
      description: expect.any(String),
      displayUrl: expect.any(String),
    });
  });

  test('positions are sequential starting at 1', () => {
    const results = parseGoogleHtml(MOCK_HTML_TWO_RESULTS);
    results.forEach((r, i) => {
      expect(r.position).toBe(i + 1);
    });
  });

  test('returns empty array when no results found', () => {
    const results = parseGoogleHtml(MOCK_HTML_EMPTY);
    expect(results).toEqual([]);
  });

  test('filters out nested .g elements (featured-snippet sub-results)', () => {
    const results = parseGoogleHtml(MOCK_HTML_WITH_NESTED_G);
    // Only the parent result should be present
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Parent Result');
  });

  test('filters out Google internal / ad links (google.com/aclk)', () => {
    const results = parseGoogleHtml(MOCK_HTML_GOOGLE_INTERNAL_LINK);
    expect(results.length).toBe(1);
    expect(results[0].url).toBe('https://legit-result.net/page');
  });

  test('throws TypeError for empty string input', () => {
    expect(() => parseGoogleHtml('')).toThrow(TypeError);
  });

  test('throws TypeError for non-string input', () => {
    expect(() => parseGoogleHtml(null)).toThrow(TypeError);
    expect(() => parseGoogleHtml(42)).toThrow(TypeError);
  });

  test('url fields start with http', () => {
    const results = parseGoogleHtml(MOCK_HTML_TWO_RESULTS);
    results.forEach(r => {
      expect(r.url).toMatch(/^https?:\/\//);
    });
  });

  test('title is non-empty string for each result', () => {
    const results = parseGoogleHtml(MOCK_HTML_TWO_RESULTS);
    results.forEach(r => {
      expect(typeof r.title).toBe('string');
      expect(r.title.trim().length).toBeGreaterThan(0);
    });
  });
});

// ─── validateResult ───────────────────────────────────────────────────────────

describe('validateResult()', () => {
  test('returns the result object unchanged when valid', () => {
    expect(validateResult(VALID_RESULT)).toEqual(VALID_RESULT);
  });

  test('throws when input is not an object', () => {
    expect(() => validateResult(null)).toThrow(TypeError);
    expect(() => validateResult('string')).toThrow(TypeError);
    expect(() => validateResult(42)).toThrow(TypeError);
  });

  test('throws when a required field is missing', () => {
    const { title: _omit, ...noTitle } = VALID_RESULT;
    expect(() => validateResult(noTitle)).toThrow(/title/);

    const { url: _omit2, ...noUrl } = VALID_RESULT;
    expect(() => validateResult(noUrl)).toThrow(/url/);

    const { position: _omit3, ...noPos } = VALID_RESULT;
    expect(() => validateResult(noPos)).toThrow(/position/);
  });

  test('throws when position is not a positive number', () => {
    expect(() => validateResult({ ...VALID_RESULT, position: 0 })).toThrow(TypeError);
    expect(() => validateResult({ ...VALID_RESULT, position: -1 })).toThrow(TypeError);
    expect(() => validateResult({ ...VALID_RESULT, position: 'one' })).toThrow(TypeError);
  });

  test('throws when title is empty', () => {
    expect(() => validateResult({ ...VALID_RESULT, title: '' })).toThrow(TypeError);
    expect(() => validateResult({ ...VALID_RESULT, title: '   ' })).toThrow(TypeError);
  });

  test('throws when url does not start with http', () => {
    expect(() => validateResult({ ...VALID_RESULT, url: '/relative/path' })).toThrow(TypeError);
    expect(() => validateResult({ ...VALID_RESULT, url: 'ftp://example.com' })).toThrow(TypeError);
  });
});

// ─── toJson ───────────────────────────────────────────────────────────────────

describe('toJson()', () => {
  const results = [VALID_RESULT];

  test('returns valid JSON string', () => {
    const json = toJson(results);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  test('serialised output contains all result fields', () => {
    const json = toJson(results);
    const parsed = JSON.parse(json);
    expect(parsed[0]).toMatchObject(VALID_RESULT);
  });

  test('preserves all results in the array', () => {
    const multi = [VALID_RESULT, { ...VALID_RESULT, position: 2, title: 'Second' }];
    const parsed = JSON.parse(toJson(multi));
    expect(parsed.length).toBe(2);
  });

  test('handles empty array', () => {
    const parsed = JSON.parse(toJson([]));
    expect(parsed).toEqual([]);
  });
});

// ─── toCsv ────────────────────────────────────────────────────────────────────

describe('toCsv()', () => {
  test('returns empty string for empty input', () => {
    expect(toCsv([])).toBe('');
  });

  test('first line is the header row', () => {
    const csv = toCsv([VALID_RESULT]);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toBe('position,title,url,displayUrl,description');
  });

  test('data row count equals results count', () => {
    const results = [VALID_RESULT, { ...VALID_RESULT, position: 2, title: 'B' }];
    const lines = toCsv(results).split('\n');
    // header + 2 data rows
    expect(lines.length).toBe(3);
  });

  test('values with commas are quoted', () => {
    const resultWithComma = { ...VALID_RESULT, title: 'Hello, World' };
    const csv = toCsv([resultWithComma]);
    expect(csv).toContain('"Hello, World"');
  });

  test('internal double-quotes are escaped as double-double-quotes', () => {
    const resultWithQuote = { ...VALID_RESULT, description: 'He said "hello"' };
    const csv = toCsv([resultWithQuote]);
    expect(csv).toContain('""hello""');
  });

  test('each data row contains the correct URL', () => {
    const csv = toCsv([VALID_RESULT]);
    expect(csv).toContain('https://example.com');
  });

  test('position value is correctly serialised', () => {
    const csv = toCsv([{ ...VALID_RESULT, position: 7 }]);
    const dataLine = csv.split('\n')[1];
    expect(dataLine.startsWith('7,')).toBe(true);
  });
});

// ─── fetchOrganicResults ──────────────────────────────────────────────────────

describe('fetchOrganicResults()', () => {
  test('throws TypeError for empty query', async () => {
    await expect(fetchOrganicResults('')).rejects.toThrow(TypeError);
    await expect(fetchOrganicResults('  ')).rejects.toThrow(TypeError);
    await expect(fetchOrganicResults(null)).rejects.toThrow(TypeError);
  });

  test('returns validated results using injected fetch mock', async () => {
    const mockFetch = async () => ({ data: MOCK_HTML_TWO_RESULTS });
    const results = await fetchOrganicResults('test query', { _fetch: mockFetch });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);

    results.forEach(r => {
      expect(r).toHaveProperty('position');
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('url');
      expect(r).toHaveProperty('displayUrl');
      expect(r).toHaveProperty('description');
    });
  });

  test('passes the query string in the request URL', async () => {
    let capturedUrl = '';
    const mockFetch = async (url) => {
      capturedUrl = url;
      return { data: MOCK_HTML_TWO_RESULTS };
    };

    await fetchOrganicResults('brno restaurace', { _fetch: mockFetch });
    // URLSearchParams encodes spaces as '+' (not '%20') — this is correct per spec
    expect(capturedUrl).toContain('brno+restaurace');
  });

  test('propagates network errors', async () => {
    const mockFetch = async () => { throw new Error('Network failure'); };
    await expect(
      fetchOrganicResults('test', { _fetch: mockFetch })
    ).rejects.toThrow('Network failure');
  });

  test('returns empty array when page has no organic results', async () => {
    const mockFetch = async () => ({ data: MOCK_HTML_EMPTY });
    const results = await fetchOrganicResults('xyzzy gibberish 9999', { _fetch: mockFetch });
    expect(results).toEqual([]);
  });
});
