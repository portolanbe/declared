# Launch checklist

Status as of 18 Sep 2026: **the free tier is LIVE.** GitHub account and repo,
npm package, and self-governance are done (section 0-2 below, ticked). What
remains is optional reach (Marketplace listing, Pages site) and the real work
of section 4, getting the first adopters.

Owner is the GitHub/npm account `portolanbe` (personal account, not an org).
The npm package is `declared-ai`; the repo is https://github.com/portolanbe/declared.

## 0. Decisions - DONE

- [x] npm package name: `declared-ai` (plain `declared` was taken). Published.
- [x] GitHub identity: personal account `portolanbe` owns the repo. An org can
      be added later if the company wants multi-member permissions; not needed
      for a one-person launch.

## 1. Repository public - DONE

- [x] Public repo live at https://github.com/portolanbe/declared (published
      via GitHub Desktop; the token+terminal path fought us, Desktop won).
- [x] LICENSE, README, action.yml carry Portolan BV copyright.
- [x] CI workflow added: `.github/workflows/test.yml` runs `node --test` on
      push and PR.
- [x] declared governs its own repo: `.github/ai-policy.yml`, AI_POLICY.md,
      PR template section, and the AI-policy workflow are in place; `doctor`
      passes. The repo is now its own live demo.
- [ ] `.gitignore` added (protects the npm recovery codes and .DS_Store).
      REMINDER: move `access npm/npm_recovery_codes.txt` OUT of the repo folder
      to a password manager; git-ignore protects this repo but secrets should
      not live in a synced project folder.
- [ ] Optional: fill `repository`, `homepage`, `bugs` in package.json with the
      repo URL (cosmetic; npmjs.com/package/declared-ai already links via author).
- [ ] Optional: enable GitHub Pages for the docs site (`scripts/build-site.js`
      output). Two clicks in the browser: repo Settings -> Pages -> Source =
      Deploy from a branch, branch = main, folder = /site (or build to /docs).

## 2. npm publish - DONE

- [x] Published `declared-ai@0.3.0` to npm (2FA enabled; publishing needs it).
- [x] Verified live: `npx declared-ai init` resolves for anyone.
- [ ] Optional: tag `v0.3.0` on GitHub and cut a release with the CHANGELOG entry.

## 3. Action on the Marketplace (free listing)

- [ ] Tag `v1` (the floating major tag the `uses:` form points at).
- [ ] Publish the action to the Marketplace from the repo's releases page,
      with the copy from docs/MARKETPLACE-LISTING.md (you: one form).
- [ ] After publishing, switch the README quick start to mention both forms.

## 4. First adopters (the M1 moat clock starts here)

- [ ] Open PRs or issues offering declared to two or three projects that
      already hand-rolled AI policies (MicroPython-style checklists, Vanilla
      OS workflows). Not a pitch: "this replaces your custom script, here is
      the config that matches your current policy."
- [ ] Post the launch write-up: the declaration-not-detection argument, the
      five-minute setup, the security model.

## 5. Paid tier (only on observed pull)

- [ ] Buying signal to wait for: installs/inits on private org repos, or
      inbound asks for org-wide roll-up. Until then, build nothing here.
- [ ] Then: GitHub App + two Marketplace plans + the entitlement Worker
      (docs/COMMERCIAL-ARCHITECTURE.md); Marketplace publisher verification
      and payout details (you).

## Standing rules

- Weekly moat review is scheduled and reports movement on MOATS.md metrics.
- Every release: `node --test` green, CHANGELOG updated, version bumped.
- Nothing in the free tier ever requires our server to be up.
