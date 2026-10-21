# Contributing

This is a plain HTML/CSS/JS site: no framework and no runtime dependencies. Open
`index.html` in a browser, or serve the repository root with any static server,
to preview. The one generated part is `initiatives.html`'s list and filter
options plus `sitemap.xml`: `npm run build-site` writes them from `data/`, and
the result is committed like any other file.

## Adding a conflict page

1. Choose a slug: lower-case, hyphenated, no spaces — e.g. `northern-ireland`.
   The slug is the file name and the `slug` field in `data/conflict.schema.json`.
2. Copy the template:
   `templates/conflict.html` → `conflicts/<slug>.html`
3. Fill in every placeholder. The HTML comments in the template name the schema
   field each block fills (`title`, `summary`, `regions`, `initiatives`,
   `actions`, `sources`, `neutralityReviewed`). Delete the comments you have
   satisfied; keep the section order and the existing markup classes so the page
   matches `conflicts/northern-ireland.html` and `conflicts/liberia.html`.
4. Link the page from the home page. In `index.html`, inside
   `<ul id="conflict-list" class="conflict-list">`, add one line:

   ```html
   <li data-keywords="Region Country Parties Agreement name Years"><a href="conflicts/<slug>.html">Title</a></li>
   ```

   A page that is not in that list is invisible to readers and to the search box
   in `js/main.js`, so `node tools/validate-pages.js` fails on any file under
   `conflicts/` that the list does not link.

   `data-keywords` is what makes the search find the page by anything other than
   its title. `js/main.js` matches every whitespace-separated word of the query
   against the link text **plus** `data-keywords`, both lower-cased, so a reader
   who types "ulster", "accra" or "good friday" still lands on the right page.
   Take the terms from the page itself — country, region, other names for the
   place, the parties named on the page, agreement names, key years — and keep
   them factual and neutral; the attribute is content, not marketing. An item
   with no `data-keywords` still matches on its link text, as before.

   The search writes its result into
   `<p id="conflict-search-status" role="status" aria-live="polite">` above the
   list ("Showing 1 of 2 conflicts." or a no-results line), and `index.html?q=…`
   arrives already filtered, so links into a filtered list work.
5. Fill in the page's share and search metadata, right after `<title>` — the
   template has the block. Every page under the site needs all of these, and
   `node tools/validate-pages.js` fails a page that lacks one:

   ```html
   <meta name="description" content="One neutral sentence, at most 300 characters.">
   <link rel="canonical" href="https://erc20s.github.io/world-peace/conflicts/<slug>.html">
   <meta property="og:type" content="article">
   <meta property="og:site_name" content="World Peace">
   <meta property="og:title" content="<the <title> text, exactly>">
   <meta property="og:description" content="<the description, exactly>">
   <meta property="og:url" content="<the canonical URL, exactly>">
   ```

   The base URL comes from `data/site.json`; change it there (and in these tags)
   if the site moves.
6. Add the page's data: `data/conflicts/<slug>.json`, valid against
   `data/conflict.schema.json` (see "Conflict data" below). The validator fails a
   conflict page without one, and a data file without a page.
7. Run `npm run build-site` to regenerate `initiatives.html` and `sitemap.xml`,
   and commit both. The validator fails when either is out of date.
8. Open a pull request. A separate Code proposal is what merges it.

### Conflict data

`data/conflicts/<slug>.json` holds the same content as the page in structured
form, so initiatives can be searched and filtered on `initiatives.html` and the
validators can check what a page claims. Shared formats live in
`data/defs.schema.json`:

- `countries` and each initiative's `country`: ISO 3166-1 alpha-2 codes,
  upper case — `GB` for Northern Ireland, `LR` for Liberia (`UK` is rejected).
  `XK` is accepted for Kosovo.
- each initiative's `type`: one of the values listed in the schema (for example
  `dialogue`, `trauma-support`, `transitional-justice`); `startYear`: the year
  it was founded, launched or legally established, as a whole number.
- URLs: absolute `http(s)` URLs (https unless `ALLOW_HTTP_SOURCES` is set).
- dates (`sourcesCheckedOn`, `checkedOn`): real ISO dates, `YYYY-MM-DD`, not in
  the future. `sourcesCheckedOn` must equal the page's "Sources last checked".

The validator also holds the page to the data: the `<h1>` is the `title`; the
"Initiatives and organisations" list has the same initiatives in the same order,
each `<strong>` being the initiative's `name` and linking its `sourceUrl`; and
the "Sources" list links the `sources` URLs in order.

### When a source goes dead

Do not delete the entry. Keep the URL in the data and mark it:

```json
"sourceUrl": "https://…",
"sourceUnavailable": { "checkedOn": "2026-10-21" }
```

