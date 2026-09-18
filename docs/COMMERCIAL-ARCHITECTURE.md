# How declared works as a business, in practice

This answers three questions concretely: where does the software run, where is
the paywall, and how does money move from the customer's pocket into ours.

## Where the software runs

There is no declared server in the core product. The whole free tier executes
inside the customer's own GitHub Actions runners:

```
customer's repo
  .github/ai-policy.yml          <- the policy, versioned with the code
  .github/workflows/ai-policy.yml -> runs: npx declared-ai run-action
                                      (their runner, their compute, their token)
```

The workflow downloads the npm package on each run, reads the PR through the
GitHub API with the workflow's own `GITHUB_TOKEN`, comments, labels, and exits.
We host nothing, store nothing, and hold no customer data or tokens. That is
what makes support near zero and what makes the product impossible to undercut
on price: our marginal cost per free repository is exactly zero.

`declared report` works the same way: it runs on the user's machine or CI,
reads merged PRs through the API, prints a report, stores nothing.

## Where the paywall sits

The paywall is not in the code (the core is MIT and anyone can run it
anywhere, which is the point). The paywall is on the **organisation-level
conveniences** that only make sense at scale and that need an installation
identity:

| Free forever | Org tier (paid) |
| --- | --- |
| The Action and CLI on any public repo | Use on private repos with support |
| `declared report` for one repo, run by hand | Scheduled org-wide roll-up across all repos |
| Policy per repo | One org policy inherited by every repo |
| PR comment and labels | Audit pack: ISO 42001-shaped evidence export, questionnaire answers |

Mechanically, the paid tier is a **GitHub App** listed on the GitHub
Marketplace with two plans (Free, Org). The App is what makes billing and
entitlement possible:

1. The customer installs the declared App on their org and picks the paid plan.
2. GitHub sends `marketplace_purchase` webhooks to one small serverless
   endpoint (a Cloudflare Worker; the only hosted component in the whole
   business). The Worker keeps the entitlement list: org X is on plan Y.
3. Paid features check entitlement: the Action (or the scheduled report) asks
   the Worker "is this org paid?" and gets a signed yes/no. Public repos never
   ask; the free tier stays serverless-free.

The Worker is deliberately dumb: no accounts, no dashboard, no stored PR data,
roughly a hundred lines. It exists only because GitHub's billing events have
to land somewhere. If it is ever down, the Action fails open on the check
result and skips paid extras, so we never block a customer's merge queue with
our own outage.

## How the money moves

Primary rail, GitHub Marketplace billing:

```
customer's card or invoice (already on file with GitHub)
      -> GitHub charges it monthly with the rest of their GitHub bill
      -> GitHub takes its revenue share (a few percent; verify current terms)
      -> GitHub pays out the rest monthly to our bank account
```

What that requires from us, once: a GitHub organisation as the App owner,
Marketplace publisher verification, bank details for payout, and a legal
entity behind it (the existing Belgian entity works; GitHub handles the
customer-facing invoicing). What it gives us: the customer never enters a
card on our site, procurement never sees a new vendor, and dunning, receipts
and most tax handling ride on GitHub's rails. This is the fully automated
path and the default.

Fallback rail, merchant of record (Paddle or Lemon Squeezy), if Marketplace
listing review is slow or we want to sell outside GitHub: checkout link in
the README, the MoR charges the card, handles EU VAT as the seller of
record, and pays out monthly; the purchase issues a licence key the App
accepts as entitlement. Slightly more friction for the buyer, faster for us
to launch, and it keeps working if GitHub ever changes Marketplace terms.

## The launch sequence this implies

1. Publish the npm package. The free tier is fully live from that moment,
   because the generated workflow runs `npx declared-ai run-action`.
2. List the Action on the Marketplace (free listing, discovery only).
3. Build the App + Worker + paid plan only when the free tier shows pull:
   installs on private org repos are the buying signal to watch.
4. Audit pack ships as a feature of the paid plan, not a separate SKU, until
   an auditor's acceptance letter justifies its own price.

The order matters: every step is revenue-optional until the one after it is
justified by observed demand, which is what keeps the whole chain runnable
by one person who only builds and ships.
