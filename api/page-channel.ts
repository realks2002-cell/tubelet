import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "../src/db.js";
import { renderChannelPageFromDb } from "../src/channel-pages.js";

export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = (req.query.slug as string) || req.url?.split("/channel/")?.[1]?.replace(/\/$/, "") || "";

  if (!slug) {
    res.status(400).send("<p>slug가 없습니다.</p>");
    return;
  }

  try {
    const { data: channels, error: cErr } = await db
      .from("tube_channels")
      .select("id, name");
    if (cErr) throw new Error(cErr.message);

    const { channelSlug } = await import("../src/channel-pages.js");
    const channel = (channels ?? []).find(
      (c) => channelSlug(c.name as string) === slug,
    );

    if (!channel) {
      res.status(404).send(`<p>채널을 찾을 수 없습니다: ${slug}</p>`);
      return;
    }

    const { data: videos, error: vErr } = await db
      .from("tube_videos")
      .select("video_id, video_title, headline, stocks, generated_at")
      .eq("channel_name", channel.name)
      .order("generated_at", { ascending: false });
    if (vErr) throw new Error(vErr.message);

    const html = renderChannelPageFromDb(channel.name as string, videos ?? []);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`page-channel 실패: ${msg}`);
    res.status(500).send(`<pre>${msg}</pre>`);
  }
}
