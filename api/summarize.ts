import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";
import { extractVideoId, fetchVideoById } from "../src/youtube.js";
import { fetchTranscript } from "../src/transcript.js";
import { summarizeVideo } from "../src/summarize.js";
import { renderDigest, type DigestItem } from "../src/html.js";
import { isKakaoConfigured, sendDigestToKakao } from "../src/kakao.js";

export const maxDuration = 60;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
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
    res
      .status(400)
      .json({ error: "유효한 YouTube URL 또는 videoId가 아닙니다." });
    return;
  }

  try {
    console.log(`[api/summarize] ${videoId}`);
    const video = await fetchVideoById(videoId);
    const transcript = await fetchTranscript(videoId);
    const summary = await summarizeVideo(video, transcript);

    const digest: DigestItem[] = [
      { video, summary, hadTranscript: transcript !== null },
    ];
    const html = renderDigest(digest);

    const slug = `solo-${toSlug(new Date())}-${videoId}`;
    const blob = await put(`digest/${slug}.html`, html, {
      access: "public",
      contentType: "text/html; charset=utf-8",
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    let kakaoSent = false;
    let kakaoError: string | null = null;
    if (isKakaoConfigured()) {
      try {
        await sendDigestToKakao(digest, blob.url);
        kakaoSent = true;
      } catch (err) {
        kakaoError = (err as Error).message;
        console.error(`카카오 전송 실패: ${kakaoError}`);
      }
    }

    res.status(200).json({
      ok: true,
      slug,
      digestUrl: blob.url,
      headline: summary.headline,
      channelName: video.channelName,
      videoTitle: video.title,
      stockCount: summary.stocks.length,
      kakaoSent,
      kakaoError,
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
