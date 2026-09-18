# Launch checklist

Ordered. Each block is doable in one sitting. Only the items marked (you)
need accounts or signatures that are yours alone; everything else can be
prepared by an agent session in this repo.

## 0. Decisions (10 minutes, you)

- [ ] Confirm the npm package name. Default in the code: `declared-ai`
      (plain `declared` is taken). One constant to change: `NPM_PACKAGE` in
      `src/render.js`, plus `name` in package.json, plus README mentions.
- [ ] Confirm the GitHub org name that will own the public repo and the
      action. Checked 18 Sep 2026: `portolan` is taken (unrelated user);
      `portolan-be` is free. Squat it now either way (you).
- [ ] npm alternative: the scoped name `@portolan/declared` is unpublished;
      creating the free npm org `portolan` would allow it and ties the
      package to the company. Scoped names need `--access public` on publish.

## 1. Repository goes public

- [ ] Create the public repo under the chosen org; push this tree (you).
- [ ] Fill `repository`, `homepage`, `bugs` in package.json with the real URL.
- [ ] Enable the site: `scripts/build-site.js` output on GitHub Pages.
- [ ] Add a CI workflow: `node --test` on push and PR (declared runs on its
      own PRs, obviously: `npx declared-ai init` on this repo too).

## 2. npm publish

- [ ] `npm publish` from the repo root (needs `npm login`) (you).
- [ ] Verify: `npx declared-ai@latest presets` works on a clean machine.
- [ ] Tag `v0.3.0`, create the GitHub release, paste the CHANGELOG entry.

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
