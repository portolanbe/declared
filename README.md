# declared

**AI contribution policy as code.** One small config file drives your `AI_POLICY.md`,
the AI-disclosure section of your PR template, and a zero-dependency GitHub Action
that checks every pull request against it and explains, kindly, what is missing.

It never tries to *detect* AI-written code. Detection is unreliable and unfair to
the people it gets wrong. `declared` reads what contributors **declare**, and checks
that the declaration is complete and consistent with their own commits.

## Why

Maintainers are drowning in low-effort, AI-generated pull requests. Projects have
responded with written policies (Ghostty's `AI_POLICY.md`, MicroPython's disclosure
checkboxes, the Linux kernel's `Assisted-by:` tag, and similar rules at rust-lang,
scipy, QEMU and jj). But every project re-implements the same thing by hand:

- a prose policy, a PR template, and a check script that drift apart;
- regexes copy-pasted between repositories;
- no shared format, so the tooling can't be reused.

`declared` makes that a five-minute setup and keeps the three pieces in sync.

## Quick start

```bash
npx declared-ai init
```

This writes:

| File | Purpose |
| --- | --- |
| `.github/ai-policy.yml` | The policy. The only file you edit. |
| `AI_POLICY.md` | Plain-language policy, generated from the config. |
| `.github/pull_request_template.md` | Gains an AI-disclosure section (existing content is kept). |
| `.github/workflows/ai-policy.yml` | Runs the check on every pull request via `npx declared-ai run-action`. |

Commit, push, done: the check runs on the next pull request. No Marketplace
listing, no hosted service, nothing to install on the repository beyond these
files. (Prefer a pinned action? `declared init --uses OWNER/declared@v1` emits
the `uses:` form instead.)

After changing the config, run `npx declared-ai render`. `npx declared-ai doctor`
fails if the docs are out of date, so it works well in CI.

> **Status:** v0.3, publish pending. The npm package name is `declared-ai`
> (plain `declared` is taken by an unrelated package); the command it installs
> is still `declared`.

## What contributors write

```
AI-Disclosure: ai-assisted
Assisted-by: Claude Code:claude-opus-5
AI-Scope: generated the test fixtures; I wrote the parser changes

- [x] I have reviewed every change in this PR and can explain it without AI help.
```

- **Levels** are the W3C AI Content Disclosure vocabulary, also used by the
  [ai-disclosure convention](https://github.com/ggfevans/ai-disclosure):
  `none`, `ai-assisted`, `ai-generated`, `autonomous`.
- **`Assisted-by:`** uses the [Linux kernel format](https://docs.kernel.org/process/coding-assistants.html),
  `AGENT:MODEL [tools]`. The same line works as a commit trailer.
- Parsing is forgiving: bullets, bold, backticks, `AI assistance:` / `AI usage:`,
  and checkbox-style level pickers all work.

When something is missing, the action posts **one** comment (and keeps editing
that same comment) with a paste-ready block, pre-filled from what it already
knows, such as a `Co-authored-by` trailer your tool added to your commits.

## Presets

| Preset | Summary |
| --- | --- |
| `open` | AI welcome. Disclosure is requested and labelled, but never blocks a PR. |
| `disclose` *(default)* | AI welcome with disclosure: say which tool, and confirm a human reviewed it. |
| `strict` | Disclosure with tool, scope and commit trailers; no AI media; small first PRs. |
| `human-only` | No AI-generated contributions. Contributors confirm no AI tools were used. |

Presets are just starting values. Every key in the config overrides them.

## Configuration

```yaml
version: 1
preset: disclose
project: widgets
policy-url: AI_POLICY.md

allowed-levels: [none, ai-assisted, ai-generated]

require:
  disclosure: true        # PR declares a level
  tool: true              # AI-assisted PRs name the tool (Assisted-by)
  scope: false            # ...say what the AI did (AI-Scope)
  attestation: true       # ...confirm a human reviewed and understands it
  commit-trailers: false  # ...and mark each commit with Assisted-by

consistency: true         # compare the declaration with AI trailers in commits

media:
  forbid-ai-generated: false  # PRs adding images/audio/video confirm they aren't AI-made

first-time-contributors:
  max-changed-lines: 0    # cap AI-assisted first PRs (0 = off)

exempt:
  authors: ["dependabot[bot]", "renovate[bot]", "github-actions[bot]"]
  associations: [OWNER, MEMBER]
  labels: [skip-ai-policy]

drafts: warn              # warn | enforce | skip
enforcement: fail         # fail | warn (comment + labels only)
comment: true

labels:
  none: ""
  ai-assisted: ai-assisted
  ai-generated: ai-generated
  autonomous: ai-autonomous
  missing: needs-ai-disclosure

extra-signatures: []      # extra regexes for AI co-author trailers in commits
notes: ""                 # free text appended to AI_POLICY.md
```

Typos get a "did you mean" hint (`requre` → `require`), and invalid values
list the allowed options.

### Commit consistency

Many tools add trailers to commits on their own (for example
`Co-Authored-By: … <noreply@anthropic.com>`). If a PR says `none` but its
commits carry such trailers, the report adds a non-blocking "worth a look" note.
Built-in signatures cover Claude, the GitHub Copilot coding agent, Cursor's
agent, Aider, Devin and Jules. Add your own with `extra-signatures`.

## Security model

- **No code from the PR is ever checked out or run.** The action reads the
  description, commit messages and file names through the REST API. That makes
  `pull_request_target` safe, and it is what lets the action comment on PRs
  from forks.
- **The policy is read from the base branch**, so a pull request cannot relax
  the rules it is checked against.
- **Untrusted text is neutralised.** Values echoed into comments are placed in
  code spans with backticks and newlines stripped, so they cannot inject markup
  or @-mention people.
- The action only updates a comment that a bot wrote *and* that starts with its
  marker, so a contributor cannot plant a marker to hijack the comment.
- If the token is read-only, the check result still stands and the comment and
  labels are skipped with a warning.

## CLI

```
declared init [--preset P] [--project NAME] [--uses OWNER/REPO@REF] [--force]
declared render
declared doctor
declared check --body FILE|- [--range main..HEAD] [--first-time] [--json]
declared report [--repo OWNER/NAME] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
declared presets
declared run-action
```

`declared check` lets contributors (or their AI tools) validate a PR description
before opening it:

```bash
gh pr view --json body -q .body | npx declared-ai check --body - --range origin/main..HEAD
```

## Audit report

`declared report` reads the merged pull requests of a repository through the
GitHub API and rolls their disclosures into one report: coverage, levels,
tools named, and per-PR detail, as Markdown or JSON. Nothing is stored
anywhere; the repository is the ledger, the report is derived on demand.

```bash
GITHUB_TOKEN=$(gh auth token) npx declared-ai report --since 2026-01-01
```

Use it for an internal AI-policy roll-up, an ISO 42001 evidence pack, or a
due-diligence answer. This command stays free for the repository you point it
at; running it across a whole organisation on a schedule is the paid tier.

## Action inputs and outputs

| Input | Default | |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Needs `pull-requests: write` and `issues: write` to comment and label. |
| `config` | `.github/ai-policy.yml` | Read from the base branch. |
| `comment` | *(policy)* | `"true"` or `"false"` overrides the policy's `comment`. |

Outputs: `status` (`pass`/`warn`/`fail`/`skip`), `level`, `tools`.

## Development

Zero dependencies; Node ≥ 18.3.

```bash
npm test
```

## License

MIT. Copyright Portolan BV (portolan.be), BE 0687.906.875. The name and any
future paid tiers remain Portolan's; the code is yours to use under the MIT terms.
