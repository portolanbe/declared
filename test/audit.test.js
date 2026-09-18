import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAudit, renderAuditMarkdown } from '../src/audit.js';

const pr = (number, mergedAt, body, extra = {}) => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/acme/widgets/pull/${number}`,
  user: { login: 'sam' },
  merged_at: mergedAt,
  body,
  labels: [],
  ...extra,
});

const PULLS = [
  pr(4, '2026-06-10T10:00:00Z', 'AI-Disclosure: ai-assisted\nAssisted-by: Claude Code:claude-opus-5\n- [x] I have reviewed every change in this PR and can explain it without AI help.'),
  pr(3, '2026-06-05T10:00:00Z', 'AI-Disclosure: none'),
  pr(2, '2026-05-01T10:00:00Z', 'Just a fix, no disclosure block at all.'),
  pr(1, '2026-04-01T10:00:00Z', 'AI-Disclosure: ai-generated\nAssisted-by: Aider', { merged_at: null }),
];

function fakeFetch() {
  let served = false;
  return async (url) => {
    assert.match(String(url), /\/repos\/acme\/widgets\/pulls\?state=closed/);
    const items = served ? [] : PULLS;
    served = true;
    return { ok: true, status: 200, json: async () => items };
  };
}

test('buildAudit rolls merged PR disclosures into totals', async () => {
  const report = await buildAudit({
    owner: 'acme', repo: 'widgets', token: 't', fetchImpl: fakeFetch(), since: '2026-05-01',
  });
  assert.equal(report.repo, 'acme/widgets');
  assert.equal(report.totals.mergedPrs, 3); // unmerged PR 1 excluded
  assert.equal(report.totals.disclosed, 2);
  assert.equal(report.totals.undisclosed, 1);
  assert.equal(report.totals.byLevel['ai-assisted'], 1);
  assert.equal(report.totals.byLevel.none, 1);
  assert.equal(report.totals.aiAssistedReviewed, 1);
  assert.equal(report.totals.tools[0].name, 'Claude Code:claude-opus-5');
  assert.deepEqual(report.prs.map((p) => p.number), [2, 3, 4]); // sorted by merge time
});

test('since filters by merge date and markdown renders the roll-up', async () => {
  const report = await buildAudit({
    owner: 'acme', repo: 'widgets', token: 't', fetchImpl: fakeFetch(), since: '2026-06-01',
  });
  assert.equal(report.totals.mergedPrs, 2);
  const md = renderAuditMarkdown(report);
  assert.match(md, /AI disclosure audit: acme\/widgets/);
  assert.match(md, /100% coverage|66\.7% coverage/);
  assert.match(md, /\[#4\]/);
  assert.match(md, /`ai-assisted` \| 1/);
});

test('buildAudit refuses a malformed date and a missing repo', async () => {
  await assert.rejects(() => buildAudit({ owner: 'a', repo: 'b', token: 't', since: 'June' }), /--since/);
  await assert.rejects(() => buildAudit({ token: 't' }), /--repo/);
});
