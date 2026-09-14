import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/evaluate.js';
import { loadPolicy } from '../src/policy.js';
import { MARKER, renderComment, suggestedDisclosure } from '../src/report.js';

const disclose = loadPolicy('preset: disclose');
const strict = loadPolicy('preset: strict');
const humanOnly = loadPolicy('preset: human-only');
const contributor = { login: 'someone', association: 'CONTRIBUTOR' };
const codes = (r) => r.findings.map((f) => f.code);

const GOOD = `Fixes the parser.

AI-Disclosure: ai-assisted
Assisted-by: Claude Code:claude-opus-5
- [x] I have reviewed every change in this PR and can explain it without AI help.`;

test('a complete disclosure passes and gets a level label', () => {
  const r = evaluate({ policy: disclose, body: GOOD, author: contributor });
  assert.equal(r.status, 'pass');
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.labels.add, ['ai-assisted']);
});

test('a plain human PR only needs to say none', () => {
  const r = evaluate({ policy: disclose, body: 'Typo fix.\n\nAI-Disclosure: none', author: contributor });
  assert.equal(r.status, 'pass');
});

test('missing disclosure fails, labels, and suggests a paste-able block', () => {
  const r = evaluate({ policy: disclose, body: 'Fixes the parser.', author: contributor, labels: ['ai-assisted'] });
  assert.equal(r.status, 'fail');
  assert.deepEqual(codes(r), ['missing-disclosure']);
  assert.deepEqual(r.labels, { add: ['needs-ai-disclosure'], remove: ['ai-assisted'] });
  assert.match(suggestedDisclosure(disclose, r), /^AI-Disclosure: none \| ai-assisted \| ai-generated$/m);
});

test('suggestion is pre-filled from commit trailers', () => {
  const r = evaluate({
    policy: disclose,
    body: 'no disclosure here',
    author: contributor,
    commits: [{ sha: 'aaaaaaaa1', message: 'feat\n\nAssisted-by: Cursor:gpt-5' }],
  });
  const s = suggestedDisclosure(disclose, r);
  assert.match(s, /AI-Disclosure: ai-assisted/);
  assert.match(s, /Assisted-by: Cursor:gpt-5/);
});

test('assisted PRs need a tool and an attestation; model is only a warning', () => {
  const r = evaluate({ policy: disclose, body: 'AI-Disclosure: ai-generated', author: contributor });
  assert.deepEqual(codes(r), ['missing-tool', 'missing-attestation']);
  const r2 = evaluate({ policy: disclose, body: `${GOOD.replace('Claude Code:claude-opus-5', 'Cursor')}`, author: contributor });
  assert.equal(r2.status, 'pass');
  assert.deepEqual(codes(r2), ['missing-model']);
});

test('levels outside the policy are rejected with a clear message', () => {
  const r = evaluate({ policy: disclose, body: 'AI-Disclosure: autonomous\nAssisted-by: Devin:x', author: contributor });
  assert.ok(codes(r).includes('level-not-allowed'));
  const h = evaluate({ policy: humanOnly, body: 'AI-Disclosure: ai-assisted', author: contributor });
  assert.match(h.findings.find((f) => f.code === 'level-not-allowed').message, /does not accept contributions made with AI tools/);
});

test('declaring none while commits carry AI trailers is flagged, but does not block', () => {
  const r = evaluate({
    policy: disclose,
    body: 'AI-Disclosure: none',
    author: contributor,
    commits: [{ sha: 'bbbbbbbb2', message: 'x\n\nCo-Authored-By: Claude <noreply@anthropic.com>' }],
  });
  assert.equal(r.status, 'pass');
  assert.deepEqual(codes(r), ['commit-trailer-mismatch']);
});

test('none plus an Assisted-by line is inconsistent', () => {
  const r = evaluate({ policy: disclose, body: 'AI-Disclosure: none\nAssisted-by: Claude:opus', author: contributor });
  assert.deepEqual(codes(r), ['inconsistent-disclosure']);
});

test('strict: scope, commit trailers, media, first-PR size', () => {
  const r = evaluate({
    policy: strict,
    body: GOOD,
    author: { login: 'newbie', association: 'FIRST_TIME_CONTRIBUTOR' },
    commits: [
      { sha: 'c1c1c1c1c1', message: 'one\n\nAssisted-by: Claude Code:claude-opus-5' },
      { sha: 'c2c2c2c2c2', message: 'two' },
      { sha: 'c3c3c3c3c3', message: 'Merge main', isMerge: true },
    ],
    files: [{ filename: 'docs/hero.png', status: 'added', additions: 0, deletions: 0 }],
    changedLines: 900,
  });
  assert.equal(r.status, 'fail');
  assert.deepEqual(codes(r), ['missing-scope', 'missing-commit-trailers', 'first-pr-too-large', 'media-attestation']);
  assert.match(r.findings[1].message, /1 commit\(s\).*`c2c2c2c`/);
});

test('exemptions skip the check entirely', () => {
  assert.equal(evaluate({ policy: disclose, body: '', author: { login: 'dependabot[bot]' } }).status, 'skip');
  assert.equal(evaluate({ policy: disclose, body: '', author: { login: 'x', association: 'MEMBER' } }).status, 'skip');
  assert.equal(evaluate({ policy: disclose, body: '', author: contributor, labels: [{ name: 'skip-ai-policy' }] }).status, 'skip');
});

test('drafts warn by default; enforcement: warn never fails', () => {
  assert.equal(evaluate({ policy: disclose, body: '', author: contributor, draft: true }).status, 'warn');
  assert.equal(evaluate({ policy: loadPolicy('preset: open'), body: '', author: contributor }).status, 'warn');
});

test('comment escapes untrusted input and carries the marker', () => {
  const r = evaluate({ policy: disclose, body: 'AI-Disclosure: `@everyone <img src=x>`', author: contributor });
  const md = renderComment(r, disclose, { policyUrl: 'https://example.com/AI_POLICY.md' });
  assert.ok(md.startsWith(MARKER));
  assert.match(md, /`@everyone <img src=x>` is not a disclosure level/);
  assert.doesNotMatch(md, /(?<!`)``(?!`)/, 'no empty or broken inline code spans');
  assert.match(md, /\[AI contribution policy\]\(https:\/\/example\.com\/AI_POLICY\.md\)/);
});
