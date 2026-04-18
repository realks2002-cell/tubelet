import type { YoutubeVideo } from "./youtube.js";
import type { StockItem, VideoSummary } from "./summarize.js";

const SENTIMENT_LABEL: Record<StockItem["sentiment"], string> = {
  bull: "강세",
  bear: "약세",
  watch: "관찰",
  neutral: "중립",
};

export interface DigestItem {
  video: YoutubeVideo;
  summary: VideoSummary;
  hadTranscript: boolean;
}

export function renderDigest(
  items: DigestItem[],
  generatedAt = new Date(),
): string {
  const dateLabel = formatDate(generatedAt);
  const timeLabel = formatTime(generatedAt);
  const channelNames = uniqueChannelNames(items);
  const articles = items.map((it, i) => renderArticle(it, i + 1)).join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Tubelet · ${dateLabel}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<style>
${styles()}
</style>
</head>
<body>
<div class="page">

  <div class="top">
    <div class="mark" aria-hidden="true"></div>
    <div class="brand">Tubelet<em>.</em></div>
    <span class="v">Daily Digest · ${dateLabel} · ${timeLabel}</span>
  </div>

  <header class="masthead">
    <div class="eyebrow">Tubelet / Daily Digest</div>
    <h1>오늘의 <em>이야기</em></h1>
    <p class="lead">${channelNames} 채널에서 ${items.length}편이 올라왔고, 모두 정리해서 담았어요.</p>
    <div class="meta-row">
      <div><span class="k">Videos</span><span class="v">${items.length}편</span></div>
      <div><span class="k">Channels</span><span class="v">${escapeHtml(channelNames)}</span></div>
      <div><span class="k">Generated</span><span class="v">Claude Haiku 4.5</span></div>
    </div>
  </header>

  ${items.length === 0 ? renderEmpty() : articles}

  <footer class="foot">
    <span>Tubelet · Personal Digest</span>
    <span>·</span>
    <span>${dateLabel}</span>
    <div class="sp"></div>
    <span class="mono">v0.1</span>
  </footer>

</div>
</body>
</html>`;
}

function renderArticle(item: DigestItem, index: number): string {
  const { video, summary, hadTranscript } = item;
  const num = String(index).padStart(2, "0");
  const thumb = `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
  const publishedAt = video.publishedAt
    ? formatDateTime(new Date(video.publishedAt))
    : "";
  const transcriptNote = hadTranscript ? "자막 기반" : "자막 없음 · 제목 기반";

  const keyPointItems = summary.keyPoints
    .map((kp, i) => {
      const n = String(i + 1).padStart(2, "0");
      return `<div class="it"><div class="n">${n}</div><div>${escapeHtml(kp)}</div></div>`;
    })
    .join("");

  const topicChips = summary.topics
    .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
    .join("");

  const stocksSection =
    summary.stocks.length > 0
      ? renderStocks(summary.stocks)
      : "";

  return `<article class="article">

  <div class="art-meta">
    <span class="art-num">${num}</span>
    <span class="art-channel">${escapeHtml(video.channelName)}</span>
    ${publishedAt ? `<span class="sep">·</span><span class="mono">${publishedAt}</span>` : ""}
    <span class="sep">·</span>
    <span class="mono">${transcriptNote}</span>
  </div>

  <h2 class="art-headline">${escapeHtml(summary.headline)}</h2>

  <p class="art-deck">${escapeHtml(summary.summary)}</p>

  <a class="art-thumb" href="${escapeAttr(video.url)}" target="_blank" rel="noopener">
    <img src="${thumb}" alt="" />
    <div class="art-thumb-caption">
      <span class="mono">원본 제목</span>
      <span class="art-thumb-title">${escapeHtml(video.title)}</span>
    </div>
  </a>

  ${stocksSection}

  ${summary.keyPoints.length > 0 ? `<div class="act-box">
    <div class="lab">핵심 포인트 · ${summary.keyPoints.length}개</div>
    <h3>이 영상의 요점</h3>
    ${keyPointItems}
  </div>` : ""}

  <div class="chips-row">
    <span class="chip accent">AI 요약</span>
    ${topicChips}
  </div>

  <div class="art-cta">
    <a class="btn ol" href="${escapeAttr(video.url)}" target="_blank" rel="noopener">
      YouTube에서 영상 보기
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h8v8"/><path d="M13 3L3 13"/></svg>
    </a>
  </div>

</article>`;
}

