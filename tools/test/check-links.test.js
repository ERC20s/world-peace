// tools/check-links.js end to end, against a local HTTP server, from a
// throwaway site directory.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { ROOT } = require('../data-checks');

const CHECKER = path.join(ROOT, 'tools', 'check-links.js');

// Requests seen per path, and the answers: /flaky fails its first HEAD and
// GET with 503 and then recovers; /down always answers 503; /dead 404.
const hits = new Map();
const server = http.createServer((req, res) => {
  const n = (hits.get(req.url) || 0) + 1;
  hits.set(req.url, n);
  let status = 200;
  if (req.url === '/dead') status = 404;
  if (req.url === '/down') status = 503;
  if (req.url === '/flaky' && n <= 2) status = 503;
  res.writeHead(status, { 'content-type': 'text/html' });
  res.end('ok');
});

let base;
test.before(() => new Promise(resolve => server.listen(0, '127.0.0.1', () => {
  base = `http://127.0.0.1:${server.address().port}`;
  resolve();
})));
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => hits.clear());

// A site with one conflict page linking `urls`, and optional data/ files.
function site(urls, dataFiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-links-'));
  fs.mkdirSync(path.join(dir, 'conflicts'));
  fs.writeFileSync(path.join(dir, 'conflicts', 'x.html'),
    urls.map(u => `<a href="${u}">s</a>`).join('\n') + '\n<link rel="stylesheet" href="../css/styles.css">\n');
  for (const [rel, content] of Object.entries(dataFiles || {})) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(content));
  }
  return dir;
}

function run(dir, args) {
  return new Promise(resolve => {
    execFile(process.execPath, [CHECKER, ...(args || [])], { cwd: dir }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, out: stdout + stderr });
    });
  });
}

test('a 503 that recovers on the retry passes', async () => {
  const r = await run(site([`${base}/ok`, `${base}/flaky`]));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`OK: ${base}/flaky \\( 200 via HEAD \\)`));
  assert.equal(hits.get('/flaky'), 3); // HEAD 503, GET 503, retry HEAD 200
});

test('a 404 fails without a retry', async () => {
  const r = await run(site([`${base}/ok`, `${base}/dead`]));
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, new RegExp(`BROKEN: ${base}/dead status: 404`));
  assert.equal(hits.get('/dead'), 2); // HEAD, then GET
});

test('a 503 that persists after the retry fails', async () => {
  const r = await run(site([`${base}/down`]));
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, new RegExp(`BROKEN: ${base}/down status: 503`));
  assert.equal(hits.get('/down'), 4); // HEAD, GET, then the same again
});

test('an unreachable host warns, and fails under --strict', async () => {
  // Port 9 (discard) on loopback: nothing listens, the connection is refused.
  const dir = site(['http://127.0.0.1:9/gone']);
  const lenient = await run(dir);
  assert.equal(lenient.code, 0, lenient.out);
  assert.match(lenient.out, /UNREACHABLE: http:\/\/127\.0\.0\.1:9\/gone \( ECONNREFUSED \)/);
  const strict = await run(dir, ['--strict']);
  assert.equal(strict.code, 2, strict.out);
  assert.match(strict.out, /--strict: treating 1 unreachable URL\(s\) as failures/);
});

test('data/ sources are checked, and ones marked unavailable are listed, not fetched', async () => {
  const dir = site([`${base}/ok`], {
    'data/conflicts/x.json': {
      initiatives: [{ sourceUrl: `${base}/dead` }],
      sources: [{ url: `${base}/gone`, sourceUnavailable: { checkedOn: '2026-10-21' } }]
    }
  });
  const r = await run(dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, new RegExp(`BROKEN: ${base}/dead status: 404 - cited by data/conflicts/x.json`));
  assert.match(r.out, new RegExp(`MARKED UNAVAILABLE \\(checked 2026-10-21\\): ${base}/gone - in data/conflicts/x.json`));
  assert.equal(hits.get('/gone'), undefined);
  assert.match(r.out, /Not fetched: 1 relative\/non-http link, 0 asset links, 0 links to this site \(no data\/site\.json\), 1 source marked unavailable/);
});

test('an unreadable data file fails the run', async () => {
  const dir = site([`${base}/ok`]);
  fs.mkdirSync(path.join(dir, 'data', 'conflicts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', 'conflicts', 'bad.json'), '{ not json');
  const r = await run(dir);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /Could not read 1 file\(s\): data\/conflicts\/bad\.json/);
});
