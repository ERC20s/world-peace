#!/usr/bin/env node
// Simple no-dependency link checker for ERC20s/world-peace
// Scans conflicts/ and content/organisations/ for external http(s) links.
//
// Usage: node tools/check-links.js [--strict]
//
// Every URL is checked ONCE, however many pages cite it (the same source is
// normally cited twice on a conflict page: once under "Initiatives and
// organisations" and again under "Sources"). Each result is one of three:
//   ok          - HEAD, or a GET retry, answered 2xx/3xx
//   broken      - a real 4xx/5xx that survived the GET retry -> exit 2
//   unreachable - DNS / connection / timeout / 429 rate-limit, after one retry
//                 -> a warning; exit 0 unless --strict is passed
// The split matters because running the check offline (or behind a captive
// portal) must not report every verified source as broken.

const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const TIMEOUT = 10000; // 10s
const MAX_REDIRECTS = 5;
const CONCURRENCY = 6;
const RETRY_DELAY = 1500; // ms, before the single retry of an unreachable URL

const STRICT = process.argv.slice(2).includes('--strict');

const USER_AGENT = 'world-peace-link-checker/2.0 (+https://github.com/ERC20s/world-peace)';
const ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

// Transport-level failures: the network could not answer, which says nothing
// about whether the source is still published.
const TRANSPORT_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ECONNABORTED', 'EADDRNOTAVAIL'
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listHtmlFiles(dir) {
  const out = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...await listHtmlFiles(p));
      } else if (e.isFile() && /\.html?$/.test(e.name)) {
        out.push(p);
      }
    }
  } catch (err) {
    // missing dirs are fine
  }
  return out;
}

async function findLinksInFile(file) {
  const txt = await fs.readFile(file, 'utf8');
  const hrefRe = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  const results = [];
  let m;
  while ((m = hrefRe.exec(txt)) !== null) {
    const raw = m[1] || m[2] || m[3] || '';
    const trimmed = raw.trim();
    if (!trimmed) continue;
    results.push({ file, url: trimmed });
  }
  return results;
}

function isExternalHttp(url) {
  try {
    const u = new URL(url, 'http://example.local');
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      // If the href was relative (no protocol, no leading //), URL resolved with base -> host 'example.local'
      // Treat as external only if original had protocol or started with //
      return /^https?:\/\//i.test(url) || /^\/\//.test(url);
    }
  } catch (err) {
    return false;
  }
  return false;
}

function isLikelyAsset(url) {
  return /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf)(\?|$)/i.test(url);
}

// Recognise placeholder / example hostnames that appear in templates and
// worked examples. These are not real sources and should be skipped by the
// checker. The validator treats them as invalid sources.
function isPlaceholderUrl(raw) {
  try {
    let candidate = String(raw).trim();
    if (/^\/\//.test(candidate)) candidate = 'https:' + candidate;
    const u = new URL(candidate, 'http://example.local');
    const host = (u.hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return /^(?:example\.org|example\.com|example\.net|example\.local|localhost|d8a\.com)$/i.test(host);
  } catch (err) {
    return false;
  }
}

// One URL, one identity: protocol-relative hrefs become https, the fragment is
// dropped (servers never see it) and a bare host gets its "/" back, so the same
// source cited in two places is fetched once.
function normaliseUrl(raw) {
  let candidate = raw;
  if (/^\/\//.test(candidate)) candidate = 'https:' + candidate;
  try {
    const u = new URL(candidate);
    u.hash = '';
    if (!u.pathname) u.pathname = '/';
    return u.toString();
  } catch (err) {
    return candidate;
  }
}

function requestOnce(u, method, timeout, redirectsLeft) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(u);
    } catch (err) {
      reject(Object.assign(new Error('invalid URL'), { code: 'ERR_INVALID_URL' }));
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const headers = { 'user-agent': USER_AGENT };
    if (method === 'GET') headers.accept = ACCEPT;
    const opts = {
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: (parsed.pathname || '/') + (parsed.search || ''),
      headers
    };
    const req = lib.request(opts, (res) => {
      const { statusCode, headers: resHeaders } = res;
      // follow redirects
      if (statusCode >= 300 && statusCode < 400 && resHeaders.location && redirectsLeft > 0) {
        const next = new URL(resHeaders.location, parsed).toString();
        res.resume();
        req.destroy();
        resolve(requestOnce(next, method, timeout, redirectsLeft - 1));
        return;
      }
      // consume any body then resolve
      res.on('data', () => {});
      res.on('end', () => resolve({ statusCode, headers: resHeaders, finalUrl: parsed.toString() }));
      res.on('error', (err) => reject(err));
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    });
    req.end();
  });
}

function unreachableFromError(err) {
  const code = (err && err.code) || '';
  const detail = code || (err && err.message) || 'error';
  if (code === 'ERR_INVALID_URL') {
    return { state: 'broken', status: 'invalid URL' };
  }
  if (TRANSPORT_CODES.has(code) || /timeout|socket hang up|network/i.test((err && err.message) || '')) {
    return { state: 'unreachable', status: detail };
  }
  // TLS failures and anything unclassified: report as unreachable rather than
  // accusing a source of being dead when the fault may be local.
  return { state: 'unreachable', status: detail };
}

