import { code } from './evaluate.js';

export const MARKER = '<!-- declared:report -->';

const ATTESTATION_LINE = '- [x] I have reviewed every change in this PR and can explain it without AI help.';
const MEDIA_LINE = '- [x] None of the images, audio or video in this PR were AI-generated.';

/** A disclosure block the contributor can paste, pre-filled with what we already know. */
export function suggestedDisclosure(policy, result) {
  const allowed = policy['allowed-levels'];
  const codes = new Set(result.findings.map((f) => f.code));
  // Prefer a declared tool; otherwise name the tool whose trailer we saw in the commits.
  const knownTool = result.tools[0]?.raw ?? (result.evidence[0] ? `${result.evidence[0]}:model` : undefined);

  let level = result.level;
  if (!level || codes.has('level-not-allowed')) {
    if (allowed.length === 1) level = allowed[0];
    else if (result.evidence.length && allowed.includes('ai-assisted')) level = 'ai-assisted';
    else level = allowed.join(' | ');
  }

  const lines = [`AI-Disclosure: ${level}`];
  if (level !== 'none') {
    lines.push(`Assisted-by: ${knownTool ?? 'Tool:model'}`);
    if (policy.require.scope || result.disclosure.scope) lines.push(`AI-Scope: ${result.disclosure.scope ?? 'what the AI did, and what you did'}`);
    if (policy.require.attestation) lines.push('', ATTESTATION_LINE);
  }
  if (codes.has('media-attestation')) lines.push(...(lines.at(-1)?.startsWith('- [') ? [] : ['']), MEDIA_LINE);
  return lines.join('\n');
}

function policyLink(url) {
  return url ? `[AI contribution policy](${url})` : 'AI contribution policy';
}

/** Markdown for the sticky PR comment and the job summary. */
export function renderComment(result, policy, { policyUrl } = {}) {
  const out = [MARKER];
  const errors = result.findings.filter((f) => f.severity === 'error');
  const warnings = result.findings.filter((f) => f.severity === 'warning');

  if (result.status === 'skip') {
    out.push('#### ⏭️ AI policy check skipped', '', `Skipped because ${result.exemptReason}.`);
    return out.join('\n');
  }

  if (errors.length) {
    out.push(
      '#### 📝 This pull request needs an AI disclosure update',
      '',
      `Thanks for contributing! This project asks everyone to say whether and how AI tools were used — see the ${policyLink(policyUrl)}. ` +
        'It is not a ban on tools; it tells reviewers where to look. Nothing here tries to detect AI: the check only reads what you wrote.',
    );
  } else {
    out.push('#### ✅ AI disclosure looks good — thank you!');
  }

  const declared = [];
  if (result.level) declared.push(`level ${code(result.level)}`);
  if (result.tools.length) declared.push(`tools ${result.tools.map((t) => code(t.raw, 50)).join(', ')}`);
  if (declared.length) out.push('', `**Declared:** ${declared.join(' · ')}`);

  if (errors.length) out.push('', '**To do**', ...errors.map((f) => `- ${f.message}`));
  if (warnings.length) out.push('', '**Worth a look**', ...warnings.map((f) => `- ${f.message}`));

  if (errors.length) {
    out.push(
      '',
      '<details open><summary>Paste this into the PR description and adjust it</summary>',
      '',
      '```',
      suggestedDisclosure(policy, result),
      '```',
      '',
      '</details>',
    );
  }

  const footer = [];
  if (result.status === 'warn') footer.push('This check is advisory and does not block merging.');
  if (errors.length) footer.push('Editing the description re-runs the check.');
  if (policy.exempt.labels[0]) footer.push(`Maintainers can skip it with the ${code(policy.exempt.labels[0])} label.`);
  if (footer.length) out.push('', `<sub>${footer.join(' ')}</sub>`);
  return out.join('\n');
}

/** Plain-text report for the CLI. */
export function renderText(result, policy) {
  const icon = { pass: '✔ pass', warn: '▲ warn', fail: '✖ fail', skip: '– skip' }[result.status];
  const lines = [`AI policy: ${icon}`];
  if (result.exemptReason) lines.push(`  skipped because ${result.exemptReason.replace(/`/g, '')}`);
  if (result.level) lines.push(`  level: ${result.level}`);
  if (result.tools.length) lines.push(`  tools: ${result.tools.map((t) => t.raw).join(', ')}`);
  for (const f of result.findings) {
    lines.push(`  ${f.severity === 'error' ? '✖' : '▲'} [${f.code}] ${f.message.replace(/`/g, '')}`);
  }
  if (result.findings.some((f) => f.severity === 'error')) {
    lines.push('', '  Suggested disclosure:', ...suggestedDisclosure(policy, result).split('\n').map((l) => `    ${l}`));
  }
  return lines.join('\n');
}