(the same field works on an entry in `sources`). On the page, replace the link
with the URL as plain text followed by `source unavailable (checked 2026-10-21)`,
then run `npm run build-site`. The validator checks the page and the data agree
in both directions, and `check-links` lists the URL as `MARKED UNAVAILABLE`
instead of fetching it. If a replacement source exists — an official move or an
Internet Archive copy — cite that instead and drop the mark.

## Adding an organisation page

Copy `templates/organisation.html` to `content/organisations/<slug>.html` and
fill it in the same way; the fields are listed in
`data/organisation.schema.json`, and
`content/organisations/example-organisation.html` is a worked example. Link the
page from the conflict pages that reference the organisation.

Then list it in the organisations index, `content/organisations/index.html`,
which the home page links under "Organisations". Inside
`<ul id="organisation-list" class="conflict-list">` add one line:

```html
<li><a href="<slug>.html">Organisation name</a> — one neutral line, and the
  conflict pages it relates to: <a href="../../conflicts/<slug>.html">Title</a>.</li>
```

The organisation link is the bare file name (the pages are siblings of the
index); conflict links keep the two-level `../../conflicts/` form. A page the
index does not list is unreachable for readers, so
`node tools/validate-pages.js` fails on any file under
`content/organisations/` (other than the index itself) that the list does not
link, on a list entry pointing at a file that does not exist, and on the same
page listed twice.

Organisation pages sit **two** directory levels below the repository root, so
their relative paths carry two `../` steps — one more than a conflict page. The
template ships with the two-level paths already in place; do not "fix" them back
to one level, and expect an unstyled page if you open the template directly from
`templates/`.

### Organisation pre-submit checklist

Tick every line before you open the pull request. Reviewers check the same list.

- [ ] The file is `content/organisations/<slug>.html`, slug lower-case and hyphenated.
- [ ] Relative paths are correct from inside `content/organisations/`:
      `../../css/styles.css`, `../../js/main.js`, `../../index.html`,
      `../../conflicts/<slug>.html`. Compare against
      `content/organisations/example-organisation.html`.
- [ ] The header carries the site nav the template ships, unchanged:

      ```html
      <nav class="site-nav" aria-label="Site">
        <a href="../../index.html">Home</a> <span aria-hidden="true">·</span>
        <a href="index.html">Organisations</a>
      </nav>
      ```

      The organisations link is the bare sibling `index.html`. The validator
      fails an organisation page (other than the index itself) that has no
      sibling `index.html` link, and rejects the deeper shapes
      `../../content/organisations/index.html` and
      `content/organisations/index.html` on any page in this folder.
- [ ] The page is listed in `content/organisations/index.html`, inside
      `<ul id="organisation-list">`, with a bare-file-name link and the conflict
      pages it relates to. The validator fails an organisation page the index
      does not list.
- [ ] The `<title>` reads "<Organisation name> — World Peace".
- [ ] Country/region, official website and a short neutral mission are filled in,
      matching `data/organisation.schema.json`.
