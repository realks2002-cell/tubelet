import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DigestItem } from "./html.js";

export interface SavedDigest {
  filePath: string;
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
  html: string,
  items: DigestItem[],
  at = new Date(),
): Promise<SavedDigest> {
  const slug = toSlug(at);
  const filePath = resolve(`public/digest/${slug}.html`);
  const metaPath = resolve(`public/digest/${slug}.json`);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, html, "utf8");

  const meta: DigestMeta = {
    slug,
    generatedAt: at.toISOString(),
    videoCount: items.length,
    channels: Array.from(new Set(items.map((i) => i.video.channelName))),
    headlines: items.map((i) => ({
      channelName: i.video.channelName,
      headline: i.summary.headline,
      videoTitle: i.video.title,
      videoId: i.video.videoId,
      stockCount: i.summary.stocks.length,
    })),
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
  return { filePath, slug };
}

function toSlug(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}-${hh}${mi}`;
}
