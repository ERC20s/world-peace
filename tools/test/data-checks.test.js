// Schema, rule, page-vs-data and meta checks in tools/data-checks.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ROOT, schemaErrors, conflictRuleErrors, organisationRuleErrors, validateDataFiles, checkConflictPage, checkPageMeta
} = require('../data-checks');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const liberia = () => JSON.parse(read('data/conflicts/liberia.json'));
const orgExample = () => JSON.parse(read('data/examples/organisation-example.json'));

test('the committed data files validate', () => {
  const result = validateDataFiles();
  assert.deepEqual(result.errors, []);
  assert.deepEqual([...result.conflicts.keys()].sort(), ['liberia', 'northern-ireland']);
});

test('a valid conflict entry has no schema errors', () => {
  assert.deepEqual(schemaErrors('conflict', liberia()), []);
});

test('country codes must be ISO 3166-1 alpha-2', () => {
  const c = liberia();
  c.initiatives[0].country = 'UK';
  assert.deepEqual(schemaErrors('conflict', c), ['/initiatives/0/country must be one of the allowed values (got "UK")']);

  const o = orgExample();
  o.country = 'Example Country';
  assert.deepEqual(schemaErrors('organisation', o), ['/country must be one of the allowed values (got "Example Country")']);
});

test('the country list has the 249 ISO codes plus XK, each a named region', () => {
  const defs = JSON.parse(read('data/defs.schema.json'));
  const codes = defs.definitions.countryCode.enum;
  assert.equal(codes.length, 250);
  assert.equal(new Set(codes).size, 250);
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const unnamed = codes.filter(c => !/^[A-Z]{2}$/.test(c) || names.of(c) === c);
  assert.deepEqual(unnamed, []);
});

test('dates must be real ISO dates', () => {
  const c = liberia();
  c.sourcesCheckedOn = '2026-02-30';
  assert.deepEqual(schemaErrors('conflict', c), ['/sourcesCheckedOn must match format "date"']);
  c.sourcesCheckedOn = '21/10/2026';
  assert.ok(schemaErrors('conflict', c).includes('/sourcesCheckedOn must match pattern "^\\d{4}-\\d{2}-\\d{2}$"'));
});

test('URLs must be absolute http(s) URLs', () => {
  for (const bad of ['ftp://example.org/x', 'www.usip.org/x', 'https://localhost/x']) {
    const c = liberia();
    c.initiatives[1].sourceUrl = bad;
    const errs = schemaErrors('conflict', c);
    assert.ok(errs.some(e => e.startsWith('/initiatives/1/sourceUrl must match pattern')), `${bad}: ${errs}`);
  }
});

test('required fields and the type list are enforced', () => {
  const c = liberia();
  delete c.initiatives[2].startYear;
  c.initiatives[3].type = 'fundraising';
  assert.deepEqual(schemaErrors('conflict', c), [
    "/initiatives/2 must have required property 'startYear'",
    '/initiatives/3/type must be one of the allowed values (got "fundraising")'
  ]);
});

test('rules a schema cannot express', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const c = liberia();
  assert.deepEqual(conflictRuleErrors(c, now), []);
  c.sourcesCheckedOn = '2026-10-23';
  c.initiatives[0].startYear = 2027;
  c.initiatives[1].country = 'GH';
  c.dateRange = { start: '2003', end: '1989' };
  assert.deepEqual(conflictRuleErrors(c, now), [
    'sourcesCheckedOn 2026-10-23 is in the future',
    'dateRange ends (1989) before it starts (2003)',
    '/initiatives/0/startYear 2027 is in the future',
    "/initiatives/1/country GH is not one of the conflict's countries (LR)"
  ]);
});