- [ ] Every activity listed is concrete and sourced — each one checkable against a
      published source (annual report, news coverage, the organisation's own site).
      The "Verifiable activities" `<h2>` must be followed by a `<ul>`, and every
      `<li>` in it must carry at least one external, non-placeholder `http(s)`
      link — `node tools/validate-pages.js` fails on an empty or missing list, or
      any activity with no such link, the same rule already applied to a conflict
      page's "Initiatives and organisations" list.
- [ ] The page shows a "Sources last checked: YYYY-MM-DD" line under Sources.
      The validator fails an organisation page with no such line, the same rule
      already applied to conflict pages.
- [ ] The "Linked conflict pages" section points at real `conflicts/*.html` pages,
      and those pages reference the organisation back.
- [ ] "What a reader can do today" lists non-fundraising actions only — read,
      learn, volunteer, share verified sources. No donate links, no appeals.
- [ ] Neutral tone throughout; contested facts attributed to the source that
      published them.
- [ ] Sources section lists every source cited above.
- [ ] Every external link resolves (open each one; no 404s, no parked domains).
      `node tools/check-links.js` exits 0 — see "Checking external links" below.
- [ ] `node tools/validate-pages.js` exits 0. The validator rejects `../conflicts/`
      (one level short — it resolves to `content/conflicts/`) and fails if a linked
      `../../conflicts/<slug>.html` page does not exist in the repository.

## Pre-submit checklist (conflict pages)

Tick every line before you open the pull request. Reviewers check the same list.

- [ ] The file is `conflicts/<slug>.html` and the slug matches the link in `index.html`.
- [ ] The `index.html` list item carries a `data-keywords` attribute whose terms all
      appear on the conflict page itself (country, region, parties, agreement names,
      years) — no promotional or partisan wording. Type two of them into the search
      box and check the page still shows. The validator fails an item with no
      `data-keywords` (or an empty one) and an item that does not hold exactly one
      `conflicts/<slug>.html` link; a keyword that is not on the target page is
      only a warning, so honest synonyms and alternative spellings are fine.
- [ ] At least three initiatives, each with an organisation named and a working source link.
- [ ] The page has an "Initiatives and organisations" `<h2>` followed by a `<ul>`, and
      every `<li>` in that list carries at least one external `http(s)` link.
      `node tools/validate-pages.js` fails on any initiative without one.
- [ ] Every external link resolves (open each one; no 404s, no redirects to a parked domain).
      `node tools/check-links.js` exits 0 — see "Checking external links" below.
- [ ] Relative paths are correct from inside `conflicts/`: `../css/styles.css`,
      `../js/main.js`, `../index.html`. The validator checks all three and rejects
      the two-level `../../` forms, which resolve above the repository root.
- [ ] The header carries the site nav the template ships, unchanged:

      ```html
      <nav class="site-nav" aria-label="Site">
        <a href="../index.html">Home</a> <span aria-hidden="true">·</span>
        <a href="../content/organisations/index.html">Organisations</a>
      </nav>
      ```

      Readers arrive on a conflict page directly (search results carry `?q=…`),
      so a page whose only exit is the home page is a dead end. The validator
      fails a page under `conflicts/` with no
      `../content/organisations/index.html` link, and rejects the wrong depths
      (`content/organisations/index.html`, `../../content/organisations/index.html`).
- [ ] A "What a reader can do today" section with non-fundraising actions only —
      read, learn, volunteer, share verified sources. No donate links, no appeals.
- [ ] Neutral tone throughout: no advocacy, no partisan framing; contested facts
      and figures attributed to the source that published them.
- [ ] Sources section lists every source cited above, each with a description of
      what it supports.
- [ ] The page includes a visible "Sources last checked: YYYY-MM-DD" line and the
      date is an ISO (YYYY-MM-DD) date when the links were last validated.
- [ ] The `<title>` reads "<Conflict title> — World Peace".
- [ ] The `<head>` carries the description, canonical and Open Graph tags (step 5
      above); `og:title`, `og:description` and `og:url` repeat the title,
      description and canonical URL exactly.
- [ ] `data/conflicts/<slug>.json` exists, validates, and matches the page;
      `npm run build-site` has been run and `initiatives.html` / `sitemap.xml`
      are committed. `npm test` and `npm run validate-pages` pass.
- [ ] You state in the pull request that you have read the page back for
      neutrality (`neutralityReviewed`).

## Checking external links

Every claim on this site rests on a source link, so run the checker before you
open a pull request:

```
npm run check          # runs validate-pages then check-links
# or the separate scripts:
npm run validate-pages
npm run check-links          # report; fails only on genuinely broken links
npm run check-links -- --strict # also fail when a URL could not be reached (pass flags after a npm script)
```

It scans the pages at the repository root, `conflicts/` and
`content/organisations/`, plus the source URLs in `data/conflicts/*.json` and
`data/organisations/*.json`, and checks each **unique** URL once however many
places cite it — a source listed under "Initiatives and organisations" and again
under "Sources" is one request, not two. Each request times out after 10
seconds. Each URL is tried with `HEAD` first; on any status of 400 or above the
same URL is retried with `GET` (many source hosts refuse `HEAD` from a script
while serving the page normally), and only then judged. An unreachable or 5xx
result is tried once more after a short pause.

Results come back in three kinds:

- `OK` — HEAD or the GET retry answered 2xx/3xx.
- `BROKEN` — a 4xx that survived the GET retry, or a 5xx that survived the
  extra attempt. Fix or replace the source, or mark it unavailable (above),
  before submitting.
- `UNREACHABLE` — DNS failure, refused connection, timeout or a 429 rate limit,
  after one automatic retry. This means the network could not answer, not that
  the source is gone.

Note: the checker now recognises and skips reserved/example hostnames (for
example: example.org, example.com, example.net, example.local, localhost and
`d8a.com`). Those URLs are printed as PLACEHOLDER entries and are not fetched.
The repository validator treats placeholder/example URLs as invalid sources and
fails a validation run when a conflict or organisation initiative cites one —
except for the deliberate worked example page at
`content/organisations/example-organisation.html`, which is allowed to use
placeholder content.

Nothing is skipped silently: the run prints how many links it did not fetch —
relative links, asset links, links to the site itself (`canonical`, from
`data/site.json`) and sources marked unavailable — and lists each placeholder and
marked-unavailable URL.

Exit codes: `0` clean (or unreachable-only), `2` broken links found (and, with
`--strict`, unreachable ones too) or a page/data file could not be read, `3` the
script itself failed. So running the checker offline warns rather than declaring
every verified source dead; CI runs `npm run check-links -- --strict`. The same
command runs as the `link-check` entry in `.d8a`.

## Tone rules, in short

Neutral, sourced, and useful. Describe what an initiative does and who runs it;
let the sources carry the claims. If a statement cannot be checked against a
published source, leave it out.
