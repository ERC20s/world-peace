// Structured-data checks for ERC20s/world-peace, shared by
// tools/validate-pages.js, tools/build-site.js and tools/test/.
//
// - validateDataFiles(): every data/conflicts/*.json, data/organisations/*.json
//   and data/examples/*.json against the JSON Schemas in data/ (required
//   fields, http(s) URLs, ISO dates, ISO 3166-1 country codes), plus the rules
//   a schema cannot express (dates not in the future, start before end).
// - checkConflictPage(): a conflicts/<slug>.html page against its
//   data/conflicts/<slug>.json entry, so the page and the data cannot drift.
// - checkPageMeta(): description, canonical and Open Graph tags on a page.

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SITE = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'site.json'), 'utf8'));

// The visible mark a page carries for a source that no longer answers.
const UNAVAILABLE_RE = /source unavailable \(checked (\d{4}-\d{2}-\d{2})\)/i;

function unavailableText(checkedOn) {
  return 'source unavailable (checked ' + checkedOn + ')';
}

let _validators = null;
function validators() {
  if (_validators) return _validators;
  // verbose: errors carry the offending value, so messages can quote it.
  const ajv = new Ajv({ allErrors: true, strict: true, verbose: true });
  addFormats(ajv);
  const load = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
  ajv.addSchema(load('defs.schema.json'));
  _validators = {
    conflict: ajv.compile(load('conflict.schema.json')),
    organisation: ajv.compile(load('organisation.schema.json'))
  };
  return _validators;
}

function formatAjvError(e) {
  const where = e.instancePath || '(root)';
  if (e.keyword === 'enum') return `${where} must be one of the allowed values (got ${JSON.stringify(e.data)})`;
  if (e.keyword === 'additionalProperties') return `${where} has unknown property "${e.params.additionalProperty}"`;
  return `${where} ${e.message}`;
}

// Schema errors as readable strings; [] when valid.
function schemaErrors(kind, data) {
  const validate = validators()[kind];
  if (validate(data)) return [];
  // anyOf failures repeat each branch's error; keep each message once.
  return Array.from(new Set(validate.errors.map(formatAjvError)));
}

function todayIso(now) {
  return (now || new Date()).toISOString().slice(0, 10);
}

// Rules a JSON Schema cannot express. Assumes the entry passed the schema.
function conflictRuleErrors(data, now) {
  const errors = [];
  const today = todayIso(now);
  const thisYear = Number(today.slice(0, 4));

  if (data.sourcesCheckedOn > today) {
    errors.push(`sourcesCheckedOn ${data.sourcesCheckedOn} is in the future`);
  }
  if (data.dateRange && data.dateRange.end && data.dateRange.end !== 'ongoing' &&
      data.dateRange.end.slice(0, 4) < data.dateRange.start.slice(0, 4)) {
    errors.push(`dateRange ends (${data.dateRange.end}) before it starts (${data.dateRange.start})`);
  }

  const names = new Set();
  data.initiatives.forEach((it, i) => {
    if (names.has(it.name)) errors.push(`/initiatives/${i}/name "${it.name}" is listed twice`);
    names.add(it.name);
    if (it.startYear > thisYear) errors.push(`/initiatives/${i}/startYear ${it.startYear} is in the future`);
    if (!data.countries.includes(it.country)) {
      errors.push(`/initiatives/${i}/country ${it.country} is not one of the conflict's countries (${data.countries.join(', ')})`);
    }
    if (it.sourceUnavailable && it.sourceUnavailable.checkedOn > today) {
      errors.push(`/initiatives/${i}/sourceUnavailable/checkedOn ${it.sourceUnavailable.checkedOn} is in the future`);
    }
  });

  const urls = new Set();
  data.sources.forEach((s, i) => {
    if (urls.has(s.url)) errors.push(`/sources/${i}/url ${s.url} is listed twice`);
    urls.add(s.url);
    if (s.sourceUnavailable && s.sourceUnavailable.checkedOn > today) {
      errors.push(`/sources/${i}/sourceUnavailable/checkedOn ${s.sourceUnavailable.checkedOn} is in the future`);
    }
  });
  return errors;
}

function organisationRuleErrors(data, now) {
  const errors = [];
  if (data.sourcesCheckedOn && data.sourcesCheckedOn > todayIso(now)) {
    errors.push(`sourcesCheckedOn ${data.sourcesCheckedOn} is in the future`);
  }
  return errors;
}

