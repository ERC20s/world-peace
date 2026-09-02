#!/usr/bin/env node
// Simple no-dependency link checker for ERC20s/world-peace
// Scans conflicts/ and content/organisations/ for external http(s) links.
// Usage: node tools/check-links.js

const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const TIMEOUT = 10000; // 10s
const MAX_REDIRECTS = 5;
const CONCURRENCY = 6;

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

function requestOnce(u, method, timeout, redirectsLeft) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(u);
    const lib = parsed.protocol === 'https:' ? https : http;
    const opts = {
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      headers: { 'user-agent': 'world-peace-link-checker/1.0' }
    };
    const req = lib.request(opts, (res) => {
      const { statusCode, headers } = res;
      // follow redirects
      if (statusCode >= 300 && statusCode < 400 && headers.location && redirectsLeft > 0) {
        // build absolute redirect URL
        const next = new URL(headers.location, parsed).toString();
        // consume and follow
        res.resume();
        resolve(requestOnce(next, method, timeout, redirectsLeft - 1));
        return;
      }
      // consume any body then resolve
      res.on('data', () => {});
      res.on('end', () => resolve({ statusCode, headers }));
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(timeout, () => {
      req.abort();
      reject(new Error('timeout'));
    });
    req.end();
  });
}

async function checkUrl(rawUrl) {
  // try HEAD, fallback to GET on 405/501 or on request error
  try {
    const headRes = await requestOnce(rawUrl, 'HEAD', TIMEOUT, MAX_REDIRECTS);
    if (headRes && headRes.statusCode >= 200 && headRes.statusCode < 400) return { ok: true, status: headRes.statusCode };
    if (headRes && (headRes.statusCode === 405 || headRes.statusCode === 501 || headRes.statusCode === 400)) {
      // fallback to GET
      const getRes = await requestOnce(rawUrl, 'GET', TIMEOUT, MAX_REDIRECTS);
      if (getRes && getRes.statusCode >= 200 && getRes.statusCode < 400) return { ok: true, status: getRes.statusCode };
      return { ok: false, status: getRes ? getRes.statusCode : 'error' };
    }
    // other non-success from HEAD is considered failure
    return { ok: headRes && headRes.statusCode < 400, status: headRes ? headRes.statusCode : 'error' };
  } catch (err) {
    // on error, try GET as a fallback once
    if (err && err.message !== 'timeout') {
      try {
        const getRes = await requestOnce(rawUrl, 'GET', TIMEOUT, MAX_REDIRECTS);
        if (getRes && getRes.statusCode >= 200 && getRes.statusCode < 400) return { ok: true, status: getRes.statusCode };
        return { ok: false, status: getRes ? getRes.statusCode : err.message };
      } catch (err2) {
        return { ok: false, status: err2.message || 'error' };
      }
    }
    return { ok: false, status: err.message || 'timeout' };
  }
}

async function run() {
  const dirs = ['conflicts', path.join('content', 'organisations')];
  const files = [];
  for (const d of dirs) {
    files.push(...await listHtmlFiles(d));
  }
  // also include a likely example file if present
  const example = path.join('content', 'organisations', 'example-organisation.html');
  try { await fs.access(example); files.push(example); } catch (e) {}

  if (!files.length) {
    console.log('No HTML files found to scan in conflicts/ or content/organisations/.');
    process.exit(0);
  }

  const linkEntries = [];
  for (const f of files) {
    try {
      const links = await findLinksInFile(f);
      for (const l of links) {
        const url = l.url.trim();
        if (!isExternalHttp(url)) continue;
        if (isLikelyAsset(url)) continue;
        // skip mailto/tel etc already filtered by isExternalHttp
        linkEntries.push({ file: f, url });
      }
    } catch (err) {
      console.error('Failed reading', f, err.message || err);
    }
  }

  if (!linkEntries.length) {
    console.log('No external HTTP(S) links found in the scanned files.');
    process.exit(0);
  }

  console.log('Found', linkEntries.length, 'external links. Checking with up to', CONCURRENCY, 'concurrent requests.');

  let idx = 0;
  let failures = [];

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= linkEntries.length) return;
      const item = linkEntries[i];
      try {
        const res = await checkUrl(item.url);
        if (!res.ok) {
          failures.push({ file: item.file, url: item.url, status: res.status });
          console.log('BROKEN:', item.file, '->', item.url, 'status:', res.status);
        } else {
          console.log('OK:', item.url, '(', res.status, ')');
        }
      } catch (err) {
        failures.push({ file: item.file, url: item.url, status: err.message || 'error' });
        console.log('ERROR:', item.file, '->', item.url, err.message || err);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  if (failures.length) {
    console.error('\nSummary: found', failures.length, 'broken links:');
    for (const f of failures) console.error('-', f.file, '->', f.url, 'status:', f.status);
    process.exit(2);
  }
  console.log('\nAll checked links returned success status codes.');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error', err && err.stack || err);
  process.exit(3);
});
