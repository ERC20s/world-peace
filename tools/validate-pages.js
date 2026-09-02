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

async function runChecks() {
  const errors = [];

  // 1) Verify every <a href="conflicts/*.html"> referenced in index.html exists under conflicts/
  try {
    const indexPath = path.join('index.html');
    const indexTxt = await fs.readFile(indexPath, 'utf8');
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

  // 2) Scan every file in conflicts/ for "Sources last checked: YYYY-MM-DD"
  const conflictFiles = await listHtmlFiles('conflicts');
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
      // Check conflict links use ../../conflicts/
      const hrefs = extractHrefValues(txt);
      for (const h of hrefs) {
        // if it links to a conflicts page, ensure it uses '../../conflicts/'
        if (/\bconflicts\/.*\.html$/.test(h)) {
          if (!h.includes('../../conflicts/') && !h.includes('./../../conflicts/') && !h.includes('../conflicts/') ) {
            // conservative: require '../../conflicts/' presence specifically
            errors.push(`${f} contains a conflicts link '${h}' which should use ../../conflicts/ relative path`);
            console.error('ERROR:', f, 'conflicts link', h, 'should use ../../conflicts/');
          } else {
            console.log('OK:', f, 'conflict link', h);
          }
        }
      }
    } catch (err) {
      errors.push(`Failed to read ${f}: ${err && err.message}`);
      console.error('ERROR: could not read', f, err && err.message);
    }
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
