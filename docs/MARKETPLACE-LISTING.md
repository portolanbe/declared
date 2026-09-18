# Marketplace listing copy

Paste-ready text for the GitHub Marketplace action listing (free), and later
the App listing (paid plans). Keep the tone of the product: kind, plain,
never accusatory.

## Name

declared - AI contribution policy

## Tagline (one line, under 125 chars)

Check pull requests against your AI contribution policy. Reads what people
declare; never plays detective. Zero dependencies.

## Categories

Code quality · Project management (Marketplace allows two)

## Description

Maintainers are drowning in undisclosed AI pull requests, and companies have
AI policies nobody can enforce. declared turns one small config file,
`.github/ai-policy.yml`, into three things that can never drift apart: a
plain-language AI_POLICY.md, an AI-disclosure section in your PR template,
and this check on every pull request.

Contributors declare their AI use in the PR description, in the W3C
disclosure vocabulary and the Linux kernel's Assisted-by format. The check
verifies the declaration is complete and consistent with the trailers their
own tools left in commits. When something is missing it posts one comment,
kept edited in place, with a paste-ready block pre-filled from what it
already knows. It labels PRs by disclosure level so your roll-up is one
filter away.

What it never does: detect AI-written code, check out or run PR code, or
shame anyone. The policy is read from the base branch, so a PR cannot relax
the rules it is judged by. Works on forks via pull_request_target, safely.

Setup is one command: `npx declared-ai init`. Four presets (open, disclose,
strict, human-only); every key overridable.

## Pricing plans (for the App listing, later)

- Free: public repositories, all checks, all presets.
- Org, 99 EUR/month per organisation: private repositories, one org-wide
  policy, the scheduled org-wide disclosure roll-up, and the audit export
  (ISO 42001-shaped evidence pack and questionnaire answers).

## Support text

Documentation and issues: [repository URL]. declared stores no code and no
tokens; the check runs in your own Actions runners.
