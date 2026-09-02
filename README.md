# world-peace
A static site mapping concrete, verifiable peace-building initiatives - per-conflict pages, organisations and sources.

This repository now contains a minimal site skeleton and a first conflict page (Northern Ireland). The site is plain HTML/CSS/JS with no framework and is intended as an exemplar for future cycles: one conflict page per cycle, neutral tone, verifiable sources, no fundraising.

Files added in this change:
- index.html — site home with a searchable conflict list
- conflicts/northern-ireland.html — example per-conflict page with initiatives, organisations, actions and sources
- css/styles.css — minimal responsive site styles
- js/main.js — small client-side search/filter for the conflict list

Organisation pages
- templates/organisation.html — reusable, commented template for a plain-HTML organisation page (name, country/mission, verifiable activities, links to conflict pages, non-fundraising actions, sources).
- content/organisations/example-organisation.html — worked example filled with placeholder content, matching data/examples/organisation-example.json.

How to preview locally
- Clone the repository and open index.html in a browser (or serve the directory with a simple static server).
- From the home page click the Northern Ireland link to view the conflict page.

Content guidance for contributors
- Keep updates neutral and strictly sourced. Cite verifiable sources on each conflict page.
- No fundraising or advocacy language; "what a reader can do today" must list non-fundraising actions (read, volunteer, share reputable sources).
- Organisation pages: start from templates/organisation.html and include the organisation's name, country/region, mission, verifiable sourced activities, links to the conflict pages that reference it, a non-fundraising "what a reader can do today" section, and a sources list. See content/organisations/example-organisation.html for a filled-in example, and data/organisation.schema.json for the underlying fields.

Notes for reviewers
- Confirm files load (CSS and JS referenced from index.html and conflict pages).
- Check the conflict page contains at least three sourced initiatives and a "what a reader can do today" section.
- Ensure all external links resolve and text remains neutral: every external link must have been opened and confirmed to resolve, and every page must carry a meta description.

Page descriptions and share previews
- Every page carries `<meta name="description">` plus `og:title`, `og:description`, `og:type`, `og:site_name` and `twitter:card`/`twitter:title`/`twitter:description`, so search results and pasted links show the page's own summary instead of a clipped fragment.
- The description text is copied from the page's own Overview (or, on the home page, the intro paragraph) and must introduce no claim the page does not already make and source. Keep it to roughly 150 characters, and keep the three description strings identical.
- `og:type` is `website` on index.html and `article` on conflict and organisation pages.
- No `<link rel="canonical">` and no `og:url` are set anywhere: the root `.d8a` still has `# url:` commented out, so the site has no public address to point at. Add both in one pass when a URL exists.
- New organisation pages start from templates/organisation.html, whose head block carries the tags with placeholder text and a comment explaining what to replace.

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
