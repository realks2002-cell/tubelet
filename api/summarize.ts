import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractVideoId, fetchVideoById } from "../src/youtube.js";
import { fetchTranscript } from "../src/transcript.js";
import { summarizeVideo } from "../src/summarize.js";
import type { DigestItem } from "../src/html.js";
import { isKakaoConfigured, sendDigestToKakao } from "../src/kakao.js";
import { db } from "../src/db.js";

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST 메서드만 허용됩니다." });
    return;
  }

  const url =
    typeof req.body === "object" && req.body !== null
      ? (req.body as { url?: string }).url?.trim()
      : undefined;
  if (!url) {
    res.status(400).json({ error: "url 필드가 필요합니다." });
    return;
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    res.status(400).json({ error: "유효한 YouTube URL 또는 videoId가 아닙니다." });
    return;
  }

  try {
    console.log(`[api/summarize] ${videoId}`);

    const video = await fetchVideoById(videoId);
    const transcript = await fetchTranscript(videoId);
    const summary = await summarizeVideo(video, transcript);

    const digest: DigestItem[] = [{ video, summary, hadTranscript: transcript !== null }];

    const now = new Date();
    const slug = `solo-${toSlug(now)}-${videoId}`;

    const { error: vErr } = await db.from("tube_videos").upsert({
      video_id: videoId,
      channel_id: video.channelId || null,
      channel_name: video.channelName,
      video_title: video.title,
      published_at: video.publishedAt ?? null,
      headline: summary.headline,
      deck: summary.summary,
      tldr: summary.keyPoints.map((text, i) => ({ num: i + 1, text })),
      actions: summary.keyPoints.map((text, i) => ({ num: i + 1, text })),
      stocks: summary.stocks,
      chips: summary.topics ?? [],
      had_transcript: transcript !== null,
      generated_at: now.toISOString(),
    }, { onConflict: "video_id" });
    if (vErr) throw new Error(`tube_videos 저장 실패: ${vErr.message}`);

    const { error: rErr } = await db.from("tube_digest_runs").upsert({
      slug,
      generated_at: now.toISOString(),
      video_ids: [videoId],
    }, { onConflict: "slug" });
    if (rErr) throw new Error(`tube_digest_runs 저장 실패: ${rErr.message}`);

    const siteBase = process.env.SITE_URL ?? "https://tubelet.vercel.app";
    const digestUrl = `${siteBase}/digest/${slug}`;

    let kakaoSent = false;
    let kakaoError: string | null = null;
    if (isKakaoConfigured()) {
      try {
        await sendDigestToKakao(digest, digestUrl);
        kakaoSent = true;
      } catch (err) {
        kakaoError = (err as Error).message;
        console.error(`카카오 전송 실패: ${kakaoError}`);
      }
    }

    res.status(200).json({
      ok: true,
      slug,
      digestUrl,
      headline: summary.headline,
      channelName: video.channelName,
      videoTitle: video.title,
      stockCount: summary.stocks.length,
      kakaoSent,
      kakaoError,
      note: "Supabase 저장 완료. 바로 접근 가능합니다.",
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`summarize 실패: ${msg}`);
    res.status(500).json({ error: msg });
  }
}

function toSlug(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}-${hh}${mi}${ss}`;
}
