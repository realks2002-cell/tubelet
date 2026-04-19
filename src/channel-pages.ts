import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "./db.js";
import type { DigestMeta } from "./save.js";
import { enhancementScript, enhancementStyles } from "./html.js";

const CHANNEL_DIR = resolve("public/channel");

export interface ChannelVideo {
  videoId: string;
  headline: string;
  videoTitle: string;
  stockCount: number;
  digestSlug: string;
  digestDate: string;
}

export function channelSlug(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  if (s) return s;
  return "ch-" + Math.abs(hashCode(name)).toString(36);
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

export async function regenerateChannelPages(
  metas: DigestMeta[],
): Promise<{ slug: string; name: string; path: string }[]> {
  await mkdir(CHANNEL_DIR, { recursive: true });

  const byChannel = new Map<string, ChannelVideo[]>();
  for (const m of metas) {
    for (const h of m.headlines) {
      if (!byChannel.has(h.channelName)) {
        byChannel.set(h.channelName, []);
      }
      byChannel.get(h.channelName)!.push({
        videoId: h.videoId,
        headline: h.headline,
        videoTitle: h.videoTitle,
        stockCount: h.stockCount,
        digestSlug: m.slug,
        digestDate: m.generatedAt,
      });
    }
  }

  const results: { slug: string; name: string; path: string }[] = [];
  for (const [name, videos] of byChannel) {
    videos.sort(
      (a, b) => Date.parse(b.digestDate) - Date.parse(a.digestDate),
    );
    const slug = channelSlug(name);
    const html = renderChannelPage(name, videos);
    const path = resolve(CHANNEL_DIR, `${slug}.html`);
    await writeFile(path, html, "utf8");
    results.push({ slug, name, path });
  }
  return results;
}

export function renderChannelPageFromDb(
  name: string,
  rows: Array<Record<string, unknown>>,
): string {
  const videos: ChannelVideo[] = rows.map((r) => ({
    videoId: r.video_id as string,
    headline: (r.headline as string) ?? "",
    videoTitle: r.video_title as string,
    stockCount: ((r.stocks as unknown[]) ?? []).length,
    digestSlug: "",
    digestDate: (r.generated_at as string) ?? new Date().toISOString(),
  }));
  return renderChannelPage(name, videos);
}

function renderChannelPage(name: string, videos: ChannelVideo[]): string {
  const totalStocks = videos.reduce((sum, v) => sum + v.stockCount, 0);
  const latestDate = videos[0]?.digestDate
    ? formatDate(new Date(videos[0].digestDate))
    : "—";

  const items = videos
    .map((v, i) => {
      const num = String(i + 1).padStart(2, "0");
      const d = new Date(v.digestDate);
      const dateLabel = formatDate(d);
      const relative = formatRelative(d);
      const thumb = `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      const href = `/video/${v.videoId}`;
      const stocksChip =
        v.stockCount > 0
          ? `<span class="chip accent">종목 ${v.stockCount}</span>`
          : "";
      return `<a class="ch-video" href="${href}">
        <span class="cv-num mono">${num}</span>
        <span class="cv-thumb">
          <img src="${thumb}" alt="" loading="lazy" />
        </span>
        <span class="cv-body">
          <span class="cv-meta mono">${dateLabel} · ${relative}</span>
          <span class="cv-headline">${escapeHtml(v.headline)}</span>
          <span class="cv-title">${escapeHtml(v.videoTitle)}</span>
          ${stocksChip ? `<span class="cv-chips">${stocksChip}</span>` : ""}
        </span>
        <span class="cv-arrow mono" aria-hidden="true">→</span>
      </a>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(name)} · Tubelet</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<style>
${baseStyles()}
${enhancementStyles()}
${channelPageStyles()}
</style>
</head>
<body>
<div class="page">

  <div class="top">
    <a class="top-home" href="/" aria-label="홈으로">
      <div class="mark" aria-hidden="true"></div>
      <div class="brand">Tubelet<em>.</em></div>
    </a>
    <span class="v">Channel · ${escapeHtml(name)}</span>
  </div>

  <a class="ch-back" href="/">
    <span aria-hidden="true">←</span> 모든 채널
  </a>

  <header class="masthead">
    <div class="eyebrow">Tubelet / Channel</div>
    <h1>${escapeHtml(name)}</h1>
    <p class="lead">이 채널에서 정리된 ${videos.length}편의 요약입니다. 클릭하면 해당 영상의 상세 요약으로 이동해요.</p>
    <div class="stat-row">
      <div class="stat"><span class="k">Videos</span><span class="v">${videos.length}편</span></div>
      ${totalStocks > 0 ? `<div class="stat"><span class="k">Stocks</span><span class="v">${totalStocks}개</span></div>` : ""}
      <div class="stat"><span class="k">Latest</span><span class="v">${latestDate}</span></div>
    </div>
  </header>

  <section class="sec">
    <div class="sec-hd">
      <div class="num">List</div>
      <h2>요약 목록</h2>
      <div class="desc">새 것부터 정렬됨</div>
    </div>
    <div class="ch-videos">
      ${items || '<p class="ch-empty">아직 요약이 없어요.</p>'}
    </div>
  </section>

  <footer class="foot">
    <span>Tubelet · Channel</span>
    <span>·</span>
    <span>${escapeHtml(name)}</span>
    <div class="sp"></div>
    <span class="mono">v0.1</span>
  </footer>

</div>
<script>
${enhancementScript()}
</script>
</body>
</html>`;
}

function channelPageStyles(): string {
  return `
.ch-back {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-sans); font-size: 12.5px; font-weight: 500;
  color: var(--ink-2); text-decoration: none;
  background: #fff; border: 1px solid var(--rule-strong); border-radius: 6px;
  padding: 7px 12px; margin: 8px 0 24px;
  transition: background .12s, color .12s, border-color .12s;
}
.ch-back:hover { background: var(--bg-tint); color: var(--ink); border-color: var(--ink); }

.ch-videos { display: flex; flex-direction: column; }
.ch-video {
  display: grid;
  grid-template-columns: 36px 120px 1fr 24px;
  gap: 18px; align-items: center;
  padding: 16px 12px 16px 8px;
  border-bottom: 1px solid var(--rule);
  color: inherit; text-decoration: none;
  transition: background .12s;
}
.ch-video:hover { background: var(--bg-tint); }
.cv-num {
  font-family: var(--font-mono); font-size: 11.5px;
  color: var(--ink-3); letter-spacing: 0.05em; text-align: center;
}
.cv-thumb {
  display: block; width: 120px; aspect-ratio: 16/10;
  overflow: hidden; border-radius: 6px;
  background: var(--bg-tint);
}
.cv-thumb img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.cv-body {
  display: flex; flex-direction: column; gap: 5px; min-width: 0;
}
.cv-meta {
  font-size: 10.5px; color: var(--ink-3); letter-spacing: 0.05em;
}
.cv-headline {
  font-family: var(--font-sans); font-size: 16px; font-weight: 600;
  letter-spacing: -0.015em; color: var(--ink); line-height: 1.35;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.cv-title {
  font-family: var(--font-sans); font-size: 12.5px;
  color: var(--ink-3); line-height: 1.5;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
}
.cv-chips { display: flex; gap: 6px; margin-top: 4px; }
.cv-chips .chip {
  display: inline-flex; align-items: center;
  font-size: 11px; padding: 2px 9px; border-radius: 999px;
  background: var(--bg-tint); color: var(--ink-2); font-weight: 500;
}
.cv-chips .chip.accent { background: var(--accent-bg); color: var(--accent-ink); }
.cv-arrow {
  font-size: 14px; color: var(--ink-3);
  transition: transform .12s, color .12s; text-align: center;
}
.ch-video:hover .cv-arrow { color: var(--ink); transform: translateX(2px); }

.ch-empty {
  padding: 80px 0; text-align: center;
  color: var(--ink-3); font-size: 14px;
}

@media (max-width: 720px) {
  .ch-video {
    grid-template-columns: 28px 100px 1fr 18px;
    gap: 12px; padding: 14px 6px;
  }
  .cv-thumb { width: 100px; }
  .cv-headline { font-size: 14.5px; }
  .cv-title { display: none; }
}
`;
}

function baseStyles(): string {
  return `
:root {
  --bg: #FFFFFF;
  --bg-tint: #F5F2EC;
  --ink: #1A1814;
  --ink-2: #4A4540;
  --ink-3: #8A847C;
  --ink-4: #B8B0A4;
  --rule: #EAE5DA;
  --rule-strong: #D6CEBE;
  --accent: oklch(0.72 0.14 75);
  --accent-ink: oklch(0.32 0.10 60);
  --accent-bg: oklch(0.95 0.04 80);
  --font-sans: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); }
body {
  font-family: var(--font-sans); color: var(--ink);
  font-size: 14px; line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }

.page { max-width: 960px; margin: 0 auto; padding: 56px 40px 120px; }

.top { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
.mark {
  width: 26px; height: 26px; background: var(--ink);
  border-radius: 7px; display: inline-grid; place-items: center;
  color: #fff; align-self: center;
}
.mark::before {
  content: ''; width: 0; height: 0;
  border-left: 7px solid currentColor;
  border-top: 4.5px solid transparent;
  border-bottom: 4.5px solid transparent;
  margin-left: 2px;
}
.brand { font-family: var(--font-sans); font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
.brand em { font-style: italic; color: var(--ink-3); font-weight: 400; }
.top .v {
  margin-left: auto; font-family: var(--font-mono);
  font-size: 11px; color: var(--ink-3); letter-spacing: 0.05em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 60%;
}

.masthead {
  margin: 28px 0 56px; padding-bottom: 36px;
  border-bottom: 1px solid var(--rule);
}
.eyebrow {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3);
}
.masthead h1 {
  font-family: var(--font-sans); font-size: 42px; font-weight: 700;
  letter-spacing: -0.03em; line-height: 1.1;
  margin: 14px 0 14px; text-wrap: balance;
}
.masthead .lead {
  font-family: var(--font-sans); font-size: 17px; font-weight: 500;
  line-height: 1.55; color: var(--ink-2);
  max-width: 620px; margin: 0 0 24px;
}
.stat-row { display: flex; gap: 32px; flex-wrap: wrap; }
.stat .k {
  display: block; font-family: var(--font-mono);
  font-size: 10.5px; letter-spacing: 0.1em;
  text-transform: uppercase; margin-bottom: 4px; color: var(--ink-3);
}
.stat .v { font-family: var(--font-sans); font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }

.sec { margin: 0 0 56px; }
.sec-hd {
  display: flex; align-items: baseline; gap: 18px;
  padding-bottom: 14px; border-bottom: 1px solid var(--rule);
  margin-bottom: 12px;
}
.sec-hd .num {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.14em; color: var(--ink-3); text-transform: uppercase;
}
.sec-hd h2 {
  font-family: var(--font-sans); font-size: 26px;
  font-weight: 600; letter-spacing: -0.02em; margin: 0;
}
.sec-hd .desc {
  margin-left: auto; color: var(--ink-3);
  font-size: 12.5px;
}

.foot {
  margin-top: 80px; padding-top: 24px;
  border-top: 1px solid var(--rule);
  display: flex; gap: 14px; color: var(--ink-3);
  font-size: 12px; align-items: center;
}
.foot .sp { flex: 1; }
.mono { font-family: var(--font-mono); }

@media (max-width: 720px) {
  .page { padding: 36px 20px 80px; }
  .top .v { display: none; }
  .masthead h1 { font-size: 30px; }
  .masthead .lead { font-size: 15.5px; }
  .stat-row { gap: 22px; }
}
`;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  return `${y}.${m}.${dd} (${dayNames[d.getDay()]})`;
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return `${Math.floor(days / 7)}주 전`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