// HEAD first (cheap); on ANY status >= 400 retry the same URL with GET, because
// CDN and bot-protected hosts routinely answer HEAD with 403/405/429 while
// serving the page perfectly well to a reader.
async function attemptUrl(rawUrl) {
  let headErr = null;
  try {
    const headRes = await requestOnce(rawUrl, 'HEAD', TIMEOUT, MAX_REDIRECTS);
    if (headRes.statusCode >= 200 && headRes.statusCode < 400) {
      return { state: 'ok', status: headRes.statusCode, method: 'HEAD' };
    }
  } catch (err) {
    headErr = err;
    if (err && err.code === 'ERR_INVALID_URL') return { state: 'broken', status: 'invalid URL' };
  }

  try {
    const getRes = await requestOnce(rawUrl, 'GET', TIMEOUT, MAX_REDIRECTS);
    if (getRes.statusCode >= 200 && getRes.statusCode < 400) {
      return { state: 'ok', status: getRes.statusCode, method: 'GET' };
    }
    if (getRes.statusCode === 429) {
      return { state: 'unreachable', status: '429 rate-limited', method: 'GET' };
    }
    return { state: 'broken', status: getRes.statusCode, method: 'GET' };
  } catch (err) {
    return Object.assign(unreachableFromError(err || headErr), { method: 'GET' });
  }
}

// An unreachable answer is retried once: a single dropped connection or one
// burst of rate limiting should not colour the report.
async function checkUrl(rawUrl) {
  const first = await attemptUrl(rawUrl);
  if (first.state !== 'unreachable') return first;
  await sleep(RETRY_DELAY);
  const second = await attemptUrl(rawUrl);
  return Object.assign(second, { retried: true });
}

async function run() {
  const dirs = ['conflicts', path.join('content', 'organisations')];
  const files = [];
  for (const d of dirs) {
    files.push(...await listHtmlFiles(d));
  }

  if (!files.length) {
    console.log('No HTML files found to scan in conflicts/ or content/organisations/.');
    process.exit(0);
  }

  // URL -> the files that cite it. Checking is per URL; reporting is per file.
  const citations = new Map();
  let hrefCount = 0;
  for (const f of files) {
    try {
      const links = await findLinksInFile(f);
      for (const l of links) {
        const url = l.url.trim();
        if (!isExternalHttp(url)) continue;
        if (isLikelyAsset(url)) continue;
        const key = normaliseUrl(url);
        hrefCount++;
        if (!citations.has(key)) citations.set(key, new Set());
        citations.get(key).add(f);
      }
    } catch (err) {
      console.error('Failed reading', f, err.message || err);
    }
  }

  const urls = [...citations.keys()];
  if (!urls.length) {
    console.log('No external HTTP(S) links found in the scanned files.');
    process.exit(0);
  }

  console.log(
    'Found', hrefCount, 'external link' + (hrefCount === 1 ? '' : 's') + ' ->',
    urls.length, 'unique URL' + (urls.length === 1 ? '' : 's') + '. Checking with up to',
    CONCURRENCY, 'concurrent requests.'
  );

  let idx = 0;
  const broken = [];
  const unreachable = [];
  let okCount = 0;

  const placeholderUrls = [];
  const citedBy = (url) => [...citations.get(url)].sort().join(', ');

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= urls.length) return;
      const url = urls[i];

      // If the URL is a known placeholder, don't fetch it; record and print it.
      if (isPlaceholderUrl(url)) {
        placeholderUrls.push({ url, files: citedBy(url) });
        console.log('PLACEHOLDER:', url, '- cited by', citedBy(url));
        continue;
      }

      let res;
      try {
        res = await checkUrl(url);
      } catch (err) {
        res = { state: 'unreachable', status: (err && err.message) || 'error' };
      }
      const where = citedBy(url);
      if (res.state === 'ok') {
        okCount++;
        console.log('OK:', url, '(', res.status, 'via', res.method || 'HEAD', ')');
      } else if (res.state === 'broken') {
        broken.push({ url, status: res.status, files: where });
        console.log('BROKEN:', url, 'status:', res.status, '- cited by', where);
      } else {
        unreachable.push({ url, status: res.status, files: where });
        console.log('UNREACHABLE:', url, '(', res.status, ')', '- cited by', where);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  console.log(
    '\nSummary:', okCount, 'ok,', broken.length, 'broken,', unreachable.length,
    'unreachable,', placeholderUrls.length, 'placeholders (' + urls.length + ' unique URLs from ' + files.length + ' pages).'
  );

  if (placeholderUrls.length) {
    console.log('\nPlaceholders: these URLs are reserved/example hosts the checker skips:');
    for (const p of placeholderUrls) console.log('-', p.url, '- cited by', p.files);
  }

  if (unreachable.length) {
    console.warn('\nUnreachable — the network could not answer, not proof a source is gone:');
    for (const u of unreachable) console.warn('-', u.url, '(', u.status, ')', 'cited by', u.files);
    console.warn('Re-run when online, or pass --strict to fail on these.');
  }

  if (broken.length) {
    console.error('\nBroken — answered an error status to both HEAD and GET:');
    for (const b of broken) console.error('-', b.url, 'status:', b.status, 'cited by', b.files);
    process.exit(2);
  }

  if (unreachable.length && STRICT) {
    console.error('\n--strict: treating', unreachable.length, 'unreachable URL(s) as failures.');
    process.exit(2);
  }

  if (!unreachable.length) console.log('All checked links returned success status codes.');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error', err && err.stack || err);
  process.exit(3);
});
