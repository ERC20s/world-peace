#!/usr/bin/env node
// tools/validate-pages.js
// Lightweight repository-only page validator for ERC20s/world-peace
// Usage: node tools/validate-pages.js

const fs = require('fs').promises;
const path = require('path');

function extractHrefValues(text) {
  const hrefRe = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  const out = [];
  let m;
  while ((m = hrefRe.exec(text)) !== null) {
    out.push(m[1] || m[2] || m[3] || '');
  }
  return out;
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch (e) {
    return false;
  }
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

function isoDatePresent(text) {
  return /Sources last checked:\s*\d{4}-\d{2}-\d{2}/.test(text);
}

// True when the href points at an external source: http://, https:// or //host.
function isExternalHref(href) {
  return /^\s*(?:https?:)?\/\//i.test(String(href));
}

// True when the href points at a page under conflicts/ (any relative shape).
function looksLikeConflictLink(href) {
  return /(?:^|[\/.])conflicts\/[^\/]+\.html?(?:[?#].*)?$/i.test(String(href).trim());
}

// The only relative shapes an organisation page (content/organisations/<slug>.html)
// may use to reach a conflict page. '../conflicts/' is one level short and is
// rejected: it resolves to content/conflicts/, which does not exist.
function conflictLinkPathOk(href) {
  const h = String(href).trim();
  return h.startsWith('../../conflicts/') || h.startsWith('./../../conflicts/');
}

// Normalise a path to forward slashes so comparisons work on every platform.
function toPosix(p) {
  return String(p).split(path.sep).join('/').replace(/\\/g, '/');
}

// Normalise a home-page href ('conflicts/x.html', './conflicts/x.html') to
// the repository-relative path it points at, or null when it is not one.
function homeConflictHref(href) {
  const h = String(href).trim().replace(/[?#].*$/, '');
  if (!/^(?:\.\/)?conflicts\/[^\/]+\.html?$/i.test(h)) return null;
  return h.replace(/^\.\//, '');
}

// Read one attribute out of a tag's attribute string. Attribute order does not
// matter; a missing attribute returns null, a present-but-empty one returns ''.
function getAttr(attrs, name) {
  const re = new RegExp(name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const m = re.exec(String(attrs));
  if (!m) return null;
  return m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : (m[3] || ''));
}

// Strip a page down to lower-cased visible words, for keyword comparison.
function pageText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Pull the <li> items out of <ul id="conflict-list"> in index.html.
// Returns null when that list is not present. Each item is
// { attrs: '<li ...>' attribute text, html: inner HTML }.
function conflictListItems(text) {
  const ulOpen = /<ul\b[^>]*\bid\s*=\s*(?:"conflict-list"|'conflict-list'|conflict-list\b)[^>]*>/i.exec(text);
  if (!ulOpen) return null;
  const listStart = ulOpen.index + ulOpen[0].length;
  const closeIdx = text.toLowerCase().indexOf('</ul>', listStart);
  const inner = closeIdx === -1 ? text.slice(listStart) : text.slice(listStart, closeIdx);

  const items = [];
  const liRe = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(inner)) !== null) items.push({ attrs: m[1], html: m[2] });
  return items;
}

// Collapse a list item's HTML to a short readable label for error messages.
function itemLabel(html) {
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 80 ? text.slice(0, 77) + '...' : text;
}

// Pull the <li> items out of the first <ul> that follows the
// "Initiatives and organisations" <h2> on a conflict page.
// Returns null when the section (or its list) is not present.
function initiativeListItems(text) {
  const heading = /<h2[^>]*>\s*Initiatives and organisations\s*<\/h2>/i.exec(text);
  if (!heading) return null;

  // Only look inside this section: stop at the next <h2>.
  let section = text.slice(heading.index + heading[0].length);
  const nextHeading = section.search(/<h2\b/i);
  if (nextHeading !== -1) section = section.slice(0, nextHeading);

  const ulOpen = /<ul\b[^>]*>/i.exec(section);
  if (!ulOpen) return null;
  const listStart = ulOpen.index + ulOpen[0].length;
  const closeIdx = section.toLowerCase().indexOf('</ul>', listStart);
  const inner = closeIdx === -1 ? section.slice(listStart) : section.slice(listStart, closeIdx);

  const items = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(inner)) !== null) items.push(m[1]);
  return items;
}

async function runChecks() {
  const errors = [];
  const warnings = [];

  // Repository-relative conflict pages linked from index.html, in link order.
  const linkedConflictPages = [];

  // 1) Verify every <a href="conflicts/*.html"> referenced in index.html exists under conflicts/
  let indexTxt = null;
  try {
    const indexPath = path.join('index.html');
    indexTxt = await fs.readFile(indexPath, 'utf8');
    const hrefs = extractHrefValues(indexTxt);
    const conflictHrefs = hrefs.filter(h => /^\.*\/?conflicts\/.+\.html$/.test(h));
    for (const href of conflictHrefs) {
      // normalize: remove leading ./ if present
      const normalized = href.replace(/^\.\//, '');
      const target = path.join(normalized);
      const exists = await fileExists(target);
      if (!exists) {
        errors.push(`index.html references ${href} but ${target} does not exist`);
        console.error('ERROR: index.html ->', href, 'not found at', target);
      } else {
        console.log('OK: index.html ->', href);
      }
    }
  } catch (err) {
    // if index missing, that's an error
    errors.push('Failed to read index.html: ' + (err && err.message));
    console.error('ERROR: could not read index.html:', err && err.message);
  }

  // 1b) The home-page list itself: one conflict link and real keywords per item.
  if (indexTxt !== null) {
    const listItems = conflictListItems(indexTxt);
    if (listItems === null) {
      errors.push('index.html has no <ul id="conflict-list"> list');
      console.error('ERROR: index.html missing <ul id="conflict-list">');
    } else if (listItems.length === 0) {
      errors.push('index.html has an empty <ul id="conflict-list"> list');
      console.error('ERROR: index.html conflict list has no <li> items');
    } else {
      const seen = new Map();
      for (let i = 0; i < listItems.length; i++) {
        const item = listItems[i];
        const label = itemLabel(item.html) || `list item ${i + 1}`;
        const targets = extractHrefValues(item.html)
          .map(homeConflictHref)
          .filter(Boolean);

        if (targets.length !== 1) {
          errors.push(
            `index.html conflict list item "${label}" must contain exactly one ` +
            `<a href="conflicts/....html"> link (found ${targets.length})`
          );
          console.error('ERROR: index.html list item', label, 'has', targets.length, 'conflict links');
          continue;
        }

        const target = targets[0];
        if (seen.has(target)) {
          errors.push(`index.html lists ${target} more than once (items ${seen.get(target)} and ${i + 1})`);
          console.error('ERROR: index.html duplicate conflict link', target);
        } else {
          seen.set(target, i + 1);
          linkedConflictPages.push(target);
        }

        const keywords = getAttr(item.attrs, 'data-keywords');
        if (keywords === null || !String(keywords).trim()) {
          errors.push(`index.html list item for ${target} has no non-empty data-keywords attribute`);
          console.error('ERROR: index.html list item for', target, 'missing data-keywords');
          continue;
        }
        console.log('OK: index.html list item for', target, 'is linked and keyworded');

        // Keyword terms that do not appear on the page are a warning, not a
        // failure: honest synonyms and alternative spellings stay allowed.
        if (await fileExists(path.join(target))) {
          try {
            const targetTxt = pageText(await fs.readFile(path.join(target), 'utf8'));
            const missing = String(keywords)
              .split(/\s+/)
              .map(t => t.trim().toLowerCase())
              .filter(t => t.length > 2)
              .filter(t => targetTxt.indexOf(t) === -1);
            const unique = Array.from(new Set(missing));
            if (unique.length) {
              warnings.push(
                `index.html keywords for ${target} not found on that page: ${unique.join(', ')}`
              );
              console.warn('WARN: keywords not on', target + ':', unique.join(', '));
            }
          } catch (err) {
            warnings.push(`Could not read ${target} for keyword check: ${err && err.message}`);
          }
        }
      }
    }
  }

  // 2) Scan every file in conflicts/ for "Sources last checked: YYYY-MM-DD"
  const conflictFiles = await listHtmlFiles('conflicts');

  // 2a) Orphan check: a conflict page nobody links from index.html is invisible.
  if (indexTxt !== null) {
    const linked = new Set(linkedConflictPages.map(toPosix));
    for (const f of conflictFiles) {
      if (!linked.has(toPosix(f))) {
        errors.push(`${toPosix(f)} exists but is not linked from index.html`);
        console.error('ERROR:', toPosix(f), 'is not linked from index.html');
      } else {
        console.log('OK:', toPosix(f), 'is linked from index.html');
      }
    }
  }

  if (conflictFiles.length === 0) {
    console.log('Note: no files found in conflicts/ to check for sources date.');
  }
  for (const f of conflictFiles) {
    try {
      const txt = await fs.readFile(f, 'utf8');
      if (!isoDatePresent(txt)) {
        errors.push(`${f} is missing a "Sources last checked: YYYY-MM-DD" line`);
        console.error('ERROR:', f, 'missing sources-checked date');
      } else {
        console.log('OK:', f, 'has sources-checked date');
      }

      // Every initiative listed must carry at least one external http(s) source link.
      const initiatives = initiativeListItems(txt);
      if (initiatives === null) {
        errors.push(`${f} has no "Initiatives and organisations" section with a <ul> list`);
        console.error('ERROR:', f, 'missing "Initiatives and organisations" list');
      } else if (initiatives.length === 0) {
        errors.push(`${f} has an empty "Initiatives and organisations" list`);
        console.error('ERROR:', f, '"Initiatives and organisations" list has no <li> items');
      } else {
        initiatives.forEach((li, i) => {
          const sourced = extractHrefValues(li).some(isExternalHref);
          if (!sourced) {
            const label = itemLabel(li) || '(empty list item)';
            errors.push(
              `${f} initiative ${i + 1} has no external http(s) source link: "${label}"`
            );
            console.error('ERROR:', f, `initiative ${i + 1} has no source link:`, label);
          } else {
            console.log('OK:', f, `initiative ${i + 1} is sourced`);
          }
        });
      }

      // Relative asset paths from inside conflicts/ are one level up.
      const conflictPaths = [
        { re: /\.\.\/css\/styles\.css/, what: '../css/styles.css' },
        { re: /\.\.\/js\/main\.js/, what: '../js/main.js' },
        { re: /\.\.\/index\.html/, what: '../index.html' }
      ];
      for (const { re, what } of conflictPaths) {
        // '../../css/...' is two levels up and wrong from conflicts/: reject it
        // by requiring the exact one-level form and no two-level form.
        const hasTwoLevel = new RegExp('\\.\\.\\/' + re.source).test(txt);
        if (hasTwoLevel) {
          errors.push(`${f} uses ../${what} (two levels up); from conflicts/ it must be ${what}`);
          console.error('ERROR:', f, 'uses ../' + what, 'instead of', what);
        } else if (!re.test(txt)) {
          errors.push(`${f} does not use ${what} as the relative path`);
          console.error('ERROR:', f, 'missing', what);
        } else {
          console.log('OK:', f, 'contains', what);
        }
      }
    } catch (err) {
      errors.push(`Failed to read ${f}: ${err && err.message}`);
      console.error('ERROR: could not read', f, err && err.message);
    }
  }

  // 3) Scan content/organisations/*.html for expected relative asset paths
  const orgDir = path.join('content', 'organisations');
  const orgFiles = await listHtmlFiles(orgDir);
  if (orgFiles.length === 0) {
    console.log('Note: no organisation pages found under content/organisations/.');
  }
  for (const f of orgFiles) {
    try {
      const txt = await fs.readFile(f, 'utf8');
      // Check CSS
      if (!/href\s*=\s*(?:"|')\.\.\/\.\.\/css\/styles\.css(?:"|')/.test(txt) && !/\.\.\/\.\.\/css\/styles\.css/.test(txt)) {
        errors.push(`${f} does not include ../../css/styles.css as the stylesheet path`);
        console.error('ERROR:', f, 'missing ../../css/styles.css');
      } else {
        console.log('OK:', f, 'contains ../../css/styles.css');
      }
      // Check JS
      if (!/src\s*=\s*(?:"|')\.\.\/\.\.\/js\/main\.js(?:"|')/.test(txt) && !/\.\.\/\.\.\/js\/main\.js/.test(txt)) {
        errors.push(`${f} does not include ../../js/main.js as the script path`);
        console.error('ERROR:', f, 'missing ../../js/main.js');
      } else {
        console.log('OK:', f, 'contains ../../js/main.js');
      }
      // Check index link
      if (!/href\s*=\s*(?:"|')\.\.\/\.\.\/index\.html(?:"|')/.test(txt) && !/\.\.\/\.\.\/index\.html/.test(txt)) {
        errors.push(`${f} does not include a ../../index.html back-to-home link`);
        console.error('ERROR:', f, 'missing ../../index.html');
      } else {
        console.log('OK:', f, 'contains ../../index.html link');
      }
      // Check conflict links use the two-level path '../../conflicts/'.
      // '../conflicts/' resolves to content/conflicts/ and is now rejected.
      const hrefs = extractHrefValues(txt);
      for (const h of hrefs) {
        if (isExternalHref(h)) continue;
        if (looksLikeConflictLink(h)) {
          if (!conflictLinkPathOk(h)) {
            errors.push(`${f} contains a conflicts link '${h}' which must start with ../../conflicts/`);
            console.error('ERROR:', f, 'conflicts link', h, 'must start with ../../conflicts/');
          } else {
            const slug = h.trim().replace(/^(?:\.\/)?\.\.\/\.\.\/conflicts\//, '').replace(/[?#].*$/, '');
            const target = path.join('conflicts', slug);
            if (!await fileExists(target)) {
              errors.push(`${f} links to ${h} but ${target} does not exist`);
              console.error('ERROR:', f, 'conflict link', h, 'not found at', target);
            } else {
              console.log('OK:', f, 'conflict link', h);
            }
          }
        }
      }
    } catch (err) {
      errors.push(`Failed to read ${f}: ${err && err.message}`);
      console.error('ERROR: could not read', f, err && err.message);
    }
  }

  if (warnings.length) {
    console.warn('\nWarnings:', warnings.length, '(these do not fail the run)');
    for (const w of warnings) console.warn('- ' + w);
  }

  if (errors.length) {
    console.error('\nValidation failed:', errors.length, 'problem(s) found.');
    for (const e of errors) console.error('- ' + e);
    process.exit(2);
  }
  console.log('\nAll checks passed.');
  process.exit(0);
}

runChecks().catch(err => {
  console.error('Fatal error:', err && err.stack || err);
  process.exit(3);
});
