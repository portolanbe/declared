import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectCommit, parseDisclosure, parseTool, parseTrailers } from '../src/parse.js';
import { loadPolicy, PolicyError } from '../src/policy.js';

test('parseTool reads the Linux kernel Assisted-by format', () => {
  assert.deepEqual(parseTool('Claude:claude-3-opus coccinelle sparse'), {
    raw: 'Claude:claude-3-opus coccinelle sparse', agent: 'Claude', model: 'claude-3-opus', tools: ['coccinelle', 'sparse'],
  });
  assert.deepEqual(parseTool('Claude Code:claude-opus-5 [clang-tidy]').tools, ['clang-tidy']);
  assert.equal(parseTool('Cursor').model, null);
});

test('parseDisclosure tolerates markdown decoration and template comments', () => {
  const d = parseDisclosure(`
## AI disclosure
<!-- Choose one: none | ai-assisted -->
- **AI-Disclosure:** \`AI-Assisted\`
> Assisted-by: Claude Code:claude-opus-5, Copilot:gpt-5
AI-Scope: wrote tests
- [x] I have reviewed every change in this PR and can explain it without AI help.
- [X] None of the images, audio or video in this PR were AI-generated.
`);
  assert.deepEqual(d.levels, ['ai-assisted']);
  assert.deepEqual(d.tools.map((t) => t.agent), ['Claude Code', 'Copilot']);
  assert.equal(d.scope, 'wrote tests');
  assert.equal(d.reviewed, true);
  assert.equal(d.mediaAttested, true);
});

test('empty template placeholders count as not filled in', () => {
  const d = parseDisclosure('AI-Disclosure: \nAssisted-by: \nAI-Scope: <describe>\n- [ ] I have reviewed every change and can explain it');
  assert.deepEqual(d.levels, []);
  assert.deepEqual(d.tools, []);
  assert.equal(d.scope, null);
  assert.equal(d.reviewed, false);
});

test('checkbox levels and invalid levels', () => {
  assert.deepEqual(parseDisclosure('- [x] none — no AI tools\n- [ ] ai-assisted').levels, ['none']);
  assert.deepEqual(parseDisclosure('AI assistance: sort of').invalidLevels, ['sort of']);
  assert.deepEqual(parseDisclosure('AI-Disclosure: none\n- [x] ai-generated').levels, ['none', 'ai-generated']);
});

test('parseTrailers only reads the final trailer paragraph', () => {
  assert.deepEqual(parseTrailers('Fix: thing\n\nBody text: not a trailer\n\nAssisted-by: Claude:opus\nSigned-off-by: A <a@b>'), [
    { key: 'assisted-by', value: 'Claude:opus' },
    { key: 'signed-off-by', value: 'A <a@b>' },
  ]);
  assert.deepEqual(parseTrailers('Subject only'), []);
  assert.deepEqual(parseTrailers('Subject\n\nJust a body line.'), []);
});

test('inspectCommit finds tool trailers and known AI co-author signatures', () => {
  const c = inspectCommit({
    sha: 'abc1234def',
    message: 'Add parser\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  });
  assert.deepEqual(c.signatures, ['Claude']);
  const custom = inspectCommit({ sha: '1', message: 'x\n\nCo-authored-by: Bot <bot@robots.example>' }, ['robots\\.example']);
  assert.equal(custom.signatures.length, 1);
  assert.deepEqual(inspectCommit({ sha: '2', message: 'plain human commit' }).signatures, []);
});

test('policy validation explains mistakes', () => {
  assert.throws(() => loadPolicy('requre:\n  tool: true'), (err) => err instanceof PolicyError && /did you mean "require"/.test(err.message));
  assert.throws(() => loadPolicy('preset: strcit'), /did you mean "strict"/);
  assert.throws(() => loadPolicy('allowed-levels: [none, ai-asisted]'), /unknown level "ai-asisted"/);
  assert.throws(() => loadPolicy('enforcement: block'), /must be one of: fail, warn/);
  assert.throws(() => loadPolicy('require:\n  tool: "yes"'), /must be true or false/);
  assert.throws(() => loadPolicy('extra-signatures: ["("]'), /not a valid regular expression/);
});

test('presets resolve, and explicit values override them', () => {
  assert.deepEqual(loadPolicy('preset: human-only')['allowed-levels'], ['none']);
  assert.equal(loadPolicy('preset: strict\nrequire:\n  scope: false').require.scope, false);
  assert.equal(loadPolicy('preset: strict').require['commit-trailers'], true);
  assert.equal(loadPolicy(null).preset, 'disclose');
});
