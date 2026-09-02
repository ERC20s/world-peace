# world-peace
A static site mapping concrete, verifiable peace-building initiatives - per-conflict pages, organisations and sources.

This repository now contains a minimal site skeleton and a first conflict page (Northern Ireland). The site is plain HTML/CSS/JS with no framework and is intended as an exemplar for future cycles: one conflict page per cycle, neutral tone, verifiable sources, no fundraising.

Files added in this change:
- index.html — site home with a searchable conflict list
- conflicts/northern-ireland.html — example per-conflict page with initiatives, organisations, actions and sources
- css/styles.css — minimal responsive site styles
- js/main.js — small client-side search/filter, wired to the conflict list on the home page and to the organisation list on the organisations index (a shared wire(inputId, listId) helper, guarded so pages without those ids are unaffected)

Organisation pages
- content/organisations/index.html — the organisations index: a searchable list of every organisation page, linked from the Organisations section of the home page. This is the only route a reader has into content/organisations/, so a new page is not published until it is listed here.
- templates/organisation.html — reusable, commented template for a plain-HTML organisation page (name, country/mission, verifiable activities, links to conflict pages, non-fundraising actions, sources).
- content/organisations/example-organisation.html — worked example filled with placeholder content, matching data/examples/organisation-example.json. It is labelled on the index as a placeholder, not a real organisation.

Adding a new organisation page
- Copy templates/organisation.html to content/organisations/<slug>.html and fill in every section, authoring the content from data/organisation.schema.json.
- Keep the relative paths the example uses: ../../css/styles.css, ../../js/main.js and ../../index.html.
- Add one <li> to the <ul id="organisation-list"> in content/organisations/index.html linking to the new file. The list is maintained by hand; there is no build step.

How to preview locally
- Clone the repository and open index.html in a browser (or serve the directory with a simple static server).
- From the home page click the Northern Ireland link to view the conflict page.
- From the home page click "All organisation pages" under Organisations to reach the organisations index, then an organisation page from there.

Content guidance for contributors
- Keep updates neutral and strictly sourced. Cite verifiable sources on each conflict page.
- No fundraising or advocacy language; "what a reader can do today" must list non-fundraising actions (read, volunteer, share reputable sources).
- Organisation pages: start from templates/organisation.html and include the organisation's name, country/region, mission, verifiable sourced activities, links to the conflict pages that reference it, a non-fundraising "what a reader can do today" section, and a sources list. See content/organisations/example-organisation.html for a filled-in example, and data/organisation.schema.json for the underlying fields.

Notes for reviewers
- Confirm files load (CSS and JS referenced from index.html, conflict pages and content/organisations/*.html).
- Confirm the home page reaches the organisations index and the index reaches each organisation page, and that both search boxes filter their lists.
- Check the conflict page contains at least three sourced initiatives and a "what a reader can do today" section.
- Ensure all external links resolve and text remains neutral.

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
