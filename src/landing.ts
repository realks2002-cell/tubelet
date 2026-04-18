import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DigestMeta } from "./save.js";

const DIGEST_DIR = resolve("public/digest");
const INDEX_PATH = resolve("public/index.html");

export async function regenerateLanding(): Promise<string> {
  const metas = await loadAllMeta();
  metas.sort((a, b) => (a.slug < b.slug ? 1 : -1));

  const html = renderLanding(metas);
  await writeFile(INDEX_PATH, html, "utf8");
  return INDEX_PATH;
}

async function loadAllMeta(): Promise<DigestMeta[]> {
  const files = await readdir(DIGEST_DIR).catch(() => [] as string[]);
  const metas: DigestMeta[] = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      try {
        const raw = await readFile(resolve(DIGEST_DIR, file), "utf8");
        metas.push(JSON.parse(raw) as DigestMeta);
      } catch {
        // 깨진 meta는 무시
      }
    }
  }

  const seenSlugs = new Set(metas.map((m) => m.slug));
  for (const file of files) {
    if (file.endsWith(".html")) {
      const slug = file.replace(/\.html$/, "");
      if (!seenSlugs.has(slug)) {
        metas.push(legacyMeta(slug));
      }
    }
  }
  return metas;
}

function legacyMeta(slug: string): DigestMeta {
  const d = slugToDate(slug);
  return {
    slug,
    generatedAt: d.toISOString(),
    videoCount: 0,
    channels: [],
    headlines: [],
  };
}

function slugToDate(slug: string): Date {
  const m = slug.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/);
  if (!m) return new Date();
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );
}

function renderLanding(metas: DigestMeta[]): string {
  const latestItems = metas.slice(0, 20);
  const totalVideos = metas.reduce((sum, m) => sum + m.videoCount, 0);
  const totalDigests = metas.length;
  const allChannels = new Set<string>();
  metas.forEach((m) => m.channels.forEach((c) => allChannels.add(c)));

  const digestCards = latestItems.map(renderDigestCard).join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Tubelet · 개인 다이제스트 아카이브</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<style>
${landingStyles()}
</style>
</head>
<body>
<div class="page">

  <div class="top">
    <div class="mark" aria-hidden="true"></div>
    <div class="brand">Tubelet<em>.</em></div>
    <span class="v">Archive · 개인 다이제스트</span>
  </div>

  <header class="masthead">
    <div class="eyebrow">Tubelet / Personal Archive</div>
    <h1>매거진을 읽듯,<br /><em>하루를 시작해요.</em></h1>
    <p class="lead">구독한 YouTube 채널의 새 영상을 자동으로 요약해 모아둔 다이제스트 아카이브입니다.</p>
    <div class="stat-row">
      <div class="stat"><span class="k">Digests</span><span class="v">${totalDigests}개</span></div>
      <div class="stat"><span class="k">Videos</span><span class="v">${totalVideos}편</span></div>
      <div class="stat"><span class="k">Channels</span><span class="v">${allChannels.size}곳</span></div>
    </div>
  </header>

  <section class="compose">
    <div class="sec-hd">
      <div class="num">Compose</div>
      <h2>링크 하나로 바로 요약</h2>
      <div class="desc">YouTube URL을 붙여넣으면 이 자리에 바로 정리해 드려요.</div>
    </div>
    <form id="compose-form" class="compose-form">
      <div class="compose-input-wrap">
        <svg class="compose-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6.5 9.5l3-3"/><path d="M5 8a3 3 0 0 1 3-3h2.5a3 3 0 0 1 0 6H9"/><path d="M11 8a3 3 0 0 1-3 3H5.5a3 3 0 0 1 0-6H7"/></svg>
        <input
          id="compose-url"
          name="url"
          type="url"
          placeholder="https://www.youtube.com/watch?v=... 또는 https://youtu.be/..."
          required
          autocomplete="off"
          spellcheck="false"
        />
        <button type="submit" class="btn pri">정리하기</button>
      </div>
      <div id="compose-status" class="compose-status" role="status" aria-live="polite"></div>
    </form>
  </section>

  ${totalDigests === 0 ? renderEmpty() : `
  <section class="sec">
    <div class="sec-hd">
      <div class="num">Recent</div>
      <h2>지난 다이제스트</h2>
      <div class="desc">새 것부터 정리돼 있어요.</div>
    </div>
    <div class="digest-list">
      ${digestCards}
    </div>
  </section>
  `}

  <footer class="foot">
    <span>Tubelet · Personal Digest</span>
    <span>·</span>
    <span class="mono">${formatDateTime(new Date())}</span>
    <div class="sp"></div>
    <span class="mono">v0.1</span>
  </footer>

</div>
<script>
${composeScript()}
</script>
</body>
</html>`;
}

function composeScript(): string {
  return `
(function () {
  const form = document.getElementById('compose-form');
  const input = document.getElementById('compose-url');
  const status = document.getElementById('compose-status');
  const button = form ? form.querySelector('button[type="submit"]') : null;
  if (!form || !input || !status || !button) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    button.disabled = true;
    input.disabled = true;
    status.className = 'compose-status loading';
    status.innerHTML = '<span class="spinner"></span> 자막 추출 · Claude 요약 중… 30초~1분 걸릴 수 있어요.';

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '요약 실패');

      status.className = 'compose-status success';
      status.innerHTML =
        '<span class="ok">✓</span> <b>' + escape(data.headline) + '</b> — ' +
        '<a href="' + data.digestUrl + '">열어보기 →</a>';
      setTimeout(function () { window.location.href = data.digestUrl; }, 1200);
    } catch (err) {
      status.className = 'compose-status error';
      status.textContent = '✗ ' + (err.message || String(err));
      button.disabled = false;
      input.disabled = false;
    }
  });

  function escape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
