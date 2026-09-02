# world-peace
A static site mapping concrete, verifiable peace-building initiatives - per-conflict pages, organisations and sources.

This repository now contains a minimal site skeleton and a first conflict page (Northern Ireland). The site is plain HTML/CSS/JS with no framework and is intended as an exemplar for future cycles: one conflict page per cycle, neutral tone, verifiable sources, no fundraising.

Files added in this change:
- index.html — site home with a searchable conflict list
- conflicts/northern-ireland.html — example per-conflict page with initiatives, organisations, actions and sources
- css/styles.css — minimal responsive site styles
- js/main.js — small client-side search/filter for the conflict list

Conflict pages
- templates/conflict.html — reusable, commented template for a per-conflict page (overview, initiatives and organisations, non-fundraising actions, sources). Each block names the field it fills in data/conflict.schema.json.
- CONTRIBUTING.md — how to copy the template, the one-line entry to add to index.html, and the pre-submit checklist reviewers use.
- conflicts/northern-ireland.html and conflicts/liberia.html — filled-in examples of the same structure.

Organisation pages
- templates/organisation.html — reusable, commented template for a plain-HTML organisation page (name, country/mission, verifiable activities, links to conflict pages, non-fundraising actions, sources).
- content/organisations/example-organisation.html — worked example filled with placeholder content, matching data/examples/organisation-example.json.

How to preview locally
- Clone the repository and open index.html in a browser (or serve the directory with a simple static server).
- From the home page click the Northern Ireland link to view the conflict page.

Content guidance for contributors
- Read CONTRIBUTING.md first: it has the copy-the-template steps, the index.html list entry, and the checklist to work through before submitting.
- Conflict pages: start from templates/conflict.html, save it as conflicts/<slug>.html, and add `<li><a href="conflicts/<slug>.html">Title</a></li>` to the list in index.html. See data/conflict.schema.json for the underlying fields.
- Keep updates neutral and strictly sourced. Cite verifiable sources on each conflict page.
- No fundraising or advocacy language; "what a reader can do today" must list non-fundraising actions (read, volunteer, share reputable sources).
- Organisation pages: start from templates/organisation.html and include the organisation's name, country/region, mission, verifiable sourced activities, links to the conflict pages that reference it, a non-fundraising "what a reader can do today" section, and a sources list. See content/organisations/example-organisation.html for a filled-in example, and data/organisation.schema.json for the underlying fields.

Notes for reviewers
- Confirm files load (CSS and JS referenced from index.html and conflict pages).
- Check the conflict page contains at least three sourced initiatives and a "what a reader can do today" section.
- Ensure all external links resolve and text remains neutral.
- Work through the pre-submit checklist in CONTRIBUTING.md; it is the same list, in full.

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
