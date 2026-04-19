import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "../src/db.js";

export const maxDuration = 30;

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const { data, error } = await db
        .from("tube_channels")
        .select("id, name, enabled, added_at")
        .order("added_at", { ascending: true });
      if (error) throw new Error(error.message);
      res.status(200).json({ channels: data });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "GET/POST만 허용됩니다." });
      return;
    }

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
        error: "채널 ID를 인식하지 못했어요. UCxxxxxxxxx 형식 ID 또는 /channel/UCxxx URL을 사용하세요.",
      });
      return;
    }

    const channelInfo = await fetchYouTubeChannel(channelId);
    if (!channelInfo) {
      res.status(404).json({ error: `YouTube에서 채널을 찾을 수 없습니다: ${channelId}` });
      return;
    }

    const { data: existing } = await db
      .from("tube_channels")
      .select("id")
      .eq("id", channelId)
      .single();
    if (existing) {
      res.status(409).json({ error: `이미 등록된 채널입니다: ${channelInfo.title}` });
      return;
    }

    const displayName = customName || channelInfo.title;
    const { error: insertErr } = await db.from("tube_channels").insert({
      id: channelId,
      name: displayName,
      enabled: true,
    });
    if (insertErr) throw new Error(insertErr.message);

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

async function resolveChannelId(input: string): Promise<string | null> {
  if (CHANNEL_ID_RE.test(input)) return input;
  try {
    const u = new URL(input);
    if (u.hostname.includes("youtube.com")) {
      const match = u.pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (match) return match[1]!;
      const handleMatch = u.pathname.match(/^\/@([\w.\-]+)/);
      if (handleMatch) return await resolveHandle(handleMatch[1]!);
    }
  } catch {
    if (input.startsWith("@")) return await resolveHandle(input.slice(1));
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
  const data = (await res.json()) as { items?: Array<{ id?: string }> };
  return data.items?.[0]?.id ?? null;
}

async function fetchYouTubeChannel(channelId: string): Promise<{ title: string } | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY 환경변수가 없습니다.");
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${key}`,
  );
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { items?: Array<{ snippet?: { title?: string } }> };
  const title = data.items?.[0]?.snippet?.title;
  return title ? { title } : null;
}