function renderStocks(stocks: StockItem[]): string {
  const rows = stocks.map((s, i) => renderStockRow(s, i + 1)).join("\n");
  return `<section class="stocks">
  <div class="stocks-head">
    <span class="eyebrow">종목 분석 · ${stocks.length}개</span>
    <span class="stocks-legend mono">catalyst · analysis · key levels</span>
  </div>
  <div class="stocks-list">
    ${rows}
  </div>
</section>`;
}

function renderStockRow(stock: StockItem, index: number): string {
  const num = String(index).padStart(2, "0");
  const sentClass = `sent-${stock.sentiment}`;
  const sentLabel = SENTIMENT_LABEL[stock.sentiment];

  const sectorTag = stock.sector
    ? `<span class="stock-sector">${escapeHtml(stock.sector)}</span>`
    : "";
  const tickerTag = stock.ticker
    ? `<span class="stock-ticker mono">${escapeHtml(stock.ticker)}</span>`
    : "";
  const catalyst = stock.catalyst
    ? `<p class="stock-catalyst">${escapeHtml(stock.catalyst)}</p>`
    : "";
  const keyLevels = stock.keyLevels
    ? `<div class="stock-levels">
        <span class="mono lab">Key Levels</span>
        <span>${escapeHtml(stock.keyLevels)}</span>
      </div>`
    : "";

  return `<article class="stock">
  <div class="stock-head">
    <span class="stock-num mono">${num}</span>
    <div class="stock-title">
      <h4 class="stock-name">${escapeHtml(stock.name)}</h4>
      <div class="stock-meta">
        ${tickerTag}
        ${sectorTag}
      </div>
    </div>
    <span class="chip ${sentClass}">${sentLabel}</span>
  </div>
  ${catalyst}
  <p class="stock-analysis">${escapeHtml(stock.analysis)}</p>
  ${keyLevels}
</article>`;
}

function renderEmpty(): string {
  return `<div class="empty">
    <p class="t-label">Today</p>
    <h2>새 영상이 없습니다.</h2>
    <p>구독한 채널에서 지난 24시간 내 업로드된 영상이 없어요.</p>
  </div>`;
}