function listJson(dir) {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => path.join(dir, f));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

// Validate every data file. Returns { errors, notes, conflicts } where
// conflicts maps slug -> parsed data for the entries that passed.
function validateDataFiles(opts) {
  const now = opts && opts.now;
  const errors = [];
  const notes = [];
  const conflicts = new Map();

  const check = (file, kind, idKey) => {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      errors.push(`${rel(file)} is not valid JSON: ${err.message}`);
      return null;
    }
    const schemaErrs = schemaErrors(kind, data);
    if (schemaErrs.length) {
      for (const e of schemaErrs) errors.push(`${rel(file)}: ${e}`);
      return null;
    }
    const ruleErrs = kind === 'conflict' ? conflictRuleErrors(data, now) : organisationRuleErrors(data, now);
    for (const e of ruleErrs) errors.push(`${rel(file)}: ${e}`);
    if (idKey) {
      const expected = path.basename(file, '.json');
      if (data[idKey] !== expected) {
        errors.push(`${rel(file)}: ${idKey} "${data[idKey]}" must match the file name "${expected}"`);
        return null;
      }
    }
    return ruleErrs.length ? null : data;
  };

  const conflictFiles = listJson(path.join(DATA_DIR, 'conflicts'));
  if (!conflictFiles.length) errors.push('data/conflicts/ has no conflict data files');
  for (const f of conflictFiles) {
    const data = check(f, 'conflict', 'slug');
    if (data) conflicts.set(data.slug, data);
  }

  const orgFiles = listJson(path.join(DATA_DIR, 'organisations'));
  if (!orgFiles.length) notes.push('data/organisations/ has no organisation data files yet (only the example is validated)');
  for (const f of orgFiles) check(f, 'organisation', 'id');

  check(path.join(DATA_DIR, 'examples', 'conflict-example.json'), 'conflict', null);
  check(path.join(DATA_DIR, 'examples', 'organisation-example.json'), 'organisation', null);

  return { errors, notes, conflicts };
}

// --- HTML helpers -----------------------------------------------------------

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function textOf(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function hrefsOf(html) {
  const re = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(decodeEntities((m[1] || m[2] || m[3] || '').trim()));
  return out;
}

// The <li> inner HTML of the first <ul> after the <h2> with this text, or null.
function sectionListItems(html, heading) {
  const h = new RegExp('<h2[^>]*>\\s*' + heading + '\\s*</h2>', 'i').exec(html);
  if (!h) return null;
  let section = html.slice(h.index + h[0].length);
  const next = section.search(/<h2\b/i);
  if (next !== -1) section = section.slice(0, next);
  const ul = /<ul\b[^>]*>([\s\S]*?)<\/ul>/i.exec(section);
  if (!ul) return null;
  const items = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(ul[1])) !== null) items.push(m[1]);
  return items;
}

// One page list entry against one data entry: linked when the source is
// available, shown as text with the unavailable mark when it is not.
function sourceRefErrors(where, li, url, unavailable) {
  const errors = [];
  const linked = hrefsOf(li).includes(url);
  const mark = UNAVAILABLE_RE.exec(textOf(li));
  if (unavailable) {
    if (linked) errors.push(`${where} still links ${url}, which the data marks unavailable; show the URL as text instead`);
    else if (textOf(li).indexOf(url) === -1) errors.push(`${where} must still show the unavailable URL ${url} as text`);
    if (!mark || mark[1] !== unavailable.checkedOn) {
      errors.push(`${where} must say "${unavailableText(unavailable.checkedOn)}" (the data marks ${url} unavailable)`);
    }
  } else {
    if (!linked) errors.push(`${where} does not link ${url}, the source recorded in the data`);
    if (mark) errors.push(`${where} says "${mark[0]}" but the data does not mark ${url} unavailable`);
  }
  return errors;
}

