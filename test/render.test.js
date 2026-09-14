import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/evaluate.js';
import { loadPolicy, PRESETS } from '../src/policy.js';
import {
  mergePrTemplate, policyHash, readDocHash, renderPolicyDoc, renderPolicyYaml, renderPrSection, TEMPLATE_START,
} from '../src/render.js';
import { suggestedDisclosure } from '../src/report.js';

const contributor = { login: 'someone', association: 'CONTRIBUTOR' };

for (const preset of Object.keys(PRESETS)) {
  test(`${preset}: generated YAML round-trips to the same policy as the preset`, () => {
    const fromYaml = loadPolicy(renderPolicyYaml(preset, { project: 'demo' }));
    const direct = loadPolicy(`preset: ${preset}\nproject: demo`);
    assert.equal(policyHash(fromYaml), policyHash(direct));
  });

  test(`${preset}: the untouched PR template fails, and the suggested fix passes`, () => {
    const policy = loadPolicy(`preset: ${preset}`);
    const template = renderPrSection(policy);
    const before = evaluate({ policy, body: template, author: contributor });
    assert.notEqual(before.status, 'pass', 'an empty template should not pass silently');

    // A contributor pastes the suggestion, choosing the first allowed level.
    const pasted = suggestedDisclosure(policy, before).replace(/^AI-Disclosure: .*\|.*$/m, `AI-Disclosure: ${policy['allowed-levels'].at(-1)}`)
      .replace('Tool:model', 'Claude Code:claude-opus-5')
      .replace('what the AI did, and what you did', 'generated test fixtures');
    const lines = pasted.split('\n');
    if (policy['allowed-levels'].at(-1) !== 'none' && policy.require.attestation && !pasted.includes('- [x]')) {
      lines.push('- [x] I have reviewed every change in this PR and can explain it without AI help.');
    }
    const after = evaluate({ policy, body: lines.join('\n'), author: contributor });
    assert.equal(after.findings.filter((f) => f.severity === 'error').length, 0, JSON.stringify(after.findings));
  });

  test(`${preset}: AI_POLICY.md embeds the policy hash`, () => {
    const policy = loadPolicy(`preset: ${preset}`);
    assert.equal(readDocHash(renderPolicyDoc(policy)), policyHash(policy));
  });
}

test('hash ignores comments and key order but not values', () => {
  const a = loadPolicy('# hi\nrequire:\n  tool: true\n  scope: false\n');
  const b = loadPolicy('require:\n  scope: false\n  tool: true\n');
  const c = loadPolicy('require:\n  scope: true\n');
  assert.equal(policyHash(a), policyHash(b));
  assert.notEqual(policyHash(a), policyHash(c));
});

test('mergePrTemplate appends once and replaces in place afterwards', () => {
  const policy = loadPolicy('preset: disclose');
  const original = '## What does this change?\n\n## Testing\n';
  const once = mergePrTemplate(original, renderPrSection(policy));
  assert.ok(once.startsWith(original.trim()));
  const strict = renderPrSection(loadPolicy('preset: strict'));
  const twice = mergePrTemplate(once, strict);
  assert.equal(twice.split(TEMPLATE_START).length, 2);
  assert.ok(twice.includes('AI-Scope:'));
  assert.ok(twice.startsWith(original.trim()));
});
