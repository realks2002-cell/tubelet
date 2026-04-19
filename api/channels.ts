import type { VercelRequest, VercelResponse } from "@vercel/node";

export const maxDuration = 30;

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;

interface ChannelsFile {
  channels: Array<{ id: string; name: string; enabled?: boolean }>;
}

interface GitHubFileResponse {
  sha: string;
  content: string;
  encoding: "base64" | string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  try {
    if (req.method === "GET") {
      const file = await fetchChannelsFile();
      res.status(200).json({
        channels: file.content.channels,
      });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "GET/POST만 허용됩니다." });
      return;
    }

    const ghToken = requireEnv("GITHUB_TOKEN");
    const owner = requireEnv("GITHUB_OWNER");
    const repo = requireEnv("GITHUB_REPO");
    const branch = process.env.GITHUB_BRANCH ?? "main";

    const body =
      typeof req.body === "object" && req.body !== null
        ? (req.body as { input?: string; name?: string })
        : {};
    const rawInput = body.input?.trim();
    const customName = body.name?.trim();
    if (!rawInput) {
      res.status(400).json({ error: "input 필드가 필요합니다." });
      return;
    }

    const channelId = await resolveChannelId(rawInput);
    if (!channelId) {
      res.status(400).json({
        error:
          "채널 ID를 인식하지 못했어요. UCxxxxxxxxx 형식 ID 또는 /channel/UCxxx URL을 사용하세요.",
      });
      return;
    }

    const channelInfo = await fetchYouTubeChannel(channelId);
    if (!channelInfo) {
      res
        .status(404)
        .json({ error: `YouTube에서 채널을 찾을 수 없습니다: ${channelId}` });
      return;
    }

    const existing = await fetchChannelsFile(owner, repo, branch, ghToken);
    if (existing.content.channels.some((c) => c.id === channelId)) {
      res.status(409).json({
        error: `이미 등록된 채널입니다: ${channelInfo.title}`,
      });
      return;
    }

    const displayName = customName || channelInfo.title;
    const updated: ChannelsFile = {
      channels: [
        ...existing.content.channels,
        { id: channelId, name: displayName, enabled: true },
      ],
    };

    await commitChannelsFile(
      owner,
      repo,
      branch,
      ghToken,
      existing.sha,
      updated,
      `feat: 채널 추가 ${displayName}`,
    );

    res.status(200).json({
      ok: true,
      message: `${displayName} 추가됨. 다음 스케줄부터 반영돼요.`,
      channel: { id: channelId, name: displayName },
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`channels 실패: ${msg}`);
    res.status(500).json({ error: msg });
  }
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(
      `${key} 환경변수가 Vercel에 없습니다. Dashboard → Settings → Environment Variables 에서 등록해주세요.`,
    );
  }
  return v;
}

async function resolveChannelId(input: string): Promise<string | null> {
  if (CHANNEL_ID_RE.test(input)) return input;

  try {
    const u = new URL(input);
    if (u.hostname.includes("youtube.com")) {
      const match = u.pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (match) return match[1]!;

      const handleMatch = u.pathname.match(/^\/@([\w.\-]+)/);
      if (handleMatch) {
        return await resolveHandle(handleMatch[1]!);
      }
    }
  } catch {
    // not a URL, try as handle
    if (input.startsWith("@")) {
      return await resolveHandle(input.slice(1));
    }
  }
  return null;
}

async function resolveHandle(handle: string): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@${encodeURIComponent(handle)}&key=${key}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: Array<{ id?: string }>;
  };
  return data.items?.[0]?.id ?? null;
}

async function fetchYouTubeChannel(
  channelId: string,
): Promise<{ title: string } | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY 환경변수가 없습니다.");
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${key}`,
  );
  if (!res.ok) {
    throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    items?: Array<{ snippet?: { title?: string } }>;
  };
  const title = data.items?.[0]?.snippet?.title;
  return title ? { title } : null;
}

async function fetchChannelsFile(
  owner = process.env.GITHUB_OWNER,
  repo = process.env.GITHUB_REPO,
  branch = process.env.GITHUB_BRANCH ?? "main",
  token = process.env.GITHUB_TOKEN,
): Promise<{ sha: string; content: ChannelsFile }> {
  if (!owner || !repo) {
    throw new Error("GITHUB_OWNER, GITHUB_REPO 환경변수가 필요합니다.");
  }
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/channels.json?ref=${branch}`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(`GitHub Contents API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as GitHubFileResponse;
  const decoded = Buffer.from(data.content, "base64").toString("utf8");
  return { sha: data.sha, content: JSON.parse(decoded) as ChannelsFile };
}

async function commitChannelsFile(
  owner: string,
  repo: string,
  branch: string,
  token: string,
  sha: string,
  content: ChannelsFile,
  message: string,
): Promise<void> {
  const encoded = Buffer.from(JSON.stringify(content, null, 2) + "\n").toString(
    "base64",
  );
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/channels.json`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        content: encoded,
        sha,
        branch,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`GitHub commit 실패 ${res.status}: ${await res.text()}`);
  }
}
