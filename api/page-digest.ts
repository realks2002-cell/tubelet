import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "../src/db.js";
import { renderDigest, type DigestItem } from "../src/html.js";
import type { StockItem } from "../src/summarize.js";

export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = (req.query.slug as string) || req.url?.split("/digest/")?.[1]?.replace(/\/$/, "") || "";

  if (!slug) {
    res.status(400).send("<p>slug가 없습니다.</p>");
    return;
  }

  try {
    const { data: run, error: runErr } = await db
      .from("tube_digest_runs")
      .select("slug, generated_at, video_ids")
      .eq("slug", slug)
      .single();

    if (runErr || !run) {
      res.status(404).send(`<p>다이제스트를 찾을 수 없습니다: ${slug}</p>`);
      return;
    }

    const videoIds = run.video_ids as string[];
    const { data: videos, error: vErr } = await db
      .from("tube_videos")
      .select("*")
      .in("video_id", videoIds);

    if (vErr) throw new Error(vErr.message);

    const videoMap = new Map((videos ?? []).map((v) => [v.video_id as string, v]));
    const items: DigestItem[] = videoIds
      .map((id) => {
        const v = videoMap.get(id);
        if (!v) return null;
        return {
          video: {
            videoId: id,
            title: v.video_title as string,
            description: "",
            url: `https://www.youtube.com/watch?v=${id}`,
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
        } satisfies DigestItem;
      })
      .filter(Boolean) as DigestItem[];

    const html = renderDigest(items, new Date(run.generated_at as string));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(html);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`page-digest 실패: ${msg}`);
    res.status(500).send(`<pre>${msg}</pre>`);
  }
}
