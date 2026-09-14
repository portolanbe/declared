import { LEVELS } from './policy.js';

// Parses what contributors *declare*. Nothing here tries to guess whether
// code was written by AI — that is unreliable and unfair. We only read the
// PR description and the trailers that tools and people put in commits.

const LEVEL_SYNONYMS = new Map([
  ['none', 'none'],
  ['no', 'none'],
  ['no ai', 'none'],
  ['human', 'none'],
  ['ai-assisted', 'ai-assisted'],
  ['assisted', 'ai-assisted'],
  ['ai assisted', 'ai-assisted'],
  ['ai-generated', 'ai-generated'],
  ['generated', 'ai-generated'],
  ['ai generated', 'ai-generated'],
  ['autonomous', 'autonomous'],
]);

const DISCLOSURE_KEYS = /^(?:ai[-_ ]?disclosure|ai[-_ ]?assistance|ai[-_ ]?usage|ai[-_ ]?level|spdx-ai-disclosure)$/i;
const TOOL_KEYS = /^(?:assisted[-_ ]by|generated[-_ ]by|ai[-_ ]?tools?)$/i;
const SCOPE_KEYS = /^(?:ai[-_ ]?scope|spdx-ai-scope)$/i;
const REVIEW_KEYS = /^(?:human[-_ ]?reviewed|reviewed[-_ ]by[-_ ]human)$/i;
const MEDIA_KEYS = /^(?:ai[-_ ]?media)$/i;

/** Normalise a level string; returns a LEVELS value or null. */
export function normalizeLevel(raw) {
  const cleaned = String(raw).toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
  if (LEVEL_SYNONYMS.has(cleaned)) return LEVEL_SYNONYMS.get(cleaned);
  return LEVELS.includes(cleaned) ? cleaned : null;
}

