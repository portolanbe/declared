import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/action.js';
import { MARKER } from '../src/report.js';

// A fake GitHub API: records writes, serves canned reads.
function fakeGitHub({ body, config, comments = [], labels = [], commits = [], association = 'CONTRIBUTOR' }) {
  const calls = [];
  const pull = {
    number: 7, body, draft: false, labels: labels.map((name) => ({ name })),
    user: { login: 'contrib' }, author_association: association,
    base: { sha: 'base123', ref: 'main' }, additions: 10, deletions: 2,
  };
  const routes = [
    ['GET', /\/pulls\/7$/, () => pull],
    ['GET', /\/contents\/\.github\/ai-policy\.yml\?ref=base123$/, () => (config == null ? null : { type: 'file', content: Buffer.from(config).toString('base64') })],
    ['GET', /\/pulls\/7\/commits\?/, () => commits],
    ['GET', /\/pulls\/7\/files\?/, () => []],
    ['GET', /\/issues\/7\/comments\?/, () => comments],
    ['POST', /\/issues\/7\/comments$/, () => ({ id: 1 })],
    ['PATCH', /\/issues\/comments\/\d+$/, () => ({})],
    ['POST', /\/issues\/7\/labels$/, () => []],
    ['DELETE', /\/issues\/7\/labels\//, () => null],
  ];
  const fetchImpl = async (url, init) => {
    const path = url.replace('https://api.github.com', '');
    calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
    const route = routes.find(([m, re]) => m === init.method && re.test(path));
    if (!route) return new Response('not found', { status: 404 });
    const data = route[2]();
    return data === null ? new Response('', { status: 404 }) : new Response(JSON.stringify(data), { status: 200 });
  };
  return { calls, fetchImpl };
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'declared-action-'));
  const eventPath = join(dir, 'event.json');
  writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 7 } }));
  for (const f of ['summary.md', 'output.txt']) writeFileSync(join(dir, f), '');
  return {
    dir,
    env: {
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: 'acme/widgets',
      GITHUB_TOKEN: 't0ken',
      GITHUB_STEP_SUMMARY: join(dir, 'summary.md'),
      GITHUB_OUTPUT: join(dir, 'output.txt'),
    },
  };
}

const quiet = () => {};

test('failing PR: comments, labels, reads policy from the base branch, writes outputs', async () => {
  const { dir, env } = setup();
  const gh = fakeGitHub({ body: 'Refactor things', config: 'preset: disclose\n' });
  const result = await run({ env, fetchImpl: gh.fetchImpl, log: quiet });

  assert.equal(result.status, 'fail');
  const post = gh.calls.find((c) => c.method === 'POST' && c.path.endsWith('/comments'));
  assert.ok(post.body.body.startsWith(MARKER));
  assert.match(post.body.body, /https:\/\/github\.com\/acme\/widgets\/blob\/main\/AI_POLICY\.md/);
  assert.deepEqual(gh.calls.find((c) => c.path.endsWith('/labels') && c.method === 'POST').body, { labels: ['needs-ai-disclosure'] });
  assert.ok(gh.calls.some((c) => c.path.includes('contents/.github/ai-policy.yml?ref=base123')));
  assert.match(readFileSync(join(dir, 'output.txt'), 'utf8'), /^status=fail$/m);
  assert.match(readFileSync(join(dir, 'summary.md'), 'utf8'), /needs an AI disclosure update/);
});

test('passing PR with no prior comment stays quiet', async () => {
  const { env } = setup();
  const gh = fakeGitHub({ body: 'AI-Disclosure: none', config: null });
  const result = await run({ env, fetchImpl: gh.fetchImpl, log: quiet });
  assert.equal(result.status, 'pass');
  assert.ok(!gh.calls.some((c) => c.method === 'POST' || c.method === 'PATCH'));
});

test('fixed PR updates the existing bot comment and removes the missing label', async () => {
  const { env } = setup();
  const gh = fakeGitHub({
    body: 'AI-Disclosure: none',
    config: 'preset: disclose',
    labels: ['needs-ai-disclosure'],
    comments: [
      { id: 55, user: { type: 'User' }, body: `${MARKER} planted by a human` },
      { id: 99, user: { type: 'Bot' }, body: `${MARKER}\nold complaint` },
    ],
  });
  await run({ env, fetchImpl: gh.fetchImpl, log: quiet });
  const patch = gh.calls.find((c) => c.method === 'PATCH');
  assert.match(patch.path, /comments\/99$/);
  assert.match(patch.body.body, /looks good/);
  assert.ok(gh.calls.some((c) => c.method === 'DELETE' && c.path.endsWith('/labels/needs-ai-disclosure')));
});

test('write failures (read-only fork token) do not hide the result', async () => {
  const { env } = setup();
  const gh = fakeGitHub({ body: 'nothing', config: null });
  const fetchImpl = async (url, init) => (init.method === 'GET' ? gh.fetchImpl(url, init) : new Response('forbidden', { status: 403 }));
  const logs = [];
  const result = await run({ env, fetchImpl, log: (l) => logs.push(l) });
  assert.equal(result.status, 'fail');
  assert.ok(logs.some((l) => l.startsWith('::warning::Could not update the pull request comment')));
});

test('invalid config surfaces a helpful error', async () => {
  const { env } = setup();
  const gh = fakeGitHub({ body: '', config: 'enforcment: warn' });
  await assert.rejects(run({ env, fetchImpl: gh.fetchImpl, log: quiet }), /did you mean "enforcement"/);
});
