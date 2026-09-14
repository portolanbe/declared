#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadPolicy, PRESETS, PolicyError } from '../src/policy.js';
import { evaluate } from '../src/evaluate.js';
import { renderText } from '../src/report.js';
import {
  DEFAULT_USES, TEMPLATE_START, mergePrTemplate, policyHash, readDocHash,
  renderPolicyDoc, renderPolicyYaml, renderPrSection, renderWorkflow,
} from '../src/render.js';

const HELP = `declared: AI contribution policy as code

Usage:
  declared init [--preset disclose] [--project NAME] [--uses OWNER/REPO@REF] [--force]
      Write .github/ai-policy.yml, AI_POLICY.md, the PR template section and the workflow.
  declared render
      Regenerate AI_POLICY.md and the PR template section from .github/ai-policy.yml.
  declared check --body FILE|- [--range BASE..HEAD] [--first-time] [--json]
      Check a PR description (and optionally commits) locally before you open the PR.
  declared doctor
      Validate the config and confirm the generated files are up to date.
  declared presets
      List the built-in presets.

Options:
  --dir PATH      Repository root (default: current directory)
  --config PATH   Config path relative to the root (default: .github/ai-policy.yml)
`;

const TEMPLATE_CANDIDATES = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'pull_request_template.md',
  'PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md',
  'docs/PULL_REQUEST_TEMPLATE.md',
];

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function findTemplate(root) {
  return TEMPLATE_CANDIDATES.map((p) => join(root, p)).find((p) => existsSync(p)) ?? join(root, TEMPLATE_CANDIDATES[0]);
}

function docPath(root, policy) {
  const url = policy['policy-url'];
  return /^https?:\/\//.test(url) ? join(root, 'AI_POLICY.md') : join(root, url);
}

