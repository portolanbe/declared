import { parseYaml } from './yaml.js';

// Disclosure vocabulary, aligned with the W3C AI Content Disclosure levels
// used by the ai-disclosure convention (SPDX-AI-Disclosure).
export const LEVELS = ['none', 'ai-assisted', 'ai-generated', 'autonomous'];

export const LEVEL_INFO = {
  none: 'No AI tools were used.',
  'ai-assisted': 'Written by a person; AI helped edit, refine, or fill in boilerplate.',
  'ai-generated': 'AI wrote substantial parts; a person prompted it, reviewed the result, and understands it.',
  autonomous: 'AI produced it without meaningful human review.',
};

export const MEDIA_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tif', 'tiff', 'psd',
  'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'mp4', 'mov', 'webm', 'mkv', 'avi',
];

export const DEFAULTS = {
  version: 1,
  preset: 'disclose',
  project: '',
  'policy-url': 'AI_POLICY.md',
  'allowed-levels': ['none', 'ai-assisted', 'ai-generated'],
  require: {
    disclosure: true,
    tool: true,
    scope: false,
    attestation: true,
    'commit-trailers': false,
  },
  consistency: true,
  media: {
    'forbid-ai-generated': false,
    extensions: MEDIA_EXTENSIONS,
  },
  'first-time-contributors': {
    'max-changed-lines': 0,
  },
  exempt: {
    authors: ['dependabot[bot]', 'renovate[bot]', 'github-actions[bot]'],
    associations: ['OWNER', 'MEMBER'],
    labels: ['skip-ai-policy'],
  },
  drafts: 'warn',
  enforcement: 'fail',
  comment: true,
  labels: {
    none: '',
    'ai-assisted': 'ai-assisted',
    'ai-generated': 'ai-generated',
    autonomous: 'ai-autonomous',
    missing: 'needs-ai-disclosure',
  },
  'extra-signatures': [],
  notes: '',
};

export const PRESETS = {
  open: {
    summary: 'AI welcome. Disclosure is requested and labelled, but never blocks a PR.',
    config: {
      'allowed-levels': ['none', 'ai-assisted', 'ai-generated', 'autonomous'],
      require: { disclosure: true, tool: false, scope: false, attestation: false, 'commit-trailers': false },
      enforcement: 'warn',
    },
  },
  disclose: {
    summary: 'AI welcome with disclosure: say which tool, and confirm a human reviewed it.',
    config: {},
  },
  strict: {
    summary: 'Disclosure with tool, scope and commit trailers; no AI media; small first PRs.',
    config: {
      'allowed-levels': ['none', 'ai-assisted', 'ai-generated'],
      require: { disclosure: true, tool: true, scope: true, attestation: true, 'commit-trailers': true },
      media: { 'forbid-ai-generated': true },
      'first-time-contributors': { 'max-changed-lines': 400 },
      drafts: 'enforce',
    },
  },
  'human-only': {
    summary: 'No AI-generated contributions. Contributors confirm no AI tools were used.',
    config: {
      'allowed-levels': ['none'],
      require: { disclosure: true, tool: false, scope: false, attestation: false, 'commit-trailers': false },
      media: { 'forbid-ai-generated': true },
    },
  },
};

const ENUMS = {
  drafts: ['warn', 'enforce', 'skip'],
  enforcement: ['fail', 'warn'],
};

export class PolicyError extends Error {
  constructor(problems) {
    super(`Invalid AI policy config:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'PolicyError';
    this.problems = problems;
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

function suggest(key, candidates) {
  const best = candidates
    .map((c) => [c, editDistance(key, c)])
    .sort((x, y) => x[1] - y[1])[0];
  return best && best[1] <= Math.max(2, Math.floor(key.length / 3)) ? ` (did you mean "${best[0]}"?)` : '';
}

function checkShape(value, template, path, problems) {
  for (const [k, v] of Object.entries(value)) {
    const where = path ? `${path}.${k}` : k;
    if (!Object.hasOwn(template, k)) {
      problems.push(`unknown key "${where}"${suggest(k, Object.keys(template))}`);
      continue;
    }
    const expected = template[k];
    if (isPlainObject(expected)) {
      if (!isPlainObject(v)) problems.push(`"${where}" must be a mapping of keys`);
      else checkShape(v, expected, where, problems);
    } else if (Array.isArray(expected)) {
      if (!Array.isArray(v)) problems.push(`"${where}" must be a list, e.g. [a, b]`);
      else if (v.some((item) => typeof item !== 'string')) problems.push(`"${where}" must contain only text values`);
    } else if (typeof expected !== typeof v) {
      problems.push(`"${where}" must be ${typeof expected === 'boolean' ? 'true or false' : `a ${typeof expected}`}`);
    }
  }
}

/** Build a complete policy from a user config object (already parsed). */
export function resolvePolicy(userConfig = {}) {
  const problems = [];
  if (!isPlainObject(userConfig)) throw new PolicyError(['the config file must be a mapping of keys']);
  checkShape(userConfig, DEFAULTS, '', problems);

  const presetName = userConfig.preset ?? DEFAULTS.preset;
  const preset = PRESETS[presetName];
  if (!preset) {
    problems.push(`unknown preset "${presetName}"${suggest(String(presetName), Object.keys(PRESETS))}; choose one of: ${Object.keys(PRESETS).join(', ')}`);
  }
  if (problems.length) throw new PolicyError(problems);

  const policy = deepMerge(deepMerge(DEFAULTS, preset.config), userConfig);

  if (policy.version !== 1) problems.push(`unsupported version ${policy.version}; this tool understands version 1`);
  for (const [key, allowed] of Object.entries(ENUMS)) {
    if (!allowed.includes(policy[key])) problems.push(`"${key}" must be one of: ${allowed.join(', ')}`);
  }
  if (!policy['allowed-levels'].length) problems.push('"allowed-levels" must list at least one level');
  for (const level of policy['allowed-levels']) {
    if (!LEVELS.includes(level)) {
      problems.push(`unknown level "${level}" in allowed-levels${suggest(level, LEVELS)}; levels are: ${LEVELS.join(', ')}`);
    }
  }
  const max = policy['first-time-contributors']['max-changed-lines'];
  if (!Number.isInteger(max) || max < 0) problems.push('"first-time-contributors.max-changed-lines" must be a whole number (0 = no limit)');
  for (const sig of policy['extra-signatures']) {
    try {
      new RegExp(sig, 'i');
    } catch {
      problems.push(`"extra-signatures" entry is not a valid regular expression: ${sig}`);
    }
  }
  if (problems.length) throw new PolicyError(problems);
  return policy;
}

/** Parse YAML text (or null/empty for "no config file") into a policy. */
export function loadPolicy(text) {
  if (text == null || String(text).trim() === '') return resolvePolicy({});
  return resolvePolicy(parseYaml(text));
}
