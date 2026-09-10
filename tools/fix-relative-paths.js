#!/usr/bin/env node
// tools/fix-relative-paths.js
// Scan and optionally fix common relative-path mistakes in conflicts/ and
// content/organisations/ HTML files. Dry-run by default; pass --apply to
// write changes. Prints each proposed change and a short summary.

const fs = require('fs').promises;
const path = require('path');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

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

function show(orig, changed) {
  console.log('  -', orig.trim());
  console.log('    ->', changed.trim());
}

function preserveSuffix(oldPath) {
  // keep any query or fragment when rewriting
  const m = oldPath.match(/(\S+?)([?#].*)$/);
  if (!m) return { base: oldPath, suffix: '' };
  return { base: m[1], suffix: m[2] };
}

async function processFile(file) {
  const txt = await fs.readFile(file, 'utf8');
  let out = txt;
  const changes = [];

  const isConflict = path.dirname(file).replace(/\\/g, '/') === 'conflicts';
  const isOrgDir = path.dirname(file).replace(/\\/g, '/').startsWith('content/organisations');
  if (!isConflict && !isOrgDir) return { file, changes: [] };

  // Helper to replace attribute paths safely. It only touches href/src attributes
  // that reference the given filename (ending) and are not absolute URLs.
  function replaceAttrForFilename(attrName, filename, desiredPath) {
    const re = new RegExp('(' + attrName + '\\s*=\\s*)("|\')([^"']*' + filename.replace(/\./g, '\\.') + '(?:[?#][^"']*)?)(\\2)', 'gi');
    out = out.replace(re, (m, pre, q, ppath, q2) => {
      // Skip absolute URLs (http://, https://, //host or leading slash)
      if (/^\s*(?:https?:)?\/\//i.test(ppath) || /^\s*\//.test(ppath)) {
        return m; // do not change absolute or root paths
      }
      const { suffix } = preserveSuffix(ppath);
      const cur = ppath.replace(/^[.\/]+/, ''); // collapse any leading ./ ../
      // Only change when different from desiredPath
      if (cur === desiredPath || cur === desiredPath.replace(/^\.\//, '')) return m;
      const newAttr = pre + q + desiredPath + suffix + q2;
      changes.push({ before: m, after: newAttr, reason: filename + ' path normalization' });
      return newAttr;
    });
  }

  if (isConflict) {
    // conflicts/*.html: ensure ../css/styles.css, ../js/main.js and ../index.html
    replaceAttrForFilename('href', 'css/styles.css', '../css/styles.css');
    replaceAttrForFilename('src', 'js/main.js', '../js/main.js');
    replaceAttrForFilename('href', 'index.html', '../index.html');

    // organisations index link: normalize to ../content/organisations/index.html
    const orgRe = /(href\s*=\s*)("|')([^"']*content\/organisations\/index\.html(?:[?#][^"']*)?)(\2)/gi;
    out = out.replace(orgRe, (m, pre, q, ppath, q2) => {
      if (/^\s*(?:https?:)?\/\//i.test(ppath) || /^\s*\//.test(ppath)) return m;
      const { suffix } = preserveSuffix(ppath);
      const newPath = '../content/organisations/index.html' + suffix;
      if (ppath === newPath) return m;
      const newAttr = pre + q + newPath + q2;
      changes.push({ before: m, after: newAttr, reason: 'organisations index link' });
      return newAttr;
    });

    // Also, if there are any relative links that look like './content/organisations...' or 'content/...'
    // the regex above will catch them because it ignores leading ./ in the comparison.
  }

  if (isOrgDir) {
    // content/organisations/*.html: ensure ../../css/styles.css, ../../js/main.js and ../../index.html
    replaceAttrForFilename('href', 'css/styles.css', '../../css/styles.css');
    replaceAttrForFilename('src', 'js/main.js', '../../js/main.js');
    replaceAttrForFilename('href', 'index.html', '../../index.html');

    // Conflict links: ensure '../../conflicts/<slug>.html'
    const conflictLinkRe = /(href\s*=\s*)("|')([^"']*conflicts\/([A-Za-z0-9._-]+\.html)(?:[?#][^"']*)?)(\2)/gi;
    out = out.replace(conflictLinkRe, (m, pre, q, ppath, slug, q2) => {
      if (/^\s*(?:https?:)?\/\//i.test(ppath) || /^\s*\//.test(ppath)) return m;
      const { suffix } = preserveSuffix(ppath);
      const newPath = '../../conflicts/' + slug + suffix;
      if (ppath === newPath) return m;
      const newAttr = pre + q + newPath + q2;
      changes.push({ before: m, after: newAttr, reason: 'conflict link normalization' });
      return newAttr;
    });

    // Organisations index link: non-index pages must link to the sibling index.html
    const thisIsIndex = /^index\.html?$/i.test(path.basename(file));
    if (!thisIsIndex) {
      const orgIdxRe = /(href\s*=\s*)("|')([^"']*content\/organisations\/index\.html(?:[?#][^"']*)?)(\2)/gi;
      out = out.replace(orgIdxRe, (m, pre, q, ppath, q2) => {
        if (/^\s*(?:https?:)?\/\//i.test(ppath) || /^\s*\//.test(ppath)) return m;
        const { suffix } = preserveSuffix(ppath);
        const newPath = 'index.html' + suffix;
        const newAttr = pre + q + newPath + q2;
        if (m === newAttr) return m;
        changes.push({ before: m, after: newAttr, reason: 'replace organisations index with sibling index.html' });
        return newAttr;
      });
      // Also replace references to '../../content/organisations/index.html' (deeper) via same regex
    }

    // Also normalise any bare conflict links like 'conflicts/x.html' or './conflicts/x.html'
    const bareConflictRe = /(href\s*=\s*)("|')((?:\.\/)?conflicts\/([A-Za-z0-9._-]+\.html)(?:[?#][^"']*)?)(\2)/gi;
    out = out.replace(bareConflictRe, (m, pre, q, ppath, slug, q2) => {
      if (/^\s*(?:https?:)?\/\//i.test(ppath) || /^\s*\//.test(ppath)) return m;
      const { suffix } = preserveSuffix(ppath);
      const newPath = '../../conflicts/' + slug + suffix;
      const newAttr = pre + q + newPath + q2;
      if (m === newAttr) return m;
      changes.push({ before: m, after: newAttr, reason: 'bare conflict link -> two-level conflicts path' });
      return newAttr;
    });
  }

  // De-duplicate identical changes
  const uniq = [];
  for (const c of changes) {
    if (!uniq.some(u => u.before === c.before && u.after === c.after)) uniq.push(c);
  }

  // If any changes were recorded, present them
  if (uniq.length) {
    for (const c of uniq) {
      if (VERBOSE) {
        console.log('\nFile:', file);
        show(c.before, c.after);
      } else {
        console.log('\n' + file + ':');
        show(c.before, c.after);
      }
    }
  }

  // If we made textual changes to out compared to txt, and --apply provided, write file
  if (uniq.length && out !== txt) {
    if (APPLY) {
      await fs.writeFile(file, out, 'utf8');
      console.log('Applied', uniq.length, 'change(s) to', file);
    } else {
      console.log('Dry-run:', uniq.length, 'change(s) would be applied to', file);
    }
  }

  return { file, changes: uniq };
}

async function run() {
  const results = [];
  const errors = [];
  try {
    const conflictFiles = await listHtmlFiles('conflicts');
    const orgFiles = await listHtmlFiles(path.join('content', 'organisations'));

    for (const f of conflictFiles) {
      try {
        const res = await processFile(f);
        results.push(res);
      } catch (err) {
        errors.push({ file: f, error: err && err.message || String(err) });
      }
    }
    for (const f of orgFiles) {
      try {
        const res = await processFile(f);
        results.push(res);
      } catch (err) {
        errors.push({ file: f, error: err && err.message || String(err) });
      }
    }

    const totalChanges = results.reduce((s, r) => s + (r.changes ? r.changes.length : 0), 0);
    console.log('\nSummary:');
    console.log('  files examined:', results.length);
    console.log('  proposed changes:', totalChanges);
    if (APPLY) console.log('  mode: apply (changes written)'); else console.log('  mode: dry-run (no files written)');

    if (errors.length) {
      console.error('\nErrors:');
      for (const e of errors) console.error(' -', e.file + ':', e.error);
      process.exit(3);
    }

    process.exit(0);
  } catch (err) {
    console.error('Fatal:', err && err.stack || err);
    process.exit(4);
  }
}

run();
