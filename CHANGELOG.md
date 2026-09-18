# Changelog

## 0.3.0 (unreleased)

- The generated workflow now runs `npx declared-ai run-action` by default, so
  the check works the moment the npm package is published, with no Marketplace
  action listing and no `OWNER/...` placeholder to replace. `init --uses`
  still emits the pinned `uses:` form.
- New command: `declared report`. Rolls the disclosures on merged pull
  requests into one audit report (Markdown or JSON) straight from the GitHub
  API: coverage, levels, tools, per-PR detail. Stateless; needs GITHUB_TOKEN.
- New command: `declared run-action`, the entry point the generated workflow
  uses to run the same check the published action runs.
- `init` prints next steps instead of a placeholder warning.
- Package renamed to `declared-ai` for npm (the name `declared` is taken by an
  unrelated package). The installed command is still `declared`.
- New docs: COMMERCIAL-ARCHITECTURE (where it runs, where the paywall sits,
  how money flows), MARKETPLACE-LISTING, LAUNCH-CHECKLIST, MOATS.

## 0.1.0

- Initial working version: init, render, doctor, check, presets; the GitHub
  Action; four presets; forgiving disclosure parsing; commit-trailer
  consistency; the security model (no PR code ever runs).
