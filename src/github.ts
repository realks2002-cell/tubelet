function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function gh<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${init?.method ?? "GET"} ${url} ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface GitHubFileChange {
  path: string;
  content: string;
}

export async function commitFiles(params: {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  files: GitHubFileChange[];
  message: string;
}): Promise<{ commitSha: string }> {
  const { token, owner, repo, branch, files, message } = params;
  const h = headers(token);
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const refData = await gh<{ object: { sha: string } }>(
    `${base}/git/refs/heads/${branch}`,
    { headers: h },
  );
  const latestCommitSha = refData.object.sha;

  const commitData = await gh<{ tree: { sha: string } }>(
    `${base}/git/commits/${latestCommitSha}`,
    { headers: h },
  );
  const baseTreeSha = commitData.tree.sha;

  const blobs = await Promise.all(
    files.map(async (f) => {
      const b = await gh<{ sha: string }>(`${base}/git/blobs`, {
        method: "POST",
        headers: { ...(h), "Content-Type": "application/json" },
        body: JSON.stringify({ content: f.content, encoding: "utf-8" }),
      });
      return { path: f.path, sha: b.sha };
    }),
  );

  const tree = await gh<{ sha: string }>(`${base}/git/trees`, {
    method: "POST",
    headers: { ...(h), "Content-Type": "application/json" },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: blobs.map((b) => ({
        path: b.path,
        mode: "100644",
        type: "blob",
        sha: b.sha,
      })),
    }),
  });

  const newCommit = await gh<{ sha: string }>(`${base}/git/commits`, {
    method: "POST",
    headers: { ...(h), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [latestCommitSha],
    }),
  });

  await gh(`${base}/git/refs/heads/${branch}`, {
    method: "PATCH",
    headers: { ...(h), "Content-Type": "application/json" },
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return { commitSha: newCommit.sha };
}

export function requireGitHubEnv(): {
  token: string;
  owner: string;
  repo: string;
  branch: string;
} {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH ?? "main";
  if (!token || !owner || !repo) {
    throw new Error(
      "GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO 환경변수가 Vercel에 필요합니다.",
    );
  }
  return { token, owner, repo, branch };
}
