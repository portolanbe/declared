// Minimal GitHub REST client on top of fetch — no Octokit, no install step.

export function createGitHub({ token, apiUrl = 'https://api.github.com', fetchImpl = globalThis.fetch }) {
  const base = apiUrl.replace(/\/+$/, '');

  async function request(method, path, body) {
    const res = await fetchImpl(base + path, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'declared-action',
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && (method === 'GET' || method === 'DELETE')) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`GitHub API ${method} ${path} failed with ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async function paginate(path, limit = 3000) {
    const out = [];
    for (let page = 1; out.length < limit; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const items = await request('GET', `${path}${sep}per_page=100&page=${page}`);
      if (!Array.isArray(items) || items.length === 0) break;
      out.push(...items);
      if (items.length < 100) break;
    }
    return out;
  }

  const repoPath = (owner, repo) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  return {
    request,
    paginate,
    async getFileText(owner, repo, path, ref) {
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      const data = await request('GET', `${repoPath(owner, repo)}/contents/${encoded}?ref=${encodeURIComponent(ref)}`);
      if (!data) return null;
      if (Array.isArray(data) || data.type !== 'file') throw new Error(`${path} is not a file`);
      return Buffer.from(data.content, 'base64').toString('utf8');
    },
    getPull: (owner, repo, n) => request('GET', `${repoPath(owner, repo)}/pulls/${n}`),
    listPullCommits: (owner, repo, n) => paginate(`${repoPath(owner, repo)}/pulls/${n}/commits`),
    listPullFiles: (owner, repo, n) => paginate(`${repoPath(owner, repo)}/pulls/${n}/files`),
    listComments: (owner, repo, n) => paginate(`${repoPath(owner, repo)}/issues/${n}/comments`),
    createComment: (owner, repo, n, body) => request('POST', `${repoPath(owner, repo)}/issues/${n}/comments`, { body }),
    updateComment: (owner, repo, id, body) => request('PATCH', `${repoPath(owner, repo)}/issues/comments/${id}`, { body }),
    addLabels: (owner, repo, n, labels) => request('POST', `${repoPath(owner, repo)}/issues/${n}/labels`, { labels }),
    removeLabel: (owner, repo, n, name) => request('DELETE', `${repoPath(owner, repo)}/issues/${n}/labels/${encodeURIComponent(name)}`),
  };
}