function uniqueChannelNames(items: DigestItem[]): string {
  const names = Array.from(new Set(items.map((i) => i.video.channelName)));
  if (names.length === 0) return "구독";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]} 외 ${names.length - 1}곳`;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  return `${y}.${m}.${dd} (${dayNames[d.getDay()]})`;
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${formatTime(d)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function styles(): string {
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
  --positive: oklch(0.55 0.12 145);
  --font-sans: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); }
body {
  font-family: var(--font-sans);
  color: var(--ink);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
img { display: block; max-width: 100%; }

.page { max-width: 780px; margin: 0 auto; padding: 56px 40px 120px; }

/* ─── Top bar ─── */
.top { display: flex; align-items: baseline; gap: 14px; margin-bottom: 8px; }
.mark {
  width: 26px; height: 26px; background: var(--ink);
  border-radius: 7px; display: inline-grid; place-items: center;
  color: #fff; align-self: center;
}
.mark::before {
  content: '';
  width: 0; height: 0;
  border-left: 7px solid currentColor;
  border-top: 4.5px solid transparent;
  border-bottom: 4.5px solid transparent;
  margin-left: 2px;
}
.brand {
  font-family: var(--font-sans); font-size: 20px;
  font-weight: 600; letter-spacing: -0.01em;
}
.brand em { font-style: italic; color: var(--ink-3); font-weight: 400; }
.top .v {
  margin-left: auto; font-family: var(--font-mono);
  font-size: 11px; color: var(--ink-3); letter-spacing: 0.05em;
}

/* ─── Masthead ─── */
.masthead {
  margin: 28px 0 64px;
  padding-bottom: 36px;
  border-bottom: 1px solid var(--rule);
}
.eyebrow {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3);
}
.masthead h1 {
  font-family: var(--font-sans); font-size: 60px; font-weight: 700;
  letter-spacing: -0.03em; line-height: 1;
  margin: 14px 0 14px; text-wrap: balance;
}
.masthead h1 em { font-style: italic; color: var(--ink-3); font-weight: 500; }
.masthead .lead {
  font-family: var(--font-sans); font-size: 19px; font-weight: 500;
  line-height: 1.5; color: var(--ink-2);
  max-width: 620px; text-wrap: pretty; margin: 0;
}
.meta-row {
  display: flex; gap: 32px; margin-top: 28px;
  font-size: 12.5px; color: var(--ink-3); flex-wrap: wrap;
}
.meta-row .k {
  display: block; font-family: var(--font-mono);
  font-size: 10.5px; letter-spacing: 0.1em;
  text-transform: uppercase; margin-bottom: 4px;
}
.meta-row .v { color: var(--ink); font-size: 13px; font-weight: 500; }

/* ─── Article ─── */
.article {
  padding: 64px 0;
  border-bottom: 1px solid var(--rule);
}
.article:last-of-type { border-bottom: none; }

.art-meta {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 12px; color: var(--ink-3); margin-bottom: 18px;
}
.art-num {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em;
  color: var(--ink-3); text-transform: uppercase;
  padding: 2px 8px; border: 1px solid var(--rule); border-radius: 4px;
}
.art-channel { font-weight: 500; color: var(--ink-2); }
.sep { color: var(--ink-4); }
.mono { font-family: var(--font-mono); }

.art-headline {
  font-family: var(--font-sans); font-size: 36px; font-weight: 700;
  letter-spacing: -0.02em; line-height: 1.1;
  margin: 0 0 14px; text-wrap: balance;
}

.art-deck {
  font-family: var(--font-sans); font-size: 19px; font-weight: 500;
  line-height: 1.5; color: var(--ink-2);
  margin: 0 0 32px; text-wrap: pretty;
}

.art-thumb {
  display: block; margin: 0 0 32px;
  border: 1px solid var(--rule); border-radius: 10px; overflow: hidden;
  background: var(--bg-tint);
}
.art-thumb img {
  width: 100%; aspect-ratio: 16/9; object-fit: cover;
  border-bottom: 1px solid var(--rule);
}
.art-thumb-caption {
  display: flex; align-items: baseline; gap: 10px;
  padding: 12px 16px;
  background: #fff;
}
.art-thumb-caption .mono {
  font-size: 10.5px; color: var(--ink-3);
  letter-spacing: 0.08em; text-transform: uppercase; flex-shrink: 0;
}
.art-thumb-title {
  font-size: 13px; color: var(--ink-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1; min-width: 0;
}
.art-thumb:hover .art-thumb-title { color: var(--ink); }

/* Stocks section */
.stocks {
  margin: 0 0 32px;
  padding: 28px 0 0;
  border-top: 1px solid var(--rule);
}
.stocks-head {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  margin-bottom: 20px;
}
.stocks-legend {
  margin-left: auto;
  font-size: 10.5px; color: var(--ink-4);
  letter-spacing: 0.06em; text-transform: lowercase;
}
.stocks-list {
  display: flex; flex-direction: column; gap: 14px;
}
.stock {
  border: 1px solid var(--rule); border-radius: 10px;
  padding: 20px 22px;
}
.stock-head {
  display: grid; grid-template-columns: auto 1fr auto; gap: 14px;
  align-items: center; margin-bottom: 12px;
}
.stock-num {
  font-size: 11px; color: var(--ink-3);
  letter-spacing: 0.08em; padding: 3px 8px;
  border: 1px solid var(--rule); border-radius: 4px;
}
.stock-title { min-width: 0; }
.stock-name {
  font-family: var(--font-sans); font-size: 19px; font-weight: 600;
  letter-spacing: -0.015em; margin: 0 0 4px;
  line-height: 1.2;
}
.stock-meta {
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  font-size: 11.5px;
}
.stock-ticker {
  font-size: 11px; color: var(--ink-3);
  padding: 2px 7px; background: var(--bg-tint); border-radius: 4px;
  letter-spacing: 0.02em;
}
.stock-sector {
  font-size: 11.5px; color: var(--ink-2);
}
.stock-sector::before { content: '· '; color: var(--ink-4); }
.stock-meta > *:first-child.stock-sector::before { content: ''; }

.stock-catalyst {
  font-family: var(--font-sans); font-size: 14px; font-weight: 500;
  color: var(--ink); line-height: 1.5;
  margin: 0 0 10px; padding-left: 12px;
  border-left: 2px solid var(--accent);
}
.stock-analysis {
  font-family: var(--font-sans); font-size: 14.5px; font-weight: 400;
  color: var(--ink-2); line-height: 1.65;
  margin: 0; text-wrap: pretty;
  white-space: pre-wrap;
}
.stock-levels {
  display: flex; align-items: center; gap: 10px;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px dashed var(--rule);
  font-size: 12.5px; color: var(--ink-2);
}
.stock-levels .lab {
  font-size: 10px; color: var(--ink-3);
  letter-spacing: 0.08em; text-transform: uppercase;
}

/* Sentiment chips */
.chip.sent-bull {
  background: oklch(0.95 0.05 145); color: oklch(0.35 0.12 145);
}
.chip.sent-bear {
  background: oklch(0.95 0.05 28); color: oklch(0.4 0.14 28);
}
.chip.sent-watch {
  background: var(--accent-bg); color: var(--accent-ink);
}
.chip.sent-neutral {
  background: var(--bg-tint); color: var(--ink-2);
}

/* Actions box (dark) */
.act-box {
  background: var(--ink); color: #F2EDE3;
  border-radius: 10px; padding: 24px 26px;
  margin: 0 0 28px;
}
.act-box .lab {
  font-size: 10.5px; text-transform: uppercase;
  letter-spacing: 0.12em; color: var(--ink-4); margin-bottom: 8px;
}
.act-box h3 {
  font-family: var(--font-sans); font-size: 18px; font-weight: 500;
  margin: 0 0 14px; color: #fff; letter-spacing: -0.01em;
}
.act-box .it {
  display: grid; grid-template-columns: 28px 1fr; gap: 14px;
  padding: 12px 0; border-top: 1px solid rgba(255, 255, 255, 0.12);
  align-items: start; font-size: 14px; line-height: 1.55;
}
.act-box .it:first-of-type { border-top: none; padding-top: 2px; }
.act-box .it .n {
  font-family: var(--font-sans); font-size: 17px; font-weight: 600;
  color: var(--accent); line-height: 1; padding-top: 3px;
  letter-spacing: -0.01em;
}

/* Chips row */
.chips-row {
  display: flex; flex-wrap: wrap; gap: 6px;
  margin: 0 0 28px;
}
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; padding: 3px 10px; border-radius: 999px;
  background: var(--bg-tint); color: var(--ink-2); font-weight: 500;
}
.chip.accent { background: var(--accent-bg); color: var(--accent-ink); }

/* CTA */
.art-cta { display: flex; }
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 6px;
  font-size: 13px; font-weight: 500; border: 1px solid transparent;
  transition: all .12s;
}
.btn.ol {
  border-color: var(--rule-strong); color: var(--ink); background: #fff;
}
.btn.ol:hover { background: var(--bg-tint); }

/* Empty state */
.empty {
  padding: 80px 0; text-align: center; border-bottom: 1px solid var(--rule);
}
.empty .t-label {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.14em;
  color: var(--ink-3); text-transform: uppercase; margin: 0 0 12px;
}
.empty h2 {
  font-family: var(--font-sans); font-size: 28px; font-weight: 600;
  letter-spacing: -0.02em; margin: 0 0 10px;
}
.empty p { color: var(--ink-3); font-size: 14px; margin: 0; }

/* Footer */
.foot {
  margin-top: 80px; padding-top: 24px;
  border-top: 1px solid var(--rule);
  display: flex; gap: 14px; color: var(--ink-3);
  font-size: 12px; align-items: center;
}
.foot .sp { flex: 1; }
.foot .mono { font-family: var(--font-mono); font-size: 11px; }

/* ─── Mobile ─── */
@media (max-width: 560px) {
  .page { padding: 36px 20px 80px; }
  .masthead h1 { font-size: 44px; }
  .masthead .lead { font-size: 17px; }
  .meta-row { gap: 20px; }
  .article { padding: 48px 0; }
  .art-headline { font-size: 28px; }
  .art-deck { font-size: 17px; margin-bottom: 24px; }
  .act-box { padding: 20px; }
  .act-box .it { grid-template-columns: 24px 1fr; gap: 10px; }
  .stock { padding: 16px 18px; }
  .stock-head { grid-template-columns: auto 1fr; row-gap: 8px; }
  .stock-head .chip { grid-column: 2; justify-self: start; }
  .stock-name { font-size: 17px; }
}
`;
}
