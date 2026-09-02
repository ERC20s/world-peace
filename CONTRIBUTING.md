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
   <li><a href="conflicts/<slug>.html">Title</a></li>
   ```

   A page that is not in that list is invisible to readers and to the search box
   in `js/main.js`.
5. Open a pull request. A separate Code proposal is what merges it.

## Adding an organisation page

Copy `templates/organisation.html` to `content/organisations/<slug>.html` and
fill it in the same way; the fields are listed in
`data/organisation.schema.json`, and
`content/organisations/example-organisation.html` is a worked example. Link the
page from the conflict pages that reference the organisation.

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

## Pre-submit checklist (conflict pages)

Tick every line before you open the pull request. Reviewers check the same list.

- [ ] The file is `conflicts/<slug>.html` and the slug matches the link in `index.html`.
- [ ] At least three initiatives, each with an organisation named and a working source link.
- [ ] Every external link resolves (open each one; no 404s, no redirects to a parked domain).
- [ ] Relative paths are correct from inside `conflicts/`: `../css/styles.css`,
      `../js/main.js`, `../index.html`.
- [ ] A "What a reader can do today" section with non-fundraising actions only —
      read, learn, volunteer, share verified sources. No donate links, no appeals.
- [ ] Neutral tone throughout: no advocacy, no partisan framing; contested facts
      and figures attributed to the source that published them.
- [ ] Sources section lists every source cited above, each with a description of
      what it supports.
- [ ] The `<title>` reads "<Conflict title> — World Peace".
- [ ] You state in the pull request that you have read the page back for
      neutrality (`neutralityReviewed`).

## Tone rules, in short

Neutral, sourced, and useful. Describe what an initiative does and who runs it;
let the sources carry the claims. If a statement cannot be checked against a
published source, leave it out.
