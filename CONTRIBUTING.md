# Contributing

This is a plain HTML/CSS/JS site: no framework, no build step. Open `index.html`
in a browser, or serve the repository root with any static server, to preview.

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
5. Open a pull request. A separate Code proposal is what merges it.

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
- [ ] The page is listed in `content/organisations/index.html`, inside
      `<ul id="organisation-list">`, with a bare-file-name link and the conflict
      pages it relates to. The validator fails an organisation page the index
      does not list.
- [ ] The `<title>` reads "<Organisation name> — World Peace".
- [ ] Country/region, official website and a short neutral mission are filled in,
      matching `data/organisation.schema.json`.
- [ ] Every activity listed is concrete and sourced — each one checkable against a
      published source (annual report, news coverage, the organisation's own site).
- [ ] The "Linked conflict pages" section points at real `conflicts/*.html` pages,
      and those pages reference the organisation back.
- [ ] "What a reader can do today" lists non-fundraising actions only — read,
      learn, volunteer, share verified sources. No donate links, no appeals.
- [ ] Neutral tone throughout; contested facts attributed to the source that
      published them.
- [ ] Sources section lists every source cited above.
- [ ] Every external link resolves (open each one; no 404s, no parked domains).
- [ ] `node tools/validate-pages.js` exits 0. The validator rejects `../conflicts/`
      (one level short — it resolves to `content/conflicts/`) and fails if a linked
      `../../conflicts/<slug>.html` page does not exist in the repository.

## Pre-submit checklist (conflict pages)

Tick every line before you open the pull request. Reviewers check the same list.

- [ ] The file is `conflicts/<slug>.html` and the slug matches the link in `index.html`.
      `node tools/validate-pages.js` now fails on a page under `conflicts/` that no
      `<li>` in `<ul id="conflict-list">` links, and on the same page listed twice.
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
- [ ] Relative paths are correct from inside `conflicts/`: `../css/styles.css`,
      `../js/main.js`, `../index.html`. The validator checks all three and rejects
      the two-level `../../` forms, which resolve above the repository root.
- [ ] A "What a reader can do today" section with non-fundraising actions only —
      read, learn, volunteer, share verified sources. No donate links, no appeals.
- [ ] Neutral tone throughout: no advocacy, no partisan framing; contested facts
      and figures attributed to the source that published them.
- [ ] Sources section lists every source cited above, each with a description of
      what it supports.
- [ ] The page includes a visible "Sources last checked: YYYY-MM-DD" line and the
      date is an ISO (YYYY-MM-DD) date when the links were last validated.
- [ ] The `<title>` reads "<Conflict title> — World Peace".
- [ ] You state in the pull request that you have read the page back for
      neutrality (`neutralityReviewed`).

## Tone rules, in short

Neutral, sourced, and useful. Describe what an initiative does and who runs it;
let the sources carry the claims. If a statement cannot be checked against a
published source, leave it out.
