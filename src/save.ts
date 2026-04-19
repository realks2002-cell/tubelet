import { db } from "./db.js";
import type { DigestItem } from "./html.js";

export interface SavedDigest {
  slug: string;
}

export interface DigestMeta {
  slug: string;
  generatedAt: string;
  videoCount: number;
  channels: string[];
  headlines: Array<{
    channelName: string;
    headline: string;
    videoTitle: string;
    videoId: string;
    stockCount: number;
  }>;
}

export async function saveDigestHtml(
  _html: string,
  items: DigestItem[],
  at = new Date(),
): Promise<SavedDigest> {
  const slug = toSlug(at);

  const videos = items.map((it) => ({
    video_id: it.video.videoId,
    channel_id: it.video.channelId ?? null,
    channel_name: it.video.channelName,
    video_title: it.video.title,
    published_at: it.video.publishedAt ?? null,
    headline: it.summary.headline,
    deck: it.summary.summary,
    tldr: it.summary.keyPoints.map((text, i) => ({ num: i + 1, text })),
    actions: it.summary.keyPoints.map((text, i) => ({ num: i + 1, text })),
    stocks: it.summary.stocks,
    chips: it.summary.topics ?? [],
    had_transcript: it.hadTranscript,
    generated_at: at.toISOString(),
  }));

  const { error: vErr } = await db
    .from("tube_videos")
    .upsert(videos, { onConflict: "video_id" });
  if (vErr) throw new Error(`tube_videos 저장 실패: ${vErr.message}`);

  const { error: rErr } = await db.from("tube_digest_runs").upsert(
    {
      slug,
      generated_at: at.toISOString(),
      video_ids: items.map((it) => it.video.videoId),
    },
    { onConflict: "slug" },
  );
  if (rErr) throw new Error(`tube_digest_runs 저장 실패: ${rErr.message}`);

  return { slug };
}

export async function loadAllMetas(): Promise<DigestMeta[]> {
  const { data, error } = await db
    .from("tube_digest_runs")
    .select("slug, generated_at, video_ids")
    .order("generated_at", { ascending: false });
  if (error) throw new Error(`digest_runs 조회 실패: ${error.message}`);

  const videoIds = (data ?? []).flatMap((r) => r.video_ids as string[]);
  const { data: vData, error: vErr } = await db
    .from("tube_videos")
    .select("video_id, channel_name, headline, video_title, stocks")
    .in("video_id", videoIds.length ? videoIds : [""]);
  if (vErr) throw new Error(`tube_videos 조회 실패: ${vErr.message}`);

  const videoMap = new Map(
    (vData ?? []).map((v) => [v.video_id as string, v]),
  );

  return (data ?? []).map((run) => {
    const ids = run.video_ids as string[];
    const headlines = ids
      .map((id) => {
        const v = videoMap.get(id);
        if (!v) return null;
        return {
          channelName: v.channel_name as string,
          headline: (v.headline as string) ?? "",
          videoTitle: v.video_title as string,
          videoId: id,
          stockCount: ((v.stocks as unknown[]) ?? []).length,
        };
      })
      .filter(Boolean) as DigestMeta["headlines"];

    const channels = Array.from(
      new Set(headlines.map((h) => h.channelName)),
    );

    return {
      slug: run.slug as string,
      generatedAt: run.generated_at as string,
      videoCount: ids.length,
      channels,
      headlines,
    };
  });
}

function toSlug(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}-${hh}${mi}`;
}