test('a date already begun east of UTC is not in the future', () => {
  // 20:00 UTC on 21 October is 07:00 on 22 October in Sydney (UTC+11).
  const now = new Date('2026-10-21T20:00:00Z');
  const c = liberia();
  c.sourcesCheckedOn = '2026-10-22';
  c.initiatives[0].sourceUnavailable = { checkedOn: '2026-10-22' };
  assert.deepEqual(conflictRuleErrors(c, now), []);
  const o = orgExample();
  o.sourcesCheckedOn = '2026-10-22';
  assert.deepEqual(organisationRuleErrors(o, now), []);

  // A date that has not begun anywhere yet (UTC+14 is the furthest ahead).
  c.sourcesCheckedOn = '2026-10-23';
  assert.deepEqual(conflictRuleErrors(c, now), ['sourcesCheckedOn 2026-10-23 is in the future']);
  o.sourcesCheckedOn = '2026-10-23';
  assert.deepEqual(organisationRuleErrors(o, now), ['sourcesCheckedOn 2026-10-23 is in the future']);
});

test('a dateRange is compared at full precision when both ends are dates', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const c = liberia();
  c.dateRange = { start: '2003-08-18', end: '2003-01-01' };
  assert.deepEqual(conflictRuleErrors(c, now), ['dateRange ends (2003-01-01) before it starts (2003-08-18)']);
  // A bare year covers the whole year, so it neither starts nor ends early.
  c.dateRange = { start: '2003', end: '2003-01-01' };
  assert.deepEqual(conflictRuleErrors(c, now), []);
  c.dateRange = { start: '2003-08-18', end: '2003' };
  assert.deepEqual(conflictRuleErrors(c, now), []);
  c.dateRange = { start: '2003-08-18', end: '2002' };
  assert.deepEqual(conflictRuleErrors(c, now), ['dateRange ends (2002) before it starts (2003-08-18)']);
});

test('http:// URLs in data/ need ALLOW_HTTP_SOURCES, like page links', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const c = liberia();
  c.initiatives[0].sourceUrl = 'http://www.nobelprize.org/prizes/peace/2011/gbowee/facts/';
  c.initiatives[0].sourceUnavailable = { checkedOn: '2026-10-21' };
  c.sources[3].url = 'http://peacekeeping.un.org/mission/unmil';
  assert.deepEqual(conflictRuleErrors(c, now), [
    '/initiatives/0/sourceUrl http://www.nobelprize.org/prizes/peace/2011/gbowee/facts/ must use https (set ALLOW_HTTP_SOURCES to allow http)',
    '/sources/3/url http://peacekeeping.un.org/mission/unmil must use https (set ALLOW_HTTP_SOURCES to allow http)'
  ]);
  assert.deepEqual(conflictRuleErrors(c, now, true), []);

  const o = orgExample();
  o.website = 'http://example.org';
  o.contact = 'http://example.org/contact';
  assert.deepEqual(organisationRuleErrors(o, now), [
    '/website http://example.org must use https (set ALLOW_HTTP_SOURCES to allow http)',
    '/contact http://example.org/contact must use https (set ALLOW_HTTP_SOURCES to allow http)'
  ]);
  assert.deepEqual(organisationRuleErrors(o, now, true), []);
  o.website = 'https://example.org';
  o.contact = 'mailto:info@example.org';
  assert.deepEqual(organisationRuleErrors(o, now), []);
});

test('each conflict page matches its data', () => {
  for (const slug of ['liberia', 'northern-ireland']) {
    const data = JSON.parse(read(`data/conflicts/${slug}.json`));
    assert.deepEqual(checkConflictPage(`conflicts/${slug}.html`, read(`conflicts/${slug}.html`), data), []);
  }
});

