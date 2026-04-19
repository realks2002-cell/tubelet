import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractVideoId, fetchVideoById } from "../src/youtube.js";
import { fetchTranscript } from "../src/transcript.js";
import { summarizeVideo } from "../src/summarize.js";
import { renderDigest, type DigestItem } from "../src/html.js";
import { isKakaoConfigured, sendDigestToKakao } from "../src/kakao.js";
import { commitFiles, requireGitHubEnv } from "../src/github.js";
import type { DigestMeta } from "../src/save.js";

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
    const gh = requireGitHubEnv();

    const video = await fetchVideoById(videoId);
    const transcript = await fetchTranscript(videoId);
    const summary = await summarizeVideo(video, transcript);

    const digest: DigestItem[] = [
      { video, summary, hadTranscript: transcript !== null },
    ];
    const html = renderDigest(digest);

    const now = new Date();
    const slug = `solo-${toSlug(now)}-${videoId}`;

    const meta: DigestMeta = {
      slug,
      generatedAt: now.toISOString(),
      videoCount: 1,
      channels: [video.channelName],
      headlines: [
        {
          channelName: video.channelName,
          headline: summary.headline,
          videoTitle: video.title,
          videoId,
          stockCount: summary.stocks.length,
        },
      ],
    };

    await commitFiles({
      ...gh,
      files: [
        { path: `public/digest/${slug}.html`, content: html },
        {
          path: `public/digest/${slug}.json`,
          content: JSON.stringify(meta, null, 2) + "\n",
        },
      ],
      message: `feat: Compose 요약 ${summary.headline}`,
    });

    const siteBase = process.env.SITE_URL ?? "https://tubelet.vercel.app";
    const digestUrl = `${siteBase}/digest/${slug}.html`;

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
      note: "GitHub 커밋 완료. Vercel 재배포 후 1~2분 뒤 URL에 접근 가능합니다.",
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
