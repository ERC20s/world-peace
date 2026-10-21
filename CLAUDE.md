# CLAUDE.md

world-peace is a plain HTML/CSS/JS static site mapping verifiable peace-building initiatives:
per-conflict pages (`conflicts/`), organisation pages (`content/organisations/`), structured data and JSON schemas (`data/`),
and a searchable initiatives list (`initiatives.html`) plus `sitemap.xml` generated from `data/`.

## Commands (Node 22)

- Install: `npm ci`
- Serve locally: `npm run web` (http on port 5001)
- Tests: `npm test` (`node --test`, files in `tools/test/`)
- Check (validate pages + external links): `npm run check`
  - separately: `npm run validate-pages` (pages, `data/` against the schemas, page-vs-data, meta tags, generated files up to date),
    `npm run check-links` (unreachable hosts warn; `--strict` fails on them)
- Regenerate `initiatives.html` and `sitemap.xml` after changing `data/` or adding a page: `npm run build-site`
- Validate schema examples and data: `npm run validate-schemas`
- Path fixer: `npm run fix-paths` (dry-run), `node tools/fix-relative-paths.js --apply` to write
- CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm test`, `npm run validate-pages`, `npm run check-links -- --strict`, `npm run validate-schemas`, `npm run fix-paths`.

The `run:` block at the end of `.d8a` and README.md are the source of truth for how the project runs.

## Ground rules

- Work on a new branch from `main`; open one PR per task, listing the commands you ran and their results before and after.
- Never modify `.d8a` or `.d8a-governance`. Never modify the group-store widget copied from the `payments:` block of `.d8a` (`id="group-store"`, `groupStoreVerify`).
- Ignore open PRs by `d8a[bot]`: do not merge, close, rebase, cherry-pick from, or comment on them.
- Do not add a LICENSE file or any licence text.
- Install dependencies and run the project's checks before and after changes. Never report a result you did not get by running the command.
- Every new test must be able to fail: no `require(x >= 0)` on unsigned values, no bare `vm.expectRevert()`, no `try/catch` accepting any error, no asserting a value equals itself. Import every symbol you use. If a test is wrong rather than the code, fix the test and say so.
- Nothing dev-only in browser-shipped code: no localhost or private hostnames, no debug fallbacks. No secrets, tokens or keys in the repo.
- CI runs exactly the declared checks and fails when one fails: no `continue-on-error`, no `|| true`, no skipped jobs counted as passing. Pin GitHub Actions to current major versions.
- Keep changes focused: no reformatting untouched files, no unneeded dependency upgrades, no renaming public files or URLs, no rewriting git history.
- Fix root causes; never delete or weaken a test or check to get green.