test('a page that drifts from its data fails', () => {
  const html = read('conflicts/liberia.html');
  const data = liberia();

  const renamed = html.replace('<strong>WIPNET (Women in Peacebuilding Network)</strong>', '<strong>WIPNET</strong>');
  assert.deepEqual(checkConflictPage('p', renamed, data), [
    'p initiative 2 is named "WIPNET" on the page but "WIPNET (Women in Peacebuilding Network)" in the data (same order, same <strong> text)'
  ]);

  const dated = html.replace('Sources last checked: 2026-10-21', 'Sources last checked: 2026-10-01');
  assert.deepEqual(checkConflictPage('p', dated, data), [
    'p says "Sources last checked: 2026-10-01" but its data says sourcesCheckedOn 2026-10-21'
  ]);

  const relinked = html.replace(
    '<a href="https://www.usip.org/publications/2006/02/truth-commission-liberia">USIP',
    '<a href="https://www.usip.org/other">USIP');
  assert.deepEqual(checkConflictPage('p', relinked, data), [
    'p initiative 4 ("Truth and Reconciliation Commission of Liberia") does not link https://www.usip.org/publications/2006/02/truth-commission-liberia, the source recorded in the data'
  ]);
});

test('a dead source is kept and marked, not deleted', () => {
  const url = 'https://www.usip.org/publications/2006/02/truth-commission-liberia';
  const data = liberia();
  data.initiatives[3].sourceUnavailable = { checkedOn: '2026-10-21' };
  const html = read('conflicts/liberia.html');

  // Data marked, page still links it: two problems.
  assert.deepEqual(checkConflictPage('p', html, data), [
    `p initiative 4 ("Truth and Reconciliation Commission of Liberia") still links ${url}, which the data marks unavailable; show the URL as text instead`,
    `p initiative 4 ("Truth and Reconciliation Commission of Liberia") must say "source unavailable (checked 2026-10-21)" (the data marks ${url} unavailable)`
  ]);

  // Page shows the URL as text with the mark: accepted.
  const marked = html.replace(
    `<a href="${url}">USIP — Truth Commission of Liberia report</a>`,
    `USIP — Truth Commission of Liberia report, ${url} — source unavailable (checked 2026-10-21)`);
  assert.deepEqual(checkConflictPage('p', marked, data), []);

  // The mark without the URL itself loses the record of what was cited.
  const noUrl = marked.replace(`, ${url} — source`, ' — source');
  assert.deepEqual(checkConflictPage('p', noUrl, data), [
    `p initiative 4 ("Truth and Reconciliation Commission of Liberia") must still show the unavailable URL ${url} as text`
  ]);

  // Page marked but the data is not: rejected.
  delete data.initiatives[3].sourceUnavailable;
  const errs = checkConflictPage('p', marked, data);
  assert.ok(errs.includes(`p initiative 4 ("Truth and Reconciliation Commission of Liberia") says "source unavailable (checked 2026-10-21)" but the data does not mark ${url} unavailable`), errs.join('\n'));
});

test('every site page carries description, canonical and Open Graph tags', () => {
  for (const p of ['index.html', 'initiatives.html', 'conflicts/liberia.html', 'content/organisations/index.html']) {
    assert.deepEqual(checkPageMeta(p, read(p)), [], p);
  }
});

test('missing or wrong meta tags fail', () => {
  const html = read('conflicts/liberia.html');
  const noOgUrl = html.replace(/\s*<meta property="og:url"[^>]*>/, '');
  assert.deepEqual(checkPageMeta('conflicts/liberia.html', noOgUrl), ['conflicts/liberia.html has no <meta property="og:url">']);

  assert.deepEqual(checkPageMeta('conflicts/northern-ireland.html', html), [
    '<link rel="canonical"> must be https://erc20s.github.io/world-peace/conflicts/northern-ireland.html (found https://erc20s.github.io/world-peace/conflicts/liberia.html)',
    'og:url must be "https://erc20s.github.io/world-peace/conflicts/northern-ireland.html" (found "https://erc20s.github.io/world-peace/conflicts/liberia.html")'
  ].map(e => 'conflicts/northern-ireland.html ' + e));

  const noDescription = html.replace(/\s*<meta name="description"[^>]*>/, '');
  assert.ok(checkPageMeta('conflicts/liberia.html', noDescription)
    .includes('conflicts/liberia.html has no <meta name="description" content="..."> (or it is empty)'));
});
