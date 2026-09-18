# Moats under construction

The honest position: at launch declared has no moat. The code is small and
MIT-licensed. What it has is four candidate moats, each of which is earned by
operating, not by building. This file makes each one a testable assumption
with a metric, so the weekly review measures progress instead of debating it.

The rule of this file: a moat with no measurable movement in two consecutive
reviews gets its plan changed, not its wording.

## M1. Format incumbency: `ai-policy.yml` is the config GitHub has to respect

- Bet: when GitHub ships native disclosure signalling, enough repositories
  carry `ai-policy.yml` that compatibility with it is the path of least
  resistance.
- Metric: public repositories containing `.github/ai-policy.yml` (GitHub code
  search), and named projects that adopted it.
- Now (Sept 2026): 0. Not shipped.
- Moves: publish; convert two or three visible OSS projects that already have
  hand-rolled AI policies; keep the format boring, documented and versioned.
- Kill signal: GitHub ships a native config format with real adoption while
  ours is below a few hundred repos.

## M2. The ledger: accumulated disclosure history as switching cost

- Bet: once an organisation has months of per-PR disclosure records and has
  handed a declared report to an auditor or customer, replacing declared means
  orphaning evidence, so churn falls with tenure.
- Metric: median paid tenure; number of orgs that exported an audit report in
  the last quarter (an exported report is the ledger being load-bearing).
- Now: 0 by definition.
- Moves: make `declared report` excellent and effortless; date-stamp and
  version report formats so old exports stay reproducible.
- Kill signal: paid churn does not fall with tenure.

## M3. Institutional recognition: auditors accept declared exports as evidence

- Bet: if ISO 42001 auditors accept declared reports as evidence for AI-use
  controls, declared becomes part of the audit ritual, which money cannot
  quickly displace.
- Metric: written acceptances by certification bodies; auditor or consultant
  referrals inbound.
- Now: 0. This is the deepest moat and the slowest.
- Moves: design partners chosen for upcoming ISO 42001 audits; one-page
  auditor-facing explanation of what the report evidences and how it is
  derived; collect the first acceptance letter.
- Kill signal: two audits where the report was submitted and ignored.

## M4. The declaration position: rivals cannot copy the stance

- Bet: detection vendors cannot become declaration-based without repudiating
  their own product, so the position stays uncontested by incumbents; the
  defence against new entrants is M1 to M3, not M4.
- Metric: whether any detection vendor pivots to declaration-first; whether a
  new declaration-based competitor appears on the Marketplace.
- Now: holds; the quadrant is empty (competitive map, Sept 2026).
- Moves: keep reading more evidence sources (trailers, Git AI notes) so the
  declaration plus evidence combination deepens; never add detection.
- Kill signal: a well-distributed declaration-based competitor, or GitHub
  native. Either collapses M4 into a race on M1.

## The standing threat

GitHub going native is not a moat question, it is the clock on M1. Watch: the
public maintainer-controls discussion (Feb 2026), GitHub changelog entries on
PR transparency or AI disclosure, and any `ai-policy`-like key appearing in
GitHub's own schemas.

## Review loop

A scheduled weekly review checks the metrics and the standing threat and
reports movement, red flags and proposed plan changes. Monthly, fold real
numbers back into this file and into the business model bundle
(declared-business-model.json in the Business Modelling Suite), where each
moat lives as an assumption with impact, uncertainty and a test.
