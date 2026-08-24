# world-peace
A static site mapping concrete, verifiable peace-building initiatives - per-conflict pages, organisations and sources.

This repository now contains a minimal site skeleton and a first conflict page (Northern Ireland). The site is plain HTML/CSS/JS with no framework and is intended as an exemplar for future cycles: one conflict page per cycle, neutral tone, verifiable sources, no fundraising.

Files added in this change:
- index.html — site home with a searchable conflict list
- conflicts/northern-ireland.html — example per-conflict page with initiatives, organisations, actions and sources
- css/styles.css — minimal responsive site styles
- js/main.js — small client-side search/filter for the conflict list

How to preview locally
- Clone the repository and open index.html in a browser (or serve the directory with a simple static server).
- From the home page click the Northern Ireland link to view the conflict page.

Content guidance for contributors
- Keep updates neutral and strictly sourced. Cite verifiable sources on each conflict page.
- No fundraising or advocacy language; "what a reader can do today" must list non-fundraising actions (read, volunteer, share reputable sources).

How to write the content:
- Start a new conflict page from templates/conflict-template.html — it contains a
  documented skeleton with REQUIRED section markers and an example expandable
  sources list.
- Follow content/conflict-checklist.md for verifiability requirements (source
  format, tone constraints) before opening a pull request.

Notes for reviewers
- Confirm files load (CSS and JS referenced from index.html and conflict pages).
- Check the conflict page contains at least three sourced initiatives and a "what a reader can do today" section.
- Ensure all external links resolve and text remains neutral.
