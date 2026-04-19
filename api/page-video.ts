import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "../src/db.js";
import { renderDigest, type DigestItem } from "../src/html.js";
import type { StockItem } from "../src/summarize.js";

export const maxDuration = 15;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const videoId = (req.query.id as string) || req.url?.split("/video/")?.[1]?.split("?")?.[0] || "";

  if (!videoId) {
    res.status(400).send("<p>video id가 없습니다.</p>");
    return;
  }

  try {
    const { data: v, error } = await db
      .from("tube_videos")
      .select("*")
      .eq("video_id", videoId)
      .single();

    if (error || !v) {
      res.status(404).send(`<p>영상을 찾을 수 없습니다: ${videoId}</p>`);
      return;
    }

    const item: DigestItem = {
      video: {
        videoId,
        title: v.video_title as string,
        description: "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: (v.published_at as string) ?? "",
        channelId: (v.channel_id as string) ?? "",
        channelName: v.channel_name as string,
      },
      summary: {
        headline: (v.headline as string) ?? "",
        summary: (v.deck as string) ?? "",
        keyPoints: ((v.tldr as Array<{ text: string }>) ?? []).map((t) => t.text),
        stocks: (v.stocks as StockItem[]) ?? [],
        topics: (v.chips as string[]) ?? [],
        sentiment: "informative" as const,
      },
      hadTranscript: (v.had_transcript as boolean) ?? false,
    };

    const html = renderDigest([item], new Date(v.generated_at as string));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`page-video 실패: ${msg}`);
    res.status(500).send(`<pre>${msg}</pre>`);
  }
}
