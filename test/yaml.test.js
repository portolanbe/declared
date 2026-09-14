import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, YamlError } from '../src/yaml.js';

test('parses nested maps, lists, scalars and comments', () => {
  const doc = parseYaml(`
# top comment
version: 1
project: "my # project"   # trailing comment
ratio: 0.5
enabled: true
missing: ~
allowed-levels: [none, ai-assisted, "ai-generated"]
exempt:
  authors:
    - "dependabot[bot]"
    - renovate[bot]
  labels: []
require:
  tool: false
`);
  assert.deepEqual(doc, {
    version: 1,
    project: 'my # project',
    ratio: 0.5,
    enabled: true,
    missing: null,
    'allowed-levels': ['none', 'ai-assisted', 'ai-generated'],
    exempt: { authors: ['dependabot[bot]', 'renovate[bot]'], labels: [] },
    require: { tool: false },
  });
});

test('lists may sit at the same indentation as their key', () => {
  assert.deepEqual(parseYaml('a:\n- x\n- y\nb: 2\n'), { a: ['x', 'y'], b: 2 });
});

test('block scalars keep or fold lines', () => {
  const doc = parseYaml('notes: |\n  line one\n  # not a comment\n\n  line three\nfolded: >-\n  a\n  b\n');
  assert.equal(doc.notes, 'line one\n# not a comment\n\nline three\n');
  assert.equal(doc.folded, 'a b');
});

test('values containing colons without a following space stay strings', () => {
  assert.deepEqual(parseYaml('tool: Claude Code:claude-opus-5\nurl: https://example.com/a\n'), {
    tool: 'Claude Code:claude-opus-5',
    url: 'https://example.com/a',
  });
});

test('single quotes and apostrophes', () => {
  assert.deepEqual(parseYaml("a: 'it''s'\nb: don't # c\n"), { a: "it's", b: "don't" });
});

test('rejects what it does not support, with line numbers', () => {
  assert.throws(() => parseYaml('a:\n\tb: 1'), /line 2: tabs/);
  assert.throws(() => parseYaml('a: 1\na: 2'), /line 2: duplicate key "a"/);
  assert.throws(() => parseYaml('list:\n  - key: value'), /mappings inside lists/);
  assert.throws(() => parseYaml('a: &anchor 1'), /anchors/);
  assert.throws(() => parseYaml('a: {b: 1}'), /inline \{mappings\}/);
  assert.throws(() => parseYaml('a: 1\n  b: 2'), YamlError);
  assert.throws(() => parseYaml('__proto__: 1'), /not allowed/);
});

test('empty document is an empty map', () => {
  assert.deepEqual(parseYaml('# nothing\n'), {});
});
