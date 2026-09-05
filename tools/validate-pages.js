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

// Detect placeholder / example hosts; mirrors the checker predicate so both
// tools agree on which hosts are placeholders.
function isPlaceholderUrl(href) {
  try {
    const u = new URL(href);
    const host = String(u.hostname).toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (/(^|\.)example\.(com|org|net|edu)$/.test(host)) return true;
    if (/(?:\.test$|\.invalid$|\.example$|\.localhost$)/.test(host)) return true;
    return false;
  } catch (err) {
    return false;
  }
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

// True when the href points at the organisations index by any relative shape
// ('content/organisations/index.html', '../content/...', '../../content/...').
function looksLikeOrgIndexLink(href) {
  return /(?:^|[\/.])content\/organisations\/index\.html?(?:[?#].*)?$/i
    .test(String(href).trim());
}

// The only relative shape a conflict page (conflicts/<slug>.html) may use to
// reach the organisations index: one level up, then content/organisations/.
// 'content/organisations/index.html' (no step up) and the two-level
// '../../content/...' form both resolve somewhere that does not exist.
function conflictOrgIndexPathOk(href) {
  const h = String(href).trim().replace(/[?#].*$/, '');
  return h === '../content/organisations/index.html' ||
         h === './../content/organisations/index.html';
}

// The only shape an organisation page may use to reach its own index: the bare
// sibling file name, because the index sits in the same folder.
function orgSiblingIndexOk(href) {
  const h = String(href).trim().replace(/[?#].*$/, '').replace(/^\.\//, '');
  return /^index\.html?$/i.test(h);
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

// Normalise a home-page href to the organisations index it points at, or null.
// 'content/organisations/index.html' and './content/organisations/index.html'
// both count; a query or fragment is ignored.
function homeOrganisationsIndexHref(href) {
  const h = String(href).trim().replace(/[?#].*$/, '').replace(/^\.\//, '');
  return /^content\/organisations\/index\.html?$/i.test(h) ? h : null;
}

// Normalise an href found in the organisations index to the sibling page it
// points at, or null. Organisation pages live beside the index, so the only
// accepted shape is a bare file name ('example-organisation.html'); anything
// with a slash (../../conflicts/..., http://...) is not an organisation link.
function organisationIndexHref(href) {
  const h = String(href).trim().replace(/[?#].*$/, '').replace(/^\.\//, '');
  if (!/^[A-Za-z0-9._-]+\.html?$/i.test(h)) return null;
  return h;
}

// Pull the <li> items out of the <ul id="..."> with the given id.
// Returns null when that list is not present. Each item is
// { attrs: '<li ...>' attribute text, html: inner HTML }.
function listItemsById(text, id) {
  const ulOpen = new RegExp(
    '<ul\\b[^>]*\\bid\\s*=\\s*(?:"' + id + '"|\'' + id + '\'|' + id + '\\b)[^>]*>', 'i'
  ).exec(text);
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

// The home-page conflict list.
function conflictListItems(text) {
  return listItemsById(text, 'conflict-list');
}

// The directory list on content/organisations/index.html.
function organisationListItems(text) {
  return listItemsById(text, 'organisation-list');
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
          // An initiative is sourced only if it cites an external non-placeholder
          // http(s) link.
          const hrefs = extractHrefValues(li).filter(isExternalHref);
          const sourced = hrefs.some(h => !isPlaceholderUrl(h));
          if (!sourced) {
            const label = itemLabel(li) || '(empty list item)';
            errors.push(
              `${f} initiative ${i + 1} has no external http(s) source link: "${label}"`
            );
            console.error('ERROR:', f, `initiative ${i + 1} has no source link:`, label);
          } else {
            // But flag a template/example placeholder if present on a real page.
            const hasPlaceholder = hrefs.some(isPlaceholderUrl);
            if (hasPlaceholder && f !== 'content/organisations/example-organisation.html') {
              errors.push(`${f} contains a placeholder/example URL in its sources which is not allowed: ${hrefs.filter(isPlaceholderUrl).join(', ')}`);
              console.error('ERROR:', f, 'contains placeholder URL(s) in initiative sources');
            } else {
              console.log('OK:', f, `initiative ${i + 1} is sourced`);
            }
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

      // Site nav: a reader who lands here from a search result must be able to
      // reach the organisations index, and by the one-level-up path.
      const navHrefs = extractHrefValues(txt).filter(h => !isExternalHref(h));
      const orgIndexLinks = navHrefs.filter(looksLikeOrgIndexLink);
      if (orgIndexLinks.length === 0) {
        errors.push(
          `${f} has no site-nav link to the organisations index ` +
          `(expected href="../content/organisations/index.html")`
        );
        console.error('ERROR:', f, 'missing ../content/organisations/index.html nav link');
      } else {
        let anyOk = false;
        for (const h of orgIndexLinks) {
          if (!conflictOrgIndexPathOk(h)) {
            errors.push(
              `${f} links the organisations index as '${h}'; from conflicts/ it must be ` +
              `../content/organisations/index.html`
            );
            console.error('ERROR:', f, 'organisations-index link', h, 'has the wrong depth');
          } else {
            anyOk = true;
          }
        }
        if (anyOk) {
          const orgIndexTarget = path.join('content', 'organisations', 'index.html');
          if (!await fileExists(orgIndexTarget)) {
            errors.push(
              `${f} links ../content/organisations/index.html but ${toPosix(orgIndexTarget)} does not exist`
            );
            console.error('ERROR:', f, 'nav link target', toPosix(orgIndexTarget), 'does not exist');
          } else {
            console.log('OK:', f, 'links the organisations index');
          }
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

      // Site nav: every organisation page other than the index itself must link
      // its own index, and by the sibling file name. The deeper shapes
      // ('../../content/organisations/index.html', 'content/organisations/...')
      // resolve outside this folder and are rejected on every page here.
      const localHrefs = hrefs.filter(h => !isExternalHref(h));
      for (const h of localHrefs) {
        if (looksLikeOrgIndexLink(h)) {
          errors.push(
            `${f} links the organisations index as '${h}'; from content/organisations/ ` +
            `it must be the sibling index.html`
          );
          console.error('ERROR:', f, 'organisations-index link', h, 'has the wrong depth');
        }
      }
      const isOrgIndexPage = /^index\.html?$/i
        .test(toPosix(f).replace(/^content\/organisations\//, ''));
      if (!isOrgIndexPage) {
        if (!localHrefs.some(orgSiblingIndexOk)) {
          errors.push(
            `${f} has no site-nav link to its organisations index (expected href="index.html")`
          );
          console.error('ERROR:', f, 'missing sibling index.html nav link');
        } else {
          console.log('OK:', f, 'links its organisations index');
        }
      }
    } catch (err) {
      errors.push(`Failed to read ${f}: ${err && err.message}`);
      console.error('ERROR: could not read', f, err && err.message);
    }
  }

  // 4) The organisations index: content/organisations/index.html is the only way
  // a reader reaches an organisation page, so it must exist, be linked from the
  // home page, and list every organisation page in the folder — exactly the
  // guarantee the conflict list already gives conflict pages.
  const orgIndexPath = path.join('content', 'organisations', 'index.html');
  const orgIndexPosix = toPosix(orgIndexPath);
  const orgIndexExists = await fileExists(orgIndexPath);

  if (!orgIndexExists) {
    errors.push(`${orgIndexPosix} is missing: organisation pages have no index to be reached from`);
    console.error('ERROR:', orgIndexPosix, 'does not exist');
  } else {
    console.log('OK:', orgIndexPosix, 'exists');
  }

  // 4a) Home page must link the index.
  if (indexTxt !== null) {
    const linksOrgIndex = extractHrefValues(indexTxt).some(h => homeOrganisationsIndexHref(h));
    if (!linksOrgIndex) {
      errors.push(`index.html does not link ${orgIndexPosix}`);
      console.error('ERROR: index.html has no link to', orgIndexPosix);
    } else {
      console.log('OK: index.html links', orgIndexPosix);
    }
  }

  // 4b) The index's own list: every entry points at a real sibling page, no
  // duplicates, and no organisation page in the folder is left off it.
  if (orgIndexExists) {
    try {
      const orgIndexTxt = await fs.readFile(orgIndexPath, 'utf8');
      const items = organisationListItems(orgIndexTxt);
      const listed = new Set();

      if (items === null) {
        errors.push(`${orgIndexPosix} has no <ul id="organisation-list"> list`);
        console.error('ERROR:', orgIndexPosix, 'missing <ul id="organisation-list">');
      } else if (items.length === 0) {
        errors.push(`${orgIndexPosix} has an empty <ul id="organisation-list"> list`);
        console.error('ERROR:', orgIndexPosix, 'organisation list has no <li> items');
      } else {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const label = itemLabel(item.html) || `list item ${i + 1}`;
          const targets = extractHrefValues(item.html)
            .map(organisationIndexHref)
            .filter(Boolean)
            .filter(h => !/^index\.html?$/i.test(h));

          if (targets.length !== 1) {
            errors.push(
              `${orgIndexPosix} list item "${label}" must contain exactly one link to an ` +
              `organisation page in this folder (found ${targets.length})`
            );
            console.error('ERROR:', orgIndexPosix, 'list item', label, 'has', targets.length, 'organisation links');
            continue;
          }

          const target = targets[0];
          if (listed.has(target)) {
            errors.push(`${orgIndexPosix} lists ${target} more than once`);
            console.error('ERROR:', orgIndexPosix, 'duplicate organisation link', target);
            continue;
          }
          listed.add(target);

          const targetPath = path.join('content', 'organisations', target);
          if (!await fileExists(targetPath)) {
            errors.push(`${orgIndexPosix} links to ${target} but ${toPosix(targetPath)} does not exist`);
            console.error('ERROR:', orgIndexPosix, 'link', target, 'not found at', toPosix(targetPath));
          } else {
            console.log('OK:', orgIndexPosix, 'lists', target);
          }
        }
      }

      // Orphan check: an organisation page the index does not list is invisible.
      for (const f of orgFiles) {
        const rel = toPosix(f).replace(/^content\/organisations\//, '');
        if (/^index\.html?$/i.test(rel)) continue;
        if (rel.indexOf('/') !== -1) {
          errors.push(`${toPosix(f)} is not directly under content/organisations/, so the index cannot list it`);
          console.error('ERROR:', toPosix(f), 'is nested below content/organisations/');
          continue;
        }
        if (!listed.has(rel)) {
          errors.push(`${toPosix(f)} exists but is not listed in ${orgIndexPosix}`);
          console.error('ERROR:', toPosix(f), 'is not listed in', orgIndexPosix);
        } else {
          console.log('OK:', toPosix(f), 'is listed in', orgIndexPosix);
        }
      }
    } catch (err) {
      errors.push(`Failed to read ${orgIndexPosix}: ${err && err.message}`);
      console.error('ERROR: could not read', orgIndexPosix, err && err.message);
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