`;
}

function renderEmpty(): string {
  return `<div class="empty">
    <p class="t-label">Archive</p>
    <h2>아직 다이제스트가 없습니다.</h2>
    <p><code class="mono">npm run dev</code>으로 첫 다이제스트를 생성해보세요.</p>
  </div>`;
}

function renderDigestCard(meta: DigestMeta): string {
  const d = new Date(meta.generatedAt);
  const dateLabel = formatDate(d);
  const timeLabel = formatTime(d);
  const relativeLabel = formatRelative(d);

  const channelLabel =
    meta.channels.length === 0
      ? "legacy"
      : meta.channels.length === 1
        ? escapeHtml(meta.channels[0]!)
        : meta.channels.length === 2
          ? `${escapeHtml(meta.channels[0]!)}, ${escapeHtml(meta.channels[1]!)}`
          : `${escapeHtml(meta.channels[0]!)} 외 ${meta.channels.length - 1}곳`;

  const totalStocks = meta.headlines.reduce((sum, h) => sum + h.stockCount, 0);
  const previewLines = meta.headlines
    .slice(0, 4)
    .map(
      (h) => `<li>
        <span class="pv-channel mono">${escapeHtml(h.channelName)}</span>
        <span class="pv-head">${escapeHtml(h.headline)}</span>
      </li>`,
    )
    .join("");
  const moreLabel =
    meta.headlines.length > 4 ? `<li class="pv-more mono">+ ${meta.headlines.length - 4}편 더</li>` : "";

  return `<a class="digest-card" href="digest/${meta.slug}.html">
    <div class="dc-head">
      <div class="dc-date-block">
        <span class="dc-date">${dateLabel}</span>
        <span class="dc-time mono">${timeLabel}</span>
      </div>
      <span class="dc-relative mono">${relativeLabel}</span>
    </div>
    <div class="dc-stats">
      <span class="chip">${meta.videoCount}편</span>
      ${totalStocks > 0 ? `<span class="chip accent">종목 ${totalStocks}</span>` : ""}
      <span class="chip neutral">${channelLabel}</span>
    </div>
    ${previewLines ? `<ul class="dc-preview">${previewLines}${moreLabel}</ul>` : ""}
    <div class="dc-cta mono">열어보기 →</div>
  </a>`;
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

function landingStyles(): string {
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
  font-family: var(--font-sans);
  color: var(--ink); font-size: 14px; line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }

.page { max-width: 960px; margin: 0 auto; padding: 56px 40px 120px; }

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
.brand { font-family: var(--font-sans); font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
.brand em { font-style: italic; color: var(--ink-3); font-weight: 400; }
.top .v {
  margin-left: auto; font-family: var(--font-mono);
  font-size: 11px; color: var(--ink-3); letter-spacing: 0.05em;
}

.masthead {
  margin: 28px 0 72px; padding-bottom: 40px;
  border-bottom: 1px solid var(--rule);
}
.eyebrow {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3);
}
.masthead h1 {
  font-family: var(--font-sans); font-size: 51px; font-weight: 700;
  letter-spacing: -0.03em; line-height: 1;
  margin: 14px 0 14px; text-wrap: balance;
}
.masthead h1 em { font-style: italic; color: var(--ink-3); font-weight: 500; }
.masthead .lead {
  font-family: var(--font-sans); font-size: 19px; font-weight: 500;
  line-height: 1.5; color: var(--ink-2);
  max-width: 620px; margin: 0 0 28px;
}
.stat-row { display: flex; gap: 36px; flex-wrap: wrap; }
.stat .k {
  display: block; font-family: var(--font-mono);
  font-size: 10.5px; letter-spacing: 0.1em;
  text-transform: uppercase; margin-bottom: 4px; color: var(--ink-3);
}
.stat .v { font-family: var(--font-sans); font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }

/* Compose (URL input) */
.compose {
  margin: 0 0 72px;
  padding: 32px 36px 36px;
  background: #fff;
  border: 1px solid var(--rule);
  border-radius: 14px;
  position: relative;
}
.compose .sec-hd {
  padding-bottom: 0; border-bottom: none; margin-bottom: 18px;
}
.compose-form {
  display: flex; flex-direction: column; gap: 10px;
}
.compose-input-wrap {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px; align-items: center;
  padding: 8px 10px 8px 14px;
  background: #fff;
  border: 1px solid var(--rule-strong);
  border-radius: 8px;
  transition: border-color .12s, box-shadow .12s;
}
.compose-input-wrap:focus-within {
  border-color: var(--ink);
  box-shadow: 0 0 0 3px oklch(0.88 0.04 75);
}
.compose-icon { color: var(--ink-3); flex-shrink: 0; }
#compose-url {
  font-family: var(--font-sans); font-size: 15px;
  color: var(--ink); background: none; border: none; outline: none;
  min-width: 0; width: 100%;
  padding: 6px 0;
}
#compose-url::placeholder { color: var(--ink-4); }
#compose-url:disabled { color: var(--ink-3); }

.compose-status {
  font-size: 13px; color: var(--ink-3); min-height: 20px;
  line-height: 1.5;
}
.compose-status.loading { color: var(--ink-2); }
.compose-status.success { color: oklch(0.4 0.12 145); }
.compose-status.error { color: oklch(0.45 0.15 28); }
.compose-status .ok { color: oklch(0.55 0.14 145); font-weight: 600; margin-right: 4px; }
.compose-status a { color: var(--ink); border-bottom: 1px solid var(--rule-strong); }
.compose-status .spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid var(--rule);
  border-top-color: var(--ink);
  border-radius: 50%;
  animation: compose-spin .8s linear infinite;
  vertical-align: -2px; margin-right: 6px;
}
@keyframes compose-spin { to { transform: rotate(360deg); } }

.btn.pri {
  background: var(--ink); color: #fff;
  padding: 9px 16px; border: none; border-radius: 6px;
  font-family: var(--font-sans); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: background .12s;
  white-space: nowrap;
}
.btn.pri:hover { background: #000; }
.btn.pri:disabled { background: var(--ink-3); cursor: wait; }

.sec { margin: 0 0 80px; }
.sec-hd {
  display: flex; align-items: baseline; gap: 18px;
  padding-bottom: 14px; border-bottom: 1px solid var(--rule);
  margin-bottom: 28px;
}
.sec-hd .num {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.14em; color: var(--ink-3); text-transform: uppercase;
}
.sec-hd h2 {
  font-family: var(--font-sans); font-size: 28px;
  font-weight: 600; letter-spacing: -0.02em; margin: 0;
}
.sec-hd .desc {
  margin-left: auto; color: var(--ink-3);
  font-size: 12.5px; max-width: 360px; text-align: right;
}

.digest-list {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;
}
.digest-card {
  display: flex; flex-direction: column; gap: 16px;
  border: 1px solid var(--rule); border-radius: 10px;
  padding: 24px 26px; transition: border-color .12s, transform .12s;
  background: #fff;
}
.digest-card:hover {
  border-color: var(--ink); transform: translateY(-2px);
}
.dc-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
}
.dc-date-block { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.dc-date {
  font-family: var(--font-sans); font-size: 18px;
  font-weight: 600; letter-spacing: -0.015em; color: var(--ink);
}
.dc-time { font-size: 12px; color: var(--ink-3); }
.dc-relative { font-size: 11px; color: var(--ink-3); }

.dc-stats { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; padding: 3px 10px; border-radius: 999px;
  background: var(--bg-tint); color: var(--ink-2); font-weight: 500;
}
.chip.accent { background: var(--accent-bg); color: var(--accent-ink); }
.chip.neutral { background: #fff; color: var(--ink-3); border: 1px solid var(--rule); }

.dc-preview {
  list-style: none; padding: 12px 0 0; margin: 0;
  border-top: 1px solid var(--rule);
  display: flex; flex-direction: column; gap: 6px;
}
.dc-preview li {
  display: grid; grid-template-columns: 90px 1fr; gap: 10px;
  font-size: 12.5px; line-height: 1.5; color: var(--ink-2);
}
.pv-channel {
  font-size: 10.5px; color: var(--ink-3);
  letter-spacing: 0.05em; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
  padding-top: 2px;
}
.pv-head {
  color: var(--ink); font-weight: 500; letter-spacing: -0.01em;
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
}
.pv-more { color: var(--ink-3); font-size: 11px; grid-column: 1 / -1; }

.dc-cta {
  margin-top: auto; font-size: 11px; color: var(--ink-3);
  letter-spacing: 0.04em;
}
.digest-card:hover .dc-cta { color: var(--ink); }

.empty {
  padding: 100px 0; text-align: center;
  border: 1px dashed var(--rule); border-radius: 10px;
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
.empty code {
  font-size: 13px; padding: 2px 8px; background: var(--bg-tint);
  border-radius: 4px; color: var(--ink);
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
  .masthead h1 { font-size: 35px; }
  .masthead .lead { font-size: 17px; }
  .stat-row { gap: 24px; }
  .digest-list { grid-template-columns: 1fr; }
  .compose { padding: 24px 20px; }
  .compose-input-wrap { grid-template-columns: auto 1fr; gap: 8px; }
  .compose-input-wrap .btn.pri { grid-column: 1 / -1; padding: 11px 16px; }
}
`;
}
