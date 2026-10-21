// tools/build-site.js: generated initiatives list, filter options and sitemap.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT } = require('../data-checks');
const {
  buildOutputs, staleOutputs, buildInitiativesPage, buildSitemap, sitePages, typeLabel
} = require('../build-site');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the committed initiatives.html and sitemap.xml are up to date', () => {
  assert.deepEqual(staleOutputs(buildOutputs()), []);
});

test('every initiative in data/ is listed once, with its filter attributes', () => {
  const html = read('initiatives.html');
  for (const slug of ['liberia', 'northern-ireland']) {
    const data = JSON.parse(read(`data/conflicts/${slug}.json`));
    for (const it of data.initiatives) {
      const attrs = `<li data-country="${it.country}" data-type="${it.type}" data-year="${it.startYear}">`;
      assert.equal(html.split(attrs).length - 1, 1, `${it.name}: ${attrs}`);
    }
  }
});

test('generated text is HTML-escaped and an unavailable source is shown as text', () => {
  const shell = [
    '<select>', '  <!-- build-site:country-options -->', '  <!-- /build-site:country-options -->', '</select>',
    '<select>', '  <!-- build-site:type-options -->', '  <!-- /build-site:type-options -->', '</select>',
    '<ul>', '  <!-- build-site:initiatives -->', '  <!-- /build-site:initiatives -->', '</ul>'
  ].join('\n');
  const conflicts = new Map([['x', {
    slug: 'x',
    title: 'X & Y',
    initiatives: [{
      name: '<script>alert(1)</script>',
      organisation: 'Org "Q"',
      description: 'd',
      country: 'LR',
      type: 'dialogue',
      startYear: 2001,
      sourceUrl: 'https://example.org/a?b=1&c=2',
      sourceUnavailable: { checkedOn: '2026-10-21' }
    }]
  }]]);
  const out = buildInitiativesPage(shell, conflicts);
  assert.ok(out.includes('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>'));
  assert.ok(out.includes('Run by Org &quot;Q&quot;'));
  assert.ok(out.includes('X &amp; Y page'));
  assert.ok(out.includes('Source: https://example.org/a?b=1&amp;c=2 — source unavailable (checked 2026-10-21)'));
  assert.ok(!out.includes('href="https://example.org/a'));
  assert.ok(out.includes('  <option value="LR">Liberia</option>'));
  assert.ok(out.includes('  <option value="dialogue">Dialogue</option>'));
});

test('a page without its build markers is an error, not a silent no-op', () => {
  assert.throws(() => buildInitiativesPage('<ul></ul>', new Map()), /no <!-- build-site:country-options -->/);
});

test('the sitemap lists every public page except noindex ones', () => {
  const pages = sitePages();
  assert.ok(pages.includes('content/organisations/example-organisation.html'));
  assert.ok(!pages.some(p => p.startsWith('templates/')));
  const xml = buildSitemap(pages);
  assert.ok(xml.includes('<loc>https://erc20s.github.io/world-peace/</loc>'));
  assert.ok(xml.includes('<loc>https://erc20s.github.io/world-peace/conflicts/liberia.html</loc>'));
  assert.ok(xml.includes('<loc>https://erc20s.github.io/world-peace/initiatives.html</loc>'));
  // The worked example carries <meta name="robots" content="noindex">.
  assert.ok(!xml.includes('example-organisation.html'));
  assert.equal((xml.match(/<url>/g) || []).length, pages.length - 1);
});

test('the generated order does not depend on the machine locale', () => {
  // Estonian collation puts Z before T; the committed output must not care.
  const script = `
    const { buildInitiativesPage } = require(${JSON.stringify(path.join(ROOT, 'tools', 'build-site.js'))});
    const shell = ['<!-- build-site:country-options -->', '<!-- /build-site:country-options -->',
      '<!-- build-site:type-options -->', '<!-- /build-site:type-options -->',
      '<!-- build-site:initiatives -->', '<!-- /build-site:initiatives -->'].join('\\n');
    const conflict = (slug, title, country, name) => [slug, { slug, title, initiatives: [
      { name, organisation: 'o', description: 'd', country, type: 'dialogue', startYear: 2000, sourceUrl: 'https://a.org/' }
    ] }];
    process.stdout.write(buildInitiativesPage(shell, new Map([
      conflict('zambia', 'Zambia', 'ZM', 'Zeta'),
      conflict('tanzania', 'Tanzania', 'TZ', 'Tau')
    ])));`;
  const build = (locale) => execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, LC_ALL: locale, LANG: locale }, encoding: 'utf8'
  });
  const english = build('en_US.UTF-8');
  assert.equal(build('et_EE.UTF-8'), english);
  assert.ok(english.indexOf('<option value="TZ">') < english.indexOf('<option value="ZM">'), english);
  assert.ok(english.indexOf('<strong>Tau</strong>') < english.indexOf('<strong>Zeta</strong>'), english);
});

test('type labels read as words', () => {
  assert.equal(typeLabel('civil-society-mobilisation'), 'Civil society mobilisation');
  assert.equal(typeLabel('dialogue'), 'Dialogue');
});
