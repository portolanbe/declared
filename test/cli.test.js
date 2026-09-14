import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/declared.js', import.meta.url));
const cli = (args, opts = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', ...opts });

test('init → doctor → edit config → doctor flags drift → render fixes it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'declared-cli-'));
  writeFileSync(join(dir, 'placeholder'), '');
  const init = cli(['init', '--dir', dir, '--preset', 'strict', '--project', 'widgets', '--uses', 'acme/declared@v1']);
  assert.equal(init.status, 0, init.stderr);
  assert.match(readFileSync(join(dir, 'AI_POLICY.md'), 'utf8'), /# AI contribution policy for widgets/);
  assert.match(readFileSync(join(dir, '.github/pull_request_template.md'), 'utf8'), /AI-Scope:/);

  assert.equal(cli(['doctor', '--dir', dir]).status, 0);

  const configPath = join(dir, '.github/ai-policy.yml');
  writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('scope: true', 'scope: false'));
  const drift = cli(['doctor', '--dir', dir]);
  assert.equal(drift.status, 1);
  assert.match(drift.stdout, /out of date/);

  assert.equal(cli(['render', '--dir', dir]).status, 0);
  assert.equal(cli(['doctor', '--dir', dir]).status, 0);
});

test('check reads a description from stdin and exits non-zero on failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'declared-cli-'));
  const bad = cli(['check', '--dir', dir, '--body', '-'], { input: 'AI-Disclosure: ai-assisted' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /missing-tool/);
  assert.match(bad.stdout, /Suggested disclosure/);

  const good = cli(['check', '--dir', dir, '--body', '-'], {
    input: 'AI-Disclosure: ai-assisted\nAssisted-by: Claude Code:claude-opus-5\n- [x] I have reviewed every change and can explain it',
  });
  assert.equal(good.status, 0, good.stdout);
});

test('bad config and unknown commands fail cleanly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'declared-cli-'));
  writeFileSync(join(dir, 'body.md'), 'AI-Disclosure: none');
  const cfg = join(dir, 'policy.yml');
  writeFileSync(cfg, 'preset: nope');
  const r = cli(['check', '--dir', dir, '--config', 'policy.yml', '--body', join(dir, 'body.md')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown preset "nope"/);
  assert.equal(cli(['frobnicate']).status, 1);
});
