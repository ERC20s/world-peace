#!/usr/bin/env node
// tools/build-site.js
// Regenerates the parts of the site that are derived from data/:
//   - initiatives.html: the initiative list and the country/type filter
//     options, between <!-- build-site:NAME --> ... <!-- /build-site:NAME -->
//     markers (everything outside the markers is hand-written);
//   - sitemap.xml: every public page (pages marked noindex are left out).
//
// Usage: node tools/build-site.js           write the files
//        node tools/build-site.js --check   exit 2 if either file is stale
// tools/validate-pages.js runs the same staleness check.

const fs = require('fs');
const path = require('path');
const data = require('./data-checks');

const { ROOT, escapeHtml, pageUrl, unavailableText } = data;

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

// Sort order for generated text. A fixed locale, not the machine's: the
// output is committed and checked for staleness, so it must not change with
// LANG / LC_ALL (Estonian, for one, sorts "Zambia" before "Tanzania").
const collator = new Intl.Collator('en');

function countryName(code) {
  return regionNames.of(code);
}

// "civil-society-mobilisation" -> "Civil society mobilisation"
function typeLabel(type) {
  const words = type.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Initiatives from every conflict, ordered by conflict title, then start year, then name.
function allInitiatives(conflicts) {
  const out = [];
  const list = [...conflicts.values()].sort((a, b) => collator.compare(a.title, b.title));
  for (const c of list) {
    const items = c.initiatives.slice().sort((a, b) => a.startYear - b.startYear || collator.compare(a.name, b.name));
    for (const it of items) out.push({ conflict: c, initiative: it });
  }
  return out;
}

function renderInitiativeItems(conflicts, indent) {
  return allInitiatives(conflicts).map(({ conflict, initiative: it }) => {
    const source = it.sourceUnavailable
      ? `Source: ${escapeHtml(it.sourceUrl)} — ${unavailableText(it.sourceUnavailable.checkedOn)}`
      : `<a href="${escapeHtml(it.sourceUrl)}">Source</a>`;
    return [
      `<li data-country="${it.country}" data-type="${it.type}" data-year="${it.startYear}">`,
      `  <strong>${escapeHtml(it.name)}</strong> — ${escapeHtml(it.description)}`,
      `  <br><span class="muted">${escapeHtml(countryName(it.country))} · ${escapeHtml(typeLabel(it.type))} · ` +
        `Started ${it.startYear} · Run by ${escapeHtml(it.organisation)} · ` +
        `<a href="conflicts/${conflict.slug}.html">${escapeHtml(conflict.title)} page</a> · ${source}</span>`,
      `</li>`
    ].map(line => indent + line).join('\n');
  }).join('\n');
}

function renderOptions(pairs, indent) {
  return pairs.map(([value, label]) => `${indent}<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('\n');
}

function renderCountryOptions(conflicts, indent) {
  const codes = new Set();
  for (const { initiative } of allInitiatives(conflicts)) codes.add(initiative.country);
  const pairs = [...codes].map(c => [c, countryName(c)]).sort((a, b) => collator.compare(a[1], b[1]));
  return renderOptions(pairs, indent);
}

function renderTypeOptions(conflicts, indent) {
  const types = new Set();
  for (const { initiative } of allInitiatives(conflicts)) types.add(initiative.type);
  return renderOptions([...types].sort().map(t => [t, typeLabel(t)]), indent);
}

// Replace the content between <!-- build-site:NAME --> and <!-- /build-site:NAME -->,
// indented like the opening marker.
function fillBlock(html, name, render) {
  const re = new RegExp('([ \\t]*)<!-- build-site:' + name + ' -->\\n[\\s\\S]*?([ \\t]*)<!-- /build-site:' + name + ' -->');
  const m = re.exec(html);
  if (!m) throw new Error(`initiatives.html has no <!-- build-site:${name} --> ... <!-- /build-site:${name} --> block`);
  const indent = m[1];
  const body = render(indent);
  const replacement = `${indent}<!-- build-site:${name} -->\n${body ? body + '\n' : ''}${indent}<!-- /build-site:${name} -->`;
  return html.slice(0, m.index) + replacement + html.slice(m.index + m[0].length);
}

function buildInitiativesPage(current, conflicts) {
  let html = current;
  html = fillBlock(html, 'country-options', ind => renderCountryOptions(conflicts, ind));
  html = fillBlock(html, 'type-options', ind => renderTypeOptions(conflicts, ind));
  html = fillBlock(html, 'initiatives', ind => renderInitiativeItems(conflicts, ind));
  return html;
}

function listHtml(dir) {
  try {
    return fs.readdirSync(path.join(ROOT, dir)).filter(f => /\.html$/.test(f)).sort().map(f => dir + '/' + f);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Every public page, repository-relative. templates/ is not part of the site.
function sitePages() {
  const root = fs.readdirSync(ROOT).filter(f => /\.html$/.test(f)).sort();
  // The home page first, then the rest in path order.
  root.sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : collator.compare(a, b)));
  return [...root, ...listHtml('conflicts'), ...listHtml('content/organisations')];
}

function buildSitemap(pages) {
  const indexed = pages.filter(p => !data.isNoindex(fs.readFileSync(path.join(ROOT, p), 'utf8')));
  const urls = indexed.map(p => `  <url><loc>${escapeHtml(pageUrl(p))}</loc></url>`).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>\n';
}

// { 'initiatives.html': html, 'sitemap.xml': xml } as they should be on disk.
// Throws when the data does not validate: nothing is generated from bad data.
function buildOutputs() {
  const result = data.validateDataFiles();
  if (result.errors.length) {
    const err = new Error('data/ does not validate; run npm run validate-pages for details:\n- ' + result.errors.join('\n- '));
    err.dataErrors = result.errors;
    throw err;
  }
  const current = fs.readFileSync(path.join(ROOT, 'initiatives.html'), 'utf8');
  return {
    'initiatives.html': buildInitiativesPage(current, result.conflicts),
    'sitemap.xml': buildSitemap(sitePages())
  };
}

// Files whose content differs from what buildOutputs() would write.
function staleOutputs(outputs) {
  return Object.keys(outputs).filter(f => {
    let onDisk = null;
    try { onDisk = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (err) { /* missing = stale */ }
    return onDisk !== outputs[f];
  });
}

function main() {
  const CHECK = process.argv.includes('--check');
  const outputs = buildOutputs();
  const stale = staleOutputs(outputs);
  if (CHECK) {
    if (stale.length) {
      console.error('Out of date:', stale.join(', '), '- run npm run build-site and commit the result.');
      process.exit(2);
    }
    console.log('Up to date:', Object.keys(outputs).join(', '));
    return;
  }
  for (const f of Object.keys(outputs)) {
    if (stale.includes(f)) {
      fs.writeFileSync(path.join(ROOT, f), outputs[f], 'utf8');
      console.log('Wrote', f);
    } else {
      console.log('Unchanged', f);
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}

module.exports = {
  buildOutputs,
  staleOutputs,
  buildInitiativesPage,
  buildSitemap,
  sitePages,
  countryName,
  typeLabel
};
