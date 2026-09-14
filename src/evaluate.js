import { LEVELS } from './policy.js';
import { parseDisclosure, inspectCommit } from './parse.js';

const FIRST_TIMERS = new Set(['FIRST_TIME_CONTRIBUTOR', 'FIRST_TIMER', 'NONE']);
const DISCLOSURE_CODES = new Set(['missing-disclosure', 'unknown-level', 'ambiguous-level']);

/** Render untrusted text as an inline code span: no backticks, newlines, or runaway length. */
export function code(value, max = 80) {
  const s = String(value).replace(/[`\r\n]+/g, ' ').trim();
  return `\`${s.length > max ? `${s.slice(0, max - 1)}…` : s}\``;
}

function globToRegExp(glob) {
  const escaped = glob.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('.*')}$`, 'i');
}

function exemption(policy, author, labels, draft) {
  const login = author.login ?? '';
  if (login && policy.exempt.authors.some((a) => globToRegExp(a).test(login))) return `${code(login)} is exempt`;
  if (author.association && policy.exempt.associations.includes(author.association)) {
    return `the author is a repository ${author.association.toLowerCase()}`;
  }
  const label = policy.exempt.labels.find((l) => labels.includes(l));
  if (label) return `the ${code(label)} label is set`;
  if (draft && policy.drafts === 'skip') return 'the pull request is a draft';
  return null;
}

function shortShas(commits, max = 8) {
  const shas = commits.map((c) => code(c.sha.slice(0, 7)));
  return shas.length > max ? `${shas.slice(0, max).join(', ')} and ${shas.length - max} more` : shas.join(', ');
}

function isMedia(file, extensions) {
  if (file.status === 'removed') return false;
  const ext = String(file.filename).toLowerCase().split('.').pop();
  return extensions.includes(ext);
}

/**
 * Check one pull request against a resolved policy.
 *
 * input: {
 *   policy, body, draft,
 *   author: { login, association },
 *   labels: string[] | {name}[],
 *   commits: { sha, message, authorName, authorEmail, authorLogin, isMerge }[],
 *   files: { filename, status, additions, deletions }[],
 *   changedLines?: number,
 * }
 */
export function evaluate(input) {
  const { policy } = input;
  const author = input.author ?? {};
  const labels = (input.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
  const files = input.files ?? [];
  const disclosure = parseDisclosure(input.body);
  const commits = (input.commits ?? []).map((c) => inspectCommit(c, policy['extra-signatures']));
  const allowed = policy['allowed-levels'];

  const findings = [];
  const add = (severity, id, message) => findings.push({ severity, code: id, message });

  const level = disclosure.levels.length === 1 ? disclosure.levels[0] : null;
  const tools = disclosure.tools;
  const commitTools = commits.flatMap((c) => c.assistedBy);
  const signedCommits = commits.filter((c) => c.signatures.length || c.assistedBy.length);
  const evidence = [...new Set([
    ...commits.flatMap((c) => c.signatures),
    ...commitTools.map((t) => t.raw),
  ])];

  const exemptReason = exemption(policy, author, labels, input.draft);

  if (!exemptReason) {
    if (disclosure.levels.length > 1) {
      add('error', 'ambiguous-level', `The description declares more than one level (${disclosure.levels.map((l) => code(l)).join(', ')}). Please keep exactly one.`);
    } else if (!level && disclosure.invalidLevels.length) {
      add('error', 'unknown-level', `${code(disclosure.invalidLevels[0])} is not a disclosure level. Use one of: ${allowed.map((l) => code(l)).join(', ')}.`);
    } else if (!level && policy.require.disclosure) {
      add('error', 'missing-disclosure', 'The description does not say whether AI tools were used. Add an `AI-Disclosure:` line.');
    }

    if (level && !allowed.includes(level)) {
      add('error', 'level-not-allowed', allowed.length === 1 && allowed[0] === 'none'
        ? 'This project does not accept contributions made with AI tools.'
        : `This project does not accept ${code(level)} contributions. Accepted levels: ${allowed.map((l) => code(l)).join(', ')}.`);
    }

    const assisted = level !== null && level !== 'none';
    if (assisted) {
      if (policy.require.tool && tools.length === 0 && commitTools.length === 0) {
        add('error', 'missing-tool', 'Please name the AI tool with an `Assisted-by:` line, e.g. `Assisted-by: Claude Code:claude-opus-5`.');
      }
      for (const t of tools.filter((x) => !x.model)) {
        add('warning', 'missing-model', `${code(`Assisted-by: ${t.agent}`)} has no model. Adding one (\`Tool:model\`) helps reviewers.`);
      }
      if (policy.require.scope && !disclosure.scope) {
        add('error', 'missing-scope', 'Please describe what the AI did with an `AI-Scope:` line, e.g. `AI-Scope: wrote the tests; I wrote the parser`.');
      }
      if (policy.require.attestation && !disclosure.reviewed) {
        add('error', 'missing-attestation', 'Please tick the box confirming you reviewed every change and can explain it without AI help.');
      }
      if (policy.require['commit-trailers']) {
        const unmarked = commits.filter((c) => !c.isMerge && !c.assistedBy.length && !c.signatures.length);
        if (unmarked.length) {
          add('error', 'missing-commit-trailers', `${unmarked.length} commit(s) have no \`Assisted-by:\` trailer: ${shortShas(unmarked)}. Amend them with \`git commit --amend --trailer "Assisted-by: Tool:model"\` or \`git rebase -i\`.`);
        }
      }
      const cap = policy['first-time-contributors']['max-changed-lines'];
      if (cap > 0 && FIRST_TIMERS.has(author.association)) {
        const changed = input.changedLines ?? files.reduce((n, f) => n + (f.additions ?? 0) + (f.deletions ?? 0), 0);
        if (changed > cap) {
          add('error', 'first-pr-too-large', `Welcome! First AI-assisted contributions here are limited to ${cap} changed lines, and this one changes ${changed}. Please split it up, or open an issue first to talk it through with a maintainer.`);
        }
      }
    }

    if (policy.media['forbid-ai-generated'] && level !== 'none' && !disclosure.mediaAttested) {
      const media = files.filter((f) => isMedia(f, policy.media.extensions));
      if (media.length && (assisted || !level)) {
        const names = media.slice(0, 5).map((f) => code(f.filename, 60)).join(', ');
        add('error', 'media-attestation', `This project does not accept AI-generated images, audio or video. This PR adds or changes ${media.length} media file(s) (${names}${media.length > 5 ? ', …' : ''}). Please tick the box confirming they were not AI-generated.`);
      }
    }

    if (policy.consistency) {
      if (level === 'none' && tools.length) {
        add('error', 'inconsistent-disclosure', `The description says ${code('none')} but also lists ${code(`Assisted-by: ${tools[0].raw}`)}. Please make them agree.`);
      }
      if (level === 'none' && signedCommits.length) {
        add('warning', 'commit-trailer-mismatch', `The description says ${code('none')}, but ${signedCommits.length} commit(s) carry AI tool trailers (${evidence.map((e) => code(e, 50)).join(', ')} in ${shortShas(signedCommits)}). If AI was involved, please update the disclosure.`);
      }
    }
  }

  const errors = findings.filter((f) => f.severity === 'error');
  let status;
  if (exemptReason) status = 'skip';
  else if (!errors.length) status = 'pass';
  else if (policy.enforcement === 'warn' || (input.draft && policy.drafts === 'warn')) status = 'warn';
  else status = 'fail';

  const wanted = new Set();
  if (level && policy.labels[level]) wanted.add(policy.labels[level]);
  if (errors.some((f) => DISCLOSURE_CODES.has(f.code)) && policy.labels.missing) wanted.add(policy.labels.missing);
  const managed = [...LEVELS.map((l) => policy.labels[l]), policy.labels.missing].filter(Boolean);

  return {
    status,
    exemptReason,
    level,
    tools: [...tools, ...commitTools.filter((t) => !tools.some((x) => x.raw === t.raw))],
    evidence,
    disclosure,
    findings,
    labels: {
      add: [...wanted].filter((l) => !labels.includes(l)),
      remove: managed.filter((l) => !wanted.has(l) && labels.includes(l)),
    },
  };
}
