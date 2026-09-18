// Audit roll-up: turn the disclosures on merged pull requests into one
// audit-shaped report, read entirely through the GitHub API. Stateless by
// design: nothing is stored anywhere; the repository itself is the ledger.
//
// This is the seed of the paid tier. The free CLI can always produce the
// report for the repository you point it at; the org tier automates it
// across every private repository and formats it for auditors.

import { createGitHub } from './github.js';
import { parseDisclosure } from './parse.js';
import { LEVELS } from './policy.js';

const DAY_MS = 24 * 60 * 60 * 1000 - 1;

/**
 * Build the audit report for one repository.
 * `since` / `until` are YYYY-MM-DD strings judged against the merge time.
 */
export async function buildAudit({
  owner, repo, since = null, until = null, token,
  apiUrl = 'https://api.github.com', fetchImpl = globalThis.fetch, limit = 1000,
}) {
  if (!owner || !repo) throw new Error('Pass the repository as --repo owner/name.');
  const gh = createGitHub({ token, apiUrl, fetchImpl });
  const from = since ? Date.parse(`${since}T00:00:00Z`) : 0;
  const to = until ? Date.parse(`${until}T00:00:00Z`) + DAY_MS : Number.POSITIVE_INFINITY;
  if (Number.isNaN(from)) throw new Error(`--since must be a date like 2026-01-01, got "${since}".`);
  if (Number.isNaN(to)) throw new Error(`--until must be a date like 2026-12-31, got "${until}".`);

  const closed = await gh.paginate(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=closed&sort=updated&direction=desc`,
    limit,
  );

  const prs = [];
  for (const pr of closed) {
    if (!pr.merged_at) continue;
    const mergedAt = Date.parse(pr.merged_at);
    if (mergedAt < from || mergedAt > to) continue;
    const d = parseDisclosure(pr.body);
    prs.push({
      number: pr.number,
      title: pr.title ?? '',
      url: pr.html_url ?? '',
      author: pr.user?.login ?? '',
      mergedAt: pr.merged_at,
      level: d.levels[0] ?? null,
      tools: d.tools.map((t) => t.raw),
      scope: d.scope,
      reviewed: d.reviewed,
      labels: (pr.labels ?? []).map((l) => l.name),
    });
  }
  prs.sort((a, b) => (a.mergedAt < b.mergedAt ? -1 : 1));

  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  let undisclosed = 0;
  const toolCounts = new Map();
  for (const pr of prs) {
    if (pr.level) byLevel[pr.level] += 1;
    else undisclosed += 1;
    for (const tool of pr.tools) toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
  }
  const disclosed = prs.length - undisclosed;

  return {
    format: 'declared-audit',
    version: 1,
    generatedAt: new Date().toISOString(),
    repo: `${owner}/${repo}`,
    since,
    until,
    totals: {
      mergedPrs: prs.length,
      disclosed,
      undisclosed,
      coveragePct: prs.length ? Math.round((disclosed / prs.length) * 1000) / 10 : 0,
      byLevel,
      aiAssistedReviewed: prs.filter((p) => p.level && p.level !== 'none' && p.reviewed).length,
      tools: [...toolCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
    },
    prs,
  };
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The same report as Markdown, ready to paste into an audit pack or a review. */
export function renderAuditMarkdown(report) {
  const t = report.totals;
  const period = [report.since, report.until].some(Boolean)
    ? ` (${report.since ?? 'start'} to ${report.until ?? 'now'})`
    : '';
  const out = [
    `# AI disclosure audit: ${report.repo}${period}`,
    '',
    `Generated ${report.generatedAt} by declared. Source of truth: the merged pull requests themselves.`,
    '',
    `- Merged pull requests: **${t.mergedPrs}**`,
    `- With a disclosure: **${t.disclosed}** (${t.coveragePct}% coverage)`,
    `- Without a disclosure: **${t.undisclosed}**`,
    `- AI-assisted or stronger, with a human review attestation: **${t.aiAssistedReviewed}**`,
    '',
    '| Level | Merged PRs |',
    '| --- | --- |',
    ...Object.entries(t.byLevel).map(([level, count]) => `| \`${level}\` | ${count} |`),
    `| _undisclosed_ | ${t.undisclosed} |`,
    '',
  ];
  if (t.tools.length) {
    out.push('## Tools named in disclosures', '', '| Tool | PRs |', '| --- | --- |');
    for (const tool of t.tools) out.push(`| ${cell(tool.name)} | ${tool.count} |`);
    out.push('');
  }
  out.push('## Pull requests', '', '| PR | Merged | Author | Level | Reviewed | Tools |', '| --- | --- | --- | --- | --- | --- |');
  for (const pr of report.prs) {
    out.push(`| [#${pr.number}](${pr.url}) ${cell(pr.title).slice(0, 60)} | ${pr.mergedAt.slice(0, 10)} | ${cell(pr.author)} | ${pr.level ? `\`${pr.level}\`` : '_none given_'} | ${pr.level && pr.level !== 'none' ? (pr.reviewed ? 'yes' : 'no') : ''} | ${cell(pr.tools.join(', '))} |`);
  }
  out.push('');
  return out.join('\n');
}