function loadConfig(root, configPath) {
  const full = join(root, configPath);
  const text = read(full);
  if (text == null) throw new Error(`No ${configPath} found. Run \`declared init\` first.`);
  return loadPolicy(text);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function commitsInRange(root, range) {
  const raw = git(['log', '--format=%H%x1f%an%x1f%ae%x1f%P%x1f%B%x1e', range], root);
  return raw.split('\x1e').map((r) => r.trim()).filter(Boolean).map((record) => {
    const [sha, authorName, authorEmail, parents, message] = record.split('\x1f');
    return { sha, authorName, authorEmail, message, isMerge: parents.trim().split(/\s+/).length > 1 };
  });
}

function filesInRange(root, range) {
  return git(['diff', '--numstat', '--diff-filter=ACMR', range.replace('..', '...')], root)
    .split('\n').filter(Boolean).map((line) => {
      const [add, del, ...name] = line.split('\t');
      return { filename: name.join('\t'), status: 'modified', additions: Number(add) || 0, deletions: Number(del) || 0 };
    });
}

const commands = {
  presets() {
    for (const [name, preset] of Object.entries(PRESETS)) console.log(`${name.padEnd(11)} ${preset.summary}`);
    return 0;
  },

  init(opts, root) {
    const preset = opts.preset ?? 'disclose';
    if (!PRESETS[preset]) throw new Error(`Unknown preset "${preset}". Run \`declared presets\` to see the options.`);
    const project = opts.project ?? basename(resolve(root));
    const yaml = renderPolicyYaml(preset, { project });
    const policy = loadPolicy(yaml);
    const files = [
      [join(root, opts.config), yaml],
      [docPath(root, policy), renderPolicyDoc(policy)],
      [join(root, '.github/workflows/ai-policy.yml'), renderWorkflow({ uses: opts.uses ?? DEFAULT_USES })],
    ];
    for (const [path, content] of files) {
      if (existsSync(path) && !opts.force) {
        console.log(`  skip   ${path.slice(root.length + 1)} (exists; --force to overwrite)`);
      } else {
        write(path, content);
        console.log(`  write  ${path.slice(root.length + 1)}`);
      }
    }
    const template = findTemplate(root);
    write(template, mergePrTemplate(read(template), renderPrSection(policy)));
    console.log(`  update ${template.slice(root.length + 1)} (AI disclosure section)`);
    if (!opts.uses) console.log(`\nReplace ${DEFAULT_USES} in .github/workflows/ai-policy.yml with the published action reference.`);
    return 0;
  },

  render(opts, root) {
    const policy = loadConfig(root, opts.config);
    const doc = docPath(root, policy);
    write(doc, renderPolicyDoc(policy));
    console.log(`  write  ${doc.slice(root.length + 1)}`);
    const template = findTemplate(root);
    write(template, mergePrTemplate(read(template), renderPrSection(policy)));
    console.log(`  update ${template.slice(root.length + 1)}`);
    return 0;
  },

  doctor(opts, root) {
    const problems = [];
    let policy;
    try {
      policy = loadConfig(root, opts.config);
      console.log(`  ok     ${opts.config} is valid`);
    } catch (err) {
      console.log(`  ✖      ${err.message}`);
      return 1;
    }
    const doc = read(docPath(root, policy));
    if (doc == null) problems.push(`${policy['policy-url']} is missing. Run \`declared render\`.`);
    else if (readDocHash(doc) !== policyHash(policy)) problems.push(`${policy['policy-url']} is out of date with the config. Run \`declared render\`.`);
    else console.log(`  ok     ${policy['policy-url']} matches the config`);

    const template = read(findTemplate(root));
    if (!template?.includes(TEMPLATE_START)) problems.push('The PR template has no AI disclosure section. Run `declared render`.');
    else if (!template.includes(renderPrSection(policy))) problems.push('The PR template section is out of date. Run `declared render`.');
    else console.log('  ok     PR template has the current AI disclosure section');

    const workflow = read(join(root, '.github/workflows/ai-policy.yml'));
    if (workflow == null) problems.push('No .github/workflows/ai-policy.yml; the check will not run on pull requests.');
    else if (workflow.includes(DEFAULT_USES)) problems.push(`The workflow still uses the placeholder ${DEFAULT_USES}.`);
    else console.log('  ok     workflow present');

    for (const p of problems) console.log(`  ✖      ${p}`);
    return problems.length ? 1 : 0;
  },

  check(opts, root) {
    if (!opts.body) throw new Error('Pass the PR description with --body FILE, or --body - to read stdin.');
    const body = opts.body === '-' ? readFileSync(0, 'utf8') : readFileSync(opts.body, 'utf8');
    const configText = read(join(root, opts.config));
    const policy = loadPolicy(configText);
    const commits = opts.range ? commitsInRange(root, opts.range) : [];
    const files = opts.range ? filesInRange(root, opts.range) : [];
    const result = evaluate({
      policy,
      body,
      commits,
      files,
      author: { login: '', association: opts['first-time'] ? 'FIRST_TIME_CONTRIBUTOR' : 'CONTRIBUTOR' },
    });
    if (opts.json) console.log(JSON.stringify(result, null, 2));
    else console.log(renderText(result, policy));
    return result.status === 'fail' ? 1 : 0;
  },
};

export function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: 'string', default: '.' },
      config: { type: 'string', default: '.github/ai-policy.yml' },
      preset: { type: 'string' },
      project: { type: 'string' },
      uses: { type: 'string' },
      force: { type: 'boolean', default: false },
      body: { type: 'string' },
      range: { type: 'string' },
      'first-time': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const name = positionals[0];
  if (values.help || !name || name === 'help') {
    console.log(HELP);
    return name || values.help ? 0 : 1;
  }
  const command = commands[name];
  if (!command) {
    console.error(`Unknown command "${name}".\n\n${HELP}`);
    return 1;
  }
  return command(values, resolve(values.dir));
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(err instanceof PolicyError ? err.message : `declared: ${err.message}`);
  process.exitCode = 1;
}
