// tools/validate-pages.js end to end, on a throwaway copy of the site so the
// violations below can be introduced without touching the repository.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT } = require('../data-checks');

const SITE_PARTS = ['index.html', 'initiatives.html', 'sitemap.xml', 'conflicts', 'content', 'css', 'data', 'js', 'tools'];

function copySite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-site-'));
  for (const p of SITE_PARTS) fs.cpSync(path.join(ROOT, p), path.join(dir, p), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  return dir;
}

function validate(dir, env) {
  try {
    const out = execFileSync(process.execPath, ['tools/validate-pages.js'], {
      cwd: dir, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, ALLOW_HTTP_SOURCES: '', ...env }
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: String(err.stdout) + String(err.stderr) };
  }
}

function edit(dir, rel, fn) {
  const p = path.join(dir, rel);
  fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8')));
}

test('the site as committed passes', () => {
  const r = validate(copySite());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /OK: data\/ files match their schemas/);
  assert.match(r.out, /OK: initiatives.html and sitemap.xml are up to date/);
});

test('a bad country code in data/ fails the run', () => {
  const dir = copySite();
  edit(dir, 'data/conflicts/liberia.json', s => s.replace('"countries": ["LR"]', '"countries": ["Liberia"]'));
  const r = validate(dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /- data\/conflicts\/liberia.json: \/countries\/0 must be one of the allowed values \(got "Liberia"\)/);
});

test('a conflict page without a data file fails the run', () => {
  const dir = copySite();
  fs.rmSync(path.join(dir, 'data', 'conflicts', 'northern-ireland.json'));
  const r = validate(dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /- conflicts\/northern-ireland.html has no data file data\/conflicts\/northern-ireland.json/);
});

test('a page without Open Graph tags fails the run', () => {
  const dir = copySite();
  edit(dir, 'content/organisations/index.html', s => s.replace(/\s*<meta property="og:title"[^>]*>/, ''));
  const r = validate(dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /- content\/organisations\/index.html has no <meta property="og:title">/);
});

test('a stale sitemap or initiatives list fails the run', () => {
  const dir = copySite();
  fs.rmSync(path.join(dir, 'sitemap.xml'));
  edit(dir, 'data/conflicts/liberia.json', s => s.replace('"startYear": 1998', '"startYear": 1999'));
  const r = validate(dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /- initiatives.html is out of date/);
  assert.match(r.out, /- sitemap.xml is out of date/);
});

test('an http:// URL in data/ fails the run unless ALLOW_HTTP_SOURCES is set', () => {
  const dir = copySite();
  fs.mkdirSync(path.join(dir, 'data', 'organisations'));
  fs.writeFileSync(path.join(dir, 'data', 'organisations', 'corrymeela-community.json'), JSON.stringify({
    id: 'corrymeela-community',
    name: 'Corrymeela Community',
    website: 'http://www.corrymeela.org/',
    country: 'GB',
    mission: 'Peace and reconciliation programmes in Northern Ireland.'
  }));
  const r = validate(dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /- data\/organisations\/corrymeela-community.json: \/website http:\/\/www.corrymeela.org\/ must use https/);
  const allowed = validate(dir, { ALLOW_HTTP_SOURCES: '1' });
  assert.equal(allowed.code, 0, allowed.out);
});