/** Strip markdown decoration from a line: bullets, quotes, bold, code. */
function cleanLine(line) {
  return line
    .replace(/^\s*(?:>\s*)*(?:[-*+]\s+)?/, '')
    .replace(/\*\*|__/g, '')
    .replace(/`/g, '')
    .trim();
}

function splitKeyValue(line) {
  const m = /^([A-Za-z][A-Za-z0-9 _-]{0,40}?)\s*:\s*(.*)$/.exec(line);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

/** Parse `Assisted-by: AGENT:MODEL [tool1] [tool2]` (Linux kernel format). */
export function parseTool(value) {
  const v = value.trim();
  if (!v) return null;
  const idx = v.indexOf(':');
  if (idx <= 0) return { raw: v, agent: v, model: null, tools: [] };
  const [model = '', ...tools] = v.slice(idx + 1).trim().split(/\s+/);
  return {
    raw: v,
    agent: v.slice(0, idx).trim(),
    model: model || null,
    tools: tools.map((t) => t.replace(/^\[|\]$/g, '')).filter(Boolean),
  };
}

const CHECKBOX = /^\s*(?:>\s*)*[-*+]\s+\[([ xX])\]\s+(.*)$/;

function isReviewAttestation(text) {
  return /\breview/i.test(text) && /\b(understand|explain)/i.test(text);
}

function isMediaAttestation(text) {
  return /\b(image|media|audio|video|artwork|graphic)/i.test(text) && /\b(not|no|none|human|without)\b/i.test(text);
}

function isPlaceholder(value) {
  return value === '' || /^(?:<.*>|\.\.\.|tbd|todo|n\/a|-|_+)$/i.test(value);
}

/**
 * Read the disclosure block from a PR description.
 * Returns { levels, tools, scope, reviewed, mediaAttested, checkedLevels }.
 */
export function parseDisclosure(body) {
  const text = String(body ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n?/g, '\n');
  const result = {
    levels: [],
    invalidLevels: [],
    tools: [],
    scope: null,
    reviewed: false,
    mediaAttested: false,
  };

  for (const rawLine of text.split('\n')) {
    const box = CHECKBOX.exec(rawLine);
    if (box) {
      const checked = box[1].toLowerCase() === 'x';
      const label = cleanLine(box[2]);
      if (!checked) continue;
      const level = normalizeLevel(label.split(/\s[-—–:(]\s?/)[0]);
      if (level) result.levels.push(level);
      else if (isReviewAttestation(label)) result.reviewed = true;
      else if (isMediaAttestation(label)) result.mediaAttested = true;
      continue;
    }

    const kv = splitKeyValue(cleanLine(rawLine));
    if (!kv) continue;
    const [key, value] = kv;
    if (DISCLOSURE_KEYS.test(key)) {
      if (isPlaceholder(value)) continue;
      const level = normalizeLevel(value);
      if (level) result.levels.push(level);
      else result.invalidLevels.push(value);
    } else if (TOOL_KEYS.test(key)) {
      if (isPlaceholder(value) || normalizeLevel(value) === 'none') continue;
      for (const part of value.split(/\s*[;,]\s*/)) {
        const tool = parseTool(part);
        if (tool && tool.agent) result.tools.push(tool);
      }
    } else if (SCOPE_KEYS.test(key)) {
      if (!isPlaceholder(value)) result.scope = value;
    } else if (REVIEW_KEYS.test(key)) {
      if (/^(yes|true|y|x|✅|✔️?)$/i.test(value)) result.reviewed = true;
    } else if (MEDIA_KEYS.test(key)) {
      if (normalizeLevel(value) === 'none') result.mediaAttested = true;
    }
  }

  result.levels = [...new Set(result.levels)];
  return result;
}

// Trailers that AI tools add to commits on their own. These are evidence the
// contributor's own tooling left behind — a prompt to double-check the
// disclosure, not an accusation. Extend via `extra-signatures` in the config.
export const AI_SIGNATURES = [
  { name: 'Claude', pattern: /<noreply@anthropic\.com>/i },
  { name: 'GitHub Copilot coding agent', pattern: /copilot-swe-agent/i },
  { name: 'Cursor agent', pattern: /<cursoragent@cursor\.com>/i },
  { name: 'Aider', pattern: /@aider\.chat>/i },
  { name: 'Devin', pattern: /devin-ai-integration/i },
  { name: 'Google Jules', pattern: /google-labs-jules/i },
];

/** Extract trailer lines (`Key: value`) from the final paragraph of a commit message. */
export function parseTrailers(message) {
  const paragraphs = String(message ?? '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
  if (paragraphs.length < 2) return [];
  const last = paragraphs[paragraphs.length - 1].split('\n');
  const trailers = [];
  for (const line of last) {
    const m = /^([A-Za-z][A-Za-z0-9-]*):\s+(.+)$/.exec(line.trim());
    if (m) trailers.push({ key: m[1].toLowerCase(), value: m[2].trim() });
    else if (!/^\s/.test(line)) return [];
  }
  return trailers;
}

/**
 * Inspect one commit. `commit` is { sha, message, authorName?, authorEmail?, authorLogin? }.
 * Returns { sha, isMerge, assistedBy: Tool[], signatures: string[] }.
 */
export function inspectCommit(commit, extraSignatures = []) {
  const trailers = parseTrailers(commit.message);
  const assistedBy = trailers
    .filter((t) => t.key === 'assisted-by' || t.key === 'generated-by')
    .map((t) => parseTool(t.value))
    .filter(Boolean);

  const haystacks = [
    ...trailers.filter((t) => t.key === 'co-authored-by').map((t) => t.value),
    `${commit.authorName ?? ''} <${commit.authorEmail ?? ''}>`,
    commit.authorLogin ?? '',
  ];
  const signatures = [
    ...AI_SIGNATURES,
    ...extraSignatures.map((s) => ({ name: `custom signature /${s}/`, pattern: new RegExp(s, 'i') })),
  ]
    .filter((sig) => haystacks.some((h) => sig.pattern.test(h)))
    .map((sig) => sig.name);

  return {
    sha: commit.sha ?? '',
    isMerge: Boolean(commit.isMerge),
    assistedBy,
    signatures: [...new Set(signatures)],
  };
}
