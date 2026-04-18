import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchVideoById, extractVideoId } from "./youtube.js";
import { fetchTranscript } from "./transcript.js";
import { summarizeVideo } from "./summarize.js";
import { renderDigest, type DigestItem } from "./html.js";
import { regenerateLanding } from "./landing.js";
import type { DigestMeta } from "./save.js";

export interface SoloResult {
  slug: string;
  filePath: string;
  headline: string;
  channelName: string;
  videoTitle: string;
  stockCount: number;
}

export async function summarizeSingleUrl(url: string): Promise<SoloResult> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("유효한 YouTube URL 또는 videoId가 아닙니다.");
  }

  const video = await fetchVideoById(videoId);
  const transcript = await fetchTranscript(videoId);
  const summary = await summarizeVideo(video, transcript);

  const digest: DigestItem[] = [
    { video, summary, hadTranscript: transcript !== null },
  ];
  const html = renderDigest(digest);

  const now = new Date();
  const slug = `solo-${toSlug(now)}-${videoId}`;
  const filePath = resolve(`public/digest/${slug}.html`);
  const metaPath = resolve(`public/digest/${slug}.json`);

  await mkdir(resolve("public/digest"), { recursive: true });
  await writeFile(filePath, html, "utf8");

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
  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

  await regenerateLanding();

  return {
    slug,
    filePath,
    headline: summary.headline,
    channelName: video.channelName,
    videoTitle: video.title,
    stockCount: summary.stocks.length,
  };
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
