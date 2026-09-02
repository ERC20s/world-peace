# world-peace
A static site mapping concrete, verifiable peace-building initiatives - per-conflict pages, organisations and sources.

This repository now contains a minimal site skeleton and a first conflict page (Northern Ireland). The site is plain HTML/CSS/JS with no framework and is intended as an exemplar for future cycles: one conflict page per cycle, neutral tone, verifiable sources, no fundraising.

What is in the repository
- index.html — site home with a searchable conflict list
- conflicts/northern-ireland.html — per-conflict page: overview, sourced initiatives, "what a reader can do today", sources
- conflicts/liberia.html — second per-conflict page, same shape
- content/organisations/example-organisation.html — worked example organisation page, matching data/examples/organisation-example.json
- templates/organisation.html — reusable, commented template for a plain-HTML organisation page (name, country/mission, verifiable activities, links to conflict pages, non-fundraising actions, sources). Its links are placeholders, so the site check skips this directory.
- css/styles.css — minimal responsive site styles
- js/main.js — small client-side search/filter for the conflict list
- data/*.schema.json and data/examples/*.json — content schemas and validating examples
- scripts/check-site.js — the no-dependency site check described below
- package.json — the two commands (`npm run dev`, `npm run check`); the site has no framework and no runtime dependencies

How to preview locally
- Clone the repository and open index.html in a browser, or run `npm run dev` (serves the directory on http://localhost:5001, the port the .d8a `web` run entry declares).
- From the home page click a conflict link to view a conflict page.

Checking a page before you propose it
- Run `npm run check` (equivalently `node scripts/check-site.js`). It is plain Node with no packages and makes no network calls.
- It reports, and exits non-zero on:
  - broken relative links — any href/src whose target file is not in the repository (this covers css/styles.css and js/main.js on every page)
  - missing headings — a page under conflicts/ or content/organisations/ must carry "Overview", "What a reader can do today" and "Sources"
  - orphan pages — a page under those directories that no other page links to, so no reader can reach it
  - unsourced pages — a Sources section with no external http(s) link
- Known report on a clean checkout today: content/organisations/example-organisation.html is an orphan — it links out to the home page and to Northern Ireland, but nothing links in to it. The check goes green once an organisations index (or the home page) links to it.
- The check is advisory: it is regex-based scanning, not an HTML parser, so it can be wrong. Nothing merges or blocks on it automatically; run it and say in the pull request what it reported.

Content guidance for contributors
- Keep updates neutral and strictly sourced. Cite verifiable sources on each conflict page.
- No fundraising or advocacy language; "what a reader can do today" must list non-fundraising actions (read, volunteer, share reputable sources).
- Organisation pages: start from templates/organisation.html and include the organisation's name, country/region, mission, verifiable sourced activities, links to the conflict pages that reference it, a non-fundraising "what a reader can do today" section, and a sources list. See content/organisations/example-organisation.html for a filled-in example, and data/organisation.schema.json for the underlying fields.

Notes for reviewers
- Run `npm run check` first; it covers file loading (CSS/JS references), the required headings, orphan pages and unsourced pages. Contributors are expected to run it before asking for a Code proposal.
- By eye, still check what the script cannot: the page contains at least three sourced initiatives, the tone is neutral and non-fundraising, and the external links actually resolve and say what the page claims (the check never makes network calls).

Content schemas
- data/conflict.schema.json — JSON Schema for a conflict entry: slug, title, summary, optional date range, regions, initiatives (name, organisation, description, sourceUrl), optional organisation ids, actions ("what a reader can do today", non-fundraising), sources, and a neutralityReviewed flag.
- data/organisation.schema.json — JSON Schema for an organisation entry: id, name, website, country, mission, optional contact channel, and linked initiative names.
- data/examples/conflict-example.json and data/examples/organisation-example.json — generic placeholder examples that validate against the schemas above; not tied to any specific conflict page.
- These schemas describe the data future conflict/organisation pages should be authored from; they do not yet drive the HTML templates automatically.

Validating examples locally
- Install a JSON Schema validator, e.g. `npm install -g ajv-cli` (or use any Draft-07 compatible validator).
- Run: `ajv validate -s data/conflict.schema.json -d data/examples/conflict-example.json`
- Run: `ajv validate -s data/organisation.schema.json -d data/examples/organisation-example.json`
- Both commands should report the example file as valid.