// A conflict page against its data entry. Returns a list of error strings.
function checkConflictPage(file, html, data) {
  const errors = [];
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!h1 || textOf(h1[1]) !== data.title) {
    errors.push(`${file} <h1> must be the data title "${data.title}" (found "${h1 ? textOf(h1[1]) : ''}")`);
  }

  const checked = /Sources last checked:\s*(\d{4}-\d{2}-\d{2})/.exec(html);
  if (checked && checked[1] !== data.sourcesCheckedOn) {
    errors.push(`${file} says "Sources last checked: ${checked[1]}" but its data says sourcesCheckedOn ${data.sourcesCheckedOn}`);
  }

  const items = sectionListItems(html, 'Initiatives and organisations') || [];
  if (items.length !== data.initiatives.length) {
    errors.push(`${file} lists ${items.length} initiatives but its data has ${data.initiatives.length}`);
  }
  data.initiatives.forEach((it, i) => {
    const li = items[i];
    if (li === undefined) return;
    const strong = /<strong[^>]*>([\s\S]*?)<\/strong>/i.exec(li);
    const name = strong ? textOf(strong[1]) : '';
    const where = `${file} initiative ${i + 1}`;
    if (name !== it.name) {
      errors.push(`${where} is named "${name}" on the page but "${it.name}" in the data (same order, same <strong> text)`);
      return;
    }
    errors.push(...sourceRefErrors(`${where} ("${it.name}")`, li, it.sourceUrl, it.sourceUnavailable));
  });

  const sources = sectionListItems(html, 'Sources') || [];
  if (sources.length !== data.sources.length) {
    errors.push(`${file} lists ${sources.length} sources but its data has ${data.sources.length}`);
  }
  data.sources.forEach((s, i) => {
    if (sources[i] === undefined) return;
    errors.push(...sourceRefErrors(`${file} source ${i + 1}`, sources[i], s.url, s.sourceUnavailable));
  });
  return errors;
}

// --- Page meta --------------------------------------------------------------

// The public URL of a repository-relative page; the home page is the base URL.
function pageUrl(relPath) {
  return relPath === 'index.html' ? SITE.baseUrl : SITE.baseUrl + relPath;
}

function metaContent(html, attr, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = new RegExp('\\b' + attr + '\\s*=\\s*"' + name.replace(/[.:]/g, '\\$&') + '"', 'i');
    if (key.test(tag)) {
      const c = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag);
      return c ? decodeEntities(c[1]) : '';
    }
  }
  return null;
}

function isNoindex(html) {
  const robots = metaContent(html, 'name', 'robots');
  return robots !== null && /\bnoindex\b/i.test(robots);
}

function checkPageMeta(relPath, html) {
  const errors = [];
  const where = relPath;
  const url = pageUrl(relPath);

  const title = /<title>([\s\S]*?)<\/title>/i.exec(html);
  const titleText = title ? textOf(title[1]) : '';
  if (!titleText) errors.push(`${where} has no <title>`);

  const description = metaContent(html, 'name', 'description');
  if (!description) {
    errors.push(`${where} has no <meta name="description" content="..."> (or it is empty)`);
  } else if (description.length > 300) {
    errors.push(`${where} meta description is ${description.length} characters; keep it to 300`);
  }

  const canonical = /<link\b[^>]*\brel\s*=\s*"canonical"[^>]*>/i.exec(html);
  const canonicalHref = canonical ? (/\bhref\s*=\s*"([^"]*)"/i.exec(canonical[0]) || [])[1] : null;
  if (canonicalHref !== url) {
    errors.push(`${where} <link rel="canonical"> must be ${url} (found ${canonicalHref || 'none'})`);
  }

  const expected = {
    'og:title': titleText,
    'og:description': description,
    'og:url': url,
    'og:site_name': SITE.name
  };
  for (const [prop, want] of Object.entries(expected)) {
    const got = metaContent(html, 'property', prop);
    if (got === null || got === '') errors.push(`${where} has no <meta property="${prop}">`);
    else if (want && got !== want) errors.push(`${where} ${prop} must be "${want}" (found "${got}")`);
  }
  const ogType = metaContent(html, 'property', 'og:type');
  if (ogType !== 'website' && ogType !== 'article') {
    errors.push(`${where} <meta property="og:type"> must be "website" or "article" (found ${ogType === null ? 'none' : '"' + ogType + '"'})`);
  }
  return errors;
}

module.exports = {
  ROOT,
  SITE,
  UNAVAILABLE_RE,
  unavailableText,
  schemaErrors,
  conflictRuleErrors,
  validateDataFiles,
  checkConflictPage,
  checkPageMeta,
  pageUrl,
  isNoindex,
  sectionListItems,
  escapeHtml,
  textOf,
  hrefsOf
};
