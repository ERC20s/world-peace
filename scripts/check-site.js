#!/usr/bin/env node
/*
 * check-site.js — a no-dependency check that a page on this site is "finished".
 *
 * Plain Node (>= 14), no packages, no network calls: it only reads the .html
 * files in this repository and reports what a reviewer would otherwise have to
 * catch by eye. Run it with `npm run check` (or `node scripts/check-site.js`)
 * before asking for a Code proposal.
 *
 * What it reports, per the group's agreed rules:
 *   1. broken relative links  — every href/src pointing at a file that is not
 *      in the repository (this covers ../css/styles.css and ../js/main.js on
 *      the conflict pages, and links between pages).
 *   2. missing headings       — a page under conflicts/ or content/organisations/
 *      must carry the headings "Overview", "What a reader can do today" and
 *      "Sources", the shape both existing conflict pages already use.
 *   3. orphan pages           — a page under those directories that no other
 *      page in the repository links to, so no reader can reach it.
 *   4. unsourced pages        — such a page whose Sources section carries no
 *      external http(s) link.
 *
 * Exit code is 1 when anything is reported, 0 when the site is clean, so the
 * command can be wired into a check later without changing it.
 *
 * Deliberate limits (see README): this is regex-based scanning, not an HTML
 * parser, and it is advisory — nothing merges or blocks on it automatically.
 * templates/ is skipped on purpose: templates/organisation.html carries
 * placeholder links (../conflicts/example-conflict.html) that are meant to be
 * replaced when a real page is authored from it.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Directories never walked. templates/ holds placeholder links by design.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'templates', '.github']);

// Only pages in these directories are held to the content rules (2, 3, 4).
const CONTENT_DIRS = ['conflicts/', 'content/organisations/'];

const REQUIRED_HEADINGS = ['Overview', 'What a reader can do today', 'Sources'];

/* ---------------------------------------------------------------- helpers */

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function listHtmlFiles(dir, out) {
  out = out || [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      listHtmlFiles(full, out);
    } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
      out.push(toPosix(path.relative(ROOT, full)));
    }
  }
  return out;
}

function isContentPage(rel) {
  return CONTENT_DIRS.some((d) => rel.startsWith(d));
}

// Strip tags and decode the few entities the site actually uses.
function plainText(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/gi, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseHeading(text) {
  return plainText(text)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function headings(html) {
  const out = [];
  const re = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(normaliseHeading(m[2]));
  return out;
}

function isExternal(href) {
  return /^[a-z][a-z0-9+.\-]*:/i.test(href) || href.startsWith('//');
}

// Every href/src in the document, with the line number it sits on.
function links(html) {
  const out = [];
  const re = /(?:href|src)\s*=\s*["']([^"']*)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const line = html.slice(0, m.index).split('\n').length;
    out.push({ value: m[1].trim(), line });
  }
  return out;
}

// Resolve a relative link to a repository-relative path, or null if it leaves
// the repository / is not resolvable.
function resolveLink(fromRel, href) {
  let target = href.split('#')[0].split('?')[0];
  if (!target) return null;
  try {
    target = decodeURIComponent(target);
  } catch (err) {
    /* leave as written */
  }
  const rootRelative = target.startsWith('/');
  if (rootRelative) target = target.replace(/^\/+/, '');
  const base = rootRelative ? ROOT : path.dirname(path.join(ROOT, fromRel));
  const abs = path.resolve(base, target);
  const rel = toPosix(path.relative(ROOT, abs));
  if (rel.startsWith('..')) return { rel: null, abs, outside: true };
  return { rel, abs, outside: false };
}

// The text of the Sources section: from the Sources heading to the end of the
// enclosing <section>, or to the next heading of the same level.
function sourcesSection(html) {
  const m = /<h([1-3])\b[^>]*>\s*Sources\s*<\/h\1>/i.exec(html);
  if (!m) return null;
  const rest = html.slice(m.index + m[0].length);
  const end = rest.search(/<\/section>|<h[1-3]\b|<\/main>/i);
  return end === -1 ? rest : rest.slice(0, end);
}

/* ------------------------------------------------------------------- main */

function main() {
  const files = listHtmlFiles(ROOT).sort();
  if (files.length === 0) {
    console.error('check-site: no .html files found — is this the repository root?');
    process.exitCode = 1;
    return;
  }

  const known = new Set(files);
  const inbound = new Map(); // page -> Set of pages linking to it
  files.forEach((f) => inbound.set(f, new Set()));

  const problems = new Map(); // page -> [messages]
  const add = (file, msg) => {
    if (!problems.has(file)) problems.set(file, []);
    problems.get(file).push(msg);
  };

  const sources = new Map();
  for (const rel of files) {
    sources.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  }

  // 1. broken relative links + inbound link graph
  for (const rel of files) {
    const html = sources.get(rel);
    for (const link of links(html)) {
      const href = link.value;
      if (!href || href.startsWith('#') || isExternal(href)) continue;
      const resolved = resolveLink(rel, href);
      if (!resolved) continue;
      if (resolved.outside || resolved.rel === null) {
        add(rel, `line ${link.line}: link "${href}" points outside the repository`);
        continue;
      }
      let targetRel = resolved.rel;
      let exists = fs.existsSync(resolved.abs) && fs.statSync(resolved.abs).isFile();
      if (!exists && (href.endsWith('/') || (fs.existsSync(resolved.abs) && fs.statSync(resolved.abs).isDirectory()))) {
        const indexRel = (targetRel ? targetRel + '/' : '') + 'index.html';
        if (fs.existsSync(path.join(ROOT, indexRel))) {
          targetRel = indexRel;
          exists = true;
        }
      }
      if (!exists) {
        add(rel, `line ${link.line}: broken link "${href}" (no file at ${targetRel || '/'})`);
        continue;
      }
      if (known.has(targetRel) && targetRel !== rel) inbound.get(targetRel).add(rel);
    }
  }

  // 2/3/4. content rules
  for (const rel of files) {
    if (!isContentPage(rel)) continue;
    const html = sources.get(rel);
    const found = headings(html);

    for (const required of REQUIRED_HEADINGS) {
      if (!found.includes(normaliseHeading(required))) {
        add(rel, `missing required heading "${required}"`);
      }
    }

    if (inbound.get(rel).size === 0) {
      add(rel, 'orphan page: no other page in the repository links to it');
    }

    const section = sourcesSection(html);
    if (section !== null && !/https?:\/\//i.test(section)) {
      add(rel, 'Sources section carries no external http(s) link (unsourced content)');
    }
  }

  /* ------------------------------------------------------------- report */

  const pages = files.filter(isContentPage).length;
  let count = 0;
  for (const [file, list] of [...problems.entries()].sort()) {
    console.log(file);
    for (const msg of list) {
      console.log(`  - ${msg}`);
      count += 1;
    }
  }

  console.log('');
  console.log(
    `check-site: ${files.length} page(s) scanned, ${pages} held to the content rules, ${count} problem(s).`
  );
  if (count > 0) {
    console.log('Fix the problems above, or say in the pull request why the report is wrong.');
    process.exitCode = 1;
  }
}

main();
