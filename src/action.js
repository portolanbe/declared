#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadPolicy } from './policy.js';
import { evaluate } from './evaluate.js';
import { MARKER, renderComment } from './report.js';
import { createGitHub } from './github.js';

const escapeData = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const oneLine = (s) => String(s).replace(/[\r\n]+/g, ' ');

function toCommit(item) {
  return {
    sha: item.sha,
    message: item.commit?.message ?? '',
    authorName: item.commit?.author?.name ?? '',
    authorEmail: item.commit?.author?.email ?? '',
    authorLogin: item.author?.login ?? '',
    isMerge: (item.parents?.length ?? 0) > 1,
  };
}

async function bestEffort(label, fn, log) {
  try {
    return await fn();
  } catch (err) {
    // With a read-only token (e.g. `pull_request` from a fork) writes fail; the check result still stands.
    log(`::warning::Could not ${label}: ${escapeData(err.message)}`);
    return null;
  }
}

export async function run({ env = process.env, fetchImpl = globalThis.fetch, log = console.log } = {}) {
  const input = (name) => (env[`INPUT_${name.toUpperCase()}`] ?? '').trim();
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  if (!event.pull_request) {
    log('::notice::declared only checks pull_request and pull_request_target events.');
    return { status: 'skip' };
  }

  const token = input('github-token') || env.GITHUB_TOKEN;
  if (!token) throw new Error('No GitHub token. Pass `github-token` or set GITHUB_TOKEN.');
  const [owner, repo] = String(env.GITHUB_REPOSITORY).split('/');
  const gh = createGitHub({ token, apiUrl: env.GITHUB_API_URL || 'https://api.github.com', fetchImpl });
  const number = event.pull_request.number;

  // Re-read the PR: a re-run of an old event would otherwise judge a stale description.
  const pr = (await gh.getPull(owner, repo, number)) ?? event.pull_request;

  // The policy comes from the base branch, so a PR cannot relax the rules it is checked against.
  const configPath = input('config') || '.github/ai-policy.yml';
  const configText = await gh.getFileText(owner, repo, configPath, pr.base.sha);
  if (configText == null) log(`::notice::No ${configPath} on the base branch; using the default "disclose" policy.`);
  const policy = loadPolicy(configText);

  const needFiles = policy.media['forbid-ai-generated'];
  const [commits, files] = await Promise.all([
    gh.listPullCommits(owner, repo, number),
    needFiles ? gh.listPullFiles(owner, repo, number) : Promise.resolve([]),
  ]);

  const result = evaluate({
    policy,
    body: pr.body ?? '',
    draft: Boolean(pr.draft),
    author: { login: pr.user?.login, association: pr.author_association },
    labels: pr.labels ?? [],
    commits: commits.map(toCommit),
    files,
    changedLines: (pr.additions ?? 0) + (pr.deletions ?? 0),
  });

  const server = env.GITHUB_SERVER_URL || 'https://github.com';
  const policyUrl = /^https?:\/\//.test(policy['policy-url'])
    ? policy['policy-url']
    : `${server}/${owner}/${repo}/blob/${encodeURIComponent(pr.base.ref)}/${policy['policy-url'].replace(/^\/+/, '')}`;
  const markdown = renderComment(result, policy, { policyUrl });

  const commentInput = input('comment');
  const shouldComment = commentInput ? commentInput === 'true' : policy.comment;
  if (shouldComment) {
    await bestEffort('update the pull request comment', async () => {
      const comments = await gh.listComments(owner, repo, number);
      const mine = comments.find((c) => c.user?.type === 'Bot' && c.body?.startsWith(MARKER));
      if (mine) {
        if (mine.body !== markdown) await gh.updateComment(owner, repo, mine.id, markdown);
      } else if (result.findings.length) {
        await gh.createComment(owner, repo, number, markdown);
      }
    }, log);
  }

  if (result.labels.add.length) {
    await bestEffort('add labels', () => gh.addLabels(owner, repo, number, result.labels.add), log);
  }
  for (const name of result.labels.remove) {
    await bestEffort(`remove label ${name}`, () => gh.removeLabel(owner, repo, number, name), log);
  }

  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown.replace(MARKER, '').trim()}\n`);
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, [
      `status=${result.status}`,
      `level=${result.level ?? ''}`,
      `tools=${oneLine(result.tools.map((t) => t.raw).join(', '))}`,
      '',
    ].join('\n'));
  }

  for (const f of result.findings) {
    const kind = f.severity === 'error' && result.status === 'fail' ? 'error' : 'warning';
    log(`::${kind} title=AI policy (${f.code})::${escapeData(f.message.replace(/`/g, ''))}`);
  }
  log(`AI policy: ${result.status}${result.level ? ` (level ${result.level})` : ''}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((result) => {
      if (result.status === 'fail') process.exitCode = 1;
    })
    .catch((err) => {
      console.log(`::error title=AI policy::${escapeData(err.message)}`);
      process.exitCode = 1;
    });
}
