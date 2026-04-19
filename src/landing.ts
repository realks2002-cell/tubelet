import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "./db.js";
import { loadAllMetas, type DigestMeta } from "./save.js";
import { channelSlug, regenerateChannelPages } from "./channel-pages.js";

const INDEX_PATH = resolve("public/index.html");

interface ActiveChannel {
  id: string;
  name: string;
}

interface ChannelSummary {
  name: string;
  videoCount: number;
  digestCount: number;
  latestDate: string;
  latestHeadline: string;
  latestSlug: string;
  latestVideoId: string;
}

export async function regenerateLanding(): Promise<string> {
  const metas = await loadAllMetas();
  metas.sort((a, b) => (a.slug < b.slug ? 1 : -1));

  const activeChannels = await loadActiveChannels();
  await regenerateChannelPages(metas);
  const html = renderLanding(metas, activeChannels);
  await writeFile(INDEX_PATH, html, "utf8");
  return INDEX_PATH;
}

async function loadActiveChannels(): Promise<ActiveChannel[]> {
  const { data, error } = await db
    .from("tube_channels")
    .select("id, name")
    .eq("enabled", true);
  if (error) throw new Error(`tube_channels 조회 실패: ${error.message}`);
  return (data ?? []) as ActiveChannel[];
}

function aggregateChannels(metas: DigestMeta[]): ChannelSummary[] {
  const byName = new Map<string, ChannelSummary>();
  for (const m of metas) {
    const seenInThisDigest = new Set<string>();
    for (const h of m.headlines) {
      seenInThisDigest.add(h.channelName);
      if (!byName.has(h.channelName)) {
        byName.set(h.channelName, {
          name: h.channelName,
          videoCount: 0,
          digestCount: 0,
          latestDate: m.generatedAt,
          latestHeadline: h.headline,
          latestSlug: m.slug,
          latestVideoId: h.videoId,
        });
      }
      byName.get(h.channelName)!.videoCount += 1;
    }
    for (const c of seenInThisDigest) {
      byName.get(c)!.digestCount += 1;
    }
  }
  return [...byName.values()].sort(
    (a, b) => Date.parse(b.latestDate) - Date.parse(a.latestDate),
  );
}


function renderLanding(
  metas: DigestMeta[],
  activeChannels: ActiveChannel[],
): string {
  const latestItems = metas.slice(0, 20);
  const totalVideos = metas.reduce((sum, m) => sum + m.videoCount, 0);
  const totalDigests = metas.length;
  const channelSummaries = aggregateChannels(metas);
  const allChannelNames = new Set<string>([
    ...channelSummaries.map((c) => c.name),
    ...activeChannels.map((c) => c.name),
  ]);

  const digestCards = latestItems.map(renderDigestCard).join("\n");
  const channelCards = renderChannelsSection(channelSummaries, activeChannels);

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
    <a class="top-home" href="/" aria-label="홈으로">
      <div class="mark" aria-hidden="true"></div>
      <div class="brand">Tubelet<em>.</em></div>
    </a>
    <span class="v">Archive · 개인 다이제스트</span>
    <nav class="top-nav">
      <a href="/compose" class="nav-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        Compose
      </a>
      <button type="button" class="nav-btn" id="channels-menu-btn" aria-haspopup="dialog" aria-expanded="false">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
        채널 관리
      </button>
    </nav>
  </div>

  <header class="masthead">
    <div class="eyebrow">Tubelet / Personal Archive</div>
    <h1>매거진을 읽듯,<br /><em>하루를 시작해요.</em></h1>
    <p class="lead">구독 채널의 새 영상을 매시간 요약해 모아둔 아카이브.</p>
    <div class="stat-row">
      <div class="stat"><span class="k">Digests</span><span class="v">${totalDigests}개</span></div>
      <div class="stat"><span class="k">Videos</span><span class="v">${totalVideos}편</span></div>
      <div class="stat"><span class="k">Channels</span><span class="v">${allChannelNames.size}곳</span></div>
    </div>
  </header>

  ${channelCards}

  ${totalDigests === 0 ? renderEmpty() : `
  <section class="sec" id="recent">
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

${renderChannelsModal(activeChannels, channelSummaries)}

<script>
${channelsScript()}
</script>
</body>
</html>`;
}

function renderChannelsSection(
  summaries: ChannelSummary[],
  active: ActiveChannel[],
): string {
  const activeNames = new Set(active.map((c) => c.name));
  const cards = summaries.map((s) => renderChannelCard(s, activeNames.has(s.name)));
  const pendingActive = active.filter(
    (a) => !summaries.find((s) => s.name === a.name),
  );
  const pendingCards = pendingActive.map(renderPendingChannelCard);
  const all = [...cards, ...pendingCards];
  if (all.length === 0) return "";

  return `<section class="sec" id="channels">
    <div class="sec-hd">
      <div class="num">Channels</div>
      <h2>채널별로 보기</h2>
      <div class="desc">각 채널의 가장 최근 요약으로 바로 이동해요.</div>
    </div>
    <div class="channel-grid">
      ${all.join("\n")}
    </div>
  </section>`;
}

function renderChannelCard(s: ChannelSummary, isActive: boolean): string {
  const d = new Date(s.latestDate);
  const dateLabel = formatDate(d);
  const relative = formatRelative(d);
  const href = `/channel/${channelSlug(s.name)}`;
  const theme = channelTheme(s.name);
  return `<a class="channel-card cc-t${theme}" href="${href}">
    <div class="cc-head">
      <div class="cc-avatar" aria-hidden="true">${escapeHtml(initials(s.name))}</div>
      <div class="cc-title">
        <span class="cc-name">${escapeHtml(s.name)}</span>
        ${isActive ? '<span class="cc-dot" title="구독 중" aria-hidden="true"></span>' : ""}
      </div>
    </div>
    <div class="cc-headline">${escapeHtml(s.latestHeadline)}</div>
    <div class="cc-meta">
      <span class="mono">${dateLabel}</span>
      <span class="sep">·</span>
      <span class="mono">${relative}</span>
      <span class="sp"></span>
      <span class="mono">${s.videoCount}편</span>
    </div>
    <div class="cc-cta mono">채널 보기 →</div>
  </a>`;
}

function renderPendingChannelCard(c: ActiveChannel): string {
  const theme = channelTheme(c.name);
  return `<div class="channel-card channel-card--pending cc-t${theme}">
    <div class="cc-head">
      <div class="cc-avatar cc-avatar--dim" aria-hidden="true">${escapeHtml(initials(c.name))}</div>
      <div class="cc-title">
        <span class="cc-name">${escapeHtml(c.name)}</span>
        <span class="cc-dot" title="구독 중" aria-hidden="true"></span>
      </div>
    </div>
    <div class="cc-headline cc-headline--muted">아직 요약된 영상이 없습니다.</div>
    <div class="cc-meta">
      <span class="mono">Watching</span>
    </div>
    <div class="cc-cta mono">대기 중</div>
  </div>`;
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const match = trimmed.match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? "?").toUpperCase();
}

function channelTheme(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 6;
}

function renderChannelsModal(
  active: ActiveChannel[],
  summaries: ChannelSummary[],
): string {
  const byName = new Map(summaries.map((s) => [s.name, s]));
  const listItems = active
    .map((c) => {
      const s = byName.get(c.name);
      const meta = s
        ? `${s.videoCount}편 · ${formatRelative(new Date(s.latestDate))}`
        : "대기 중";
      return `<li class="ch-item">
        <span class="ch-avatar" aria-hidden="true">${escapeHtml(initials(c.name))}</span>
        <span class="ch-text">
          <span class="ch-name">${escapeHtml(c.name)}</span>
          <span class="ch-meta mono">${escapeHtml(c.id)}</span>
        </span>
        <span class="ch-stat mono">${escapeHtml(meta)}</span>
      </li>`;
    })
    .join("");

  return `<div class="modal" id="channels-modal" role="dialog" aria-modal="true" aria-labelledby="channels-modal-title" hidden>
  <div class="modal-backdrop" data-close></div>
  <div class="modal-panel" role="document">
    <div class="modal-head">
      <div>
        <div class="eyebrow">Channels</div>
        <h3 id="channels-modal-title">구독 채널 관리</h3>
      </div>
      <button type="button" class="modal-close" data-close aria-label="닫기">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>

    <div class="modal-body">
      <div class="ch-section">
        <div class="ch-section-hd">
          <span class="t-label">현재 구독 (${active.length})</span>
        </div>
        ${listItems ? `<ul class="ch-list">${listItems}</ul>` : '<p class="ch-empty">아직 채널이 없어요.</p>'}
      </div>

      <form id="channel-add-form" class="ch-add-form">
        <div class="ch-section-hd">
          <span class="t-label">새 채널 추가</span>
        </div>
        <label class="ch-field">
          <span class="ch-label mono">채널 URL 또는 ID</span>
          <input
            id="channel-input"
            name="channelInput"
            type="text"
            placeholder="https://www.youtube.com/channel/UC... 또는 UCxxxxxxxxx"
            required
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <label class="ch-field">
          <span class="ch-label mono">표시 이름 (선택)</span>
          <input
            id="channel-name-input"
            name="channelName"
            type="text"
            placeholder="비워두면 YouTube 채널명 그대로 사용"
            autocomplete="off"
          />
        </label>
        <div class="ch-form-foot">
          <div id="channel-add-status" class="ch-status mono" role="status" aria-live="polite"></div>
          <button type="submit" class="btn pri">추가</button>
        </div>
      </form>
    </div>
  </div>
</div>`;
}

function channelsScript(): string {
  return `
(function () {
  const openBtn = document.getElementById('channels-menu-btn');
  const modal = document.getElementById('channels-modal');
  if (!openBtn || !modal) return;

  function open() {
    modal.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const first = modal.querySelector('input');
    if (first) first.focus();
  }
  function close() {
    modal.hidden = true;
    openBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  openBtn.addEventListener('click', open);
  modal.addEventListener('click', function (e) {
    const t = e.target;
    if (t instanceof Element && t.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  const form = document.getElementById('channel-add-form');
  const input = document.getElementById('channel-input');
  const nameInput = document.getElementById('channel-name-input');
  const status = document.getElementById('channel-add-status');
  if (!form || !input || !status) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const value = input.value.trim();
    const name = nameInput ? nameInput.value.trim() : '';
    if (!value) return;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    input.disabled = true;
    if (nameInput) nameInput.disabled = true;
    status.className = 'ch-status mono loading';
    status.textContent = '추가하는 중…';

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: value, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '추가 실패');

      status.className = 'ch-status mono success';
      status.textContent = '✓ ' + (data.message || '채널을 추가했어요.');
      setTimeout(function () { window.location.reload(); }, 1500);
    } catch (err) {
      status.className = 'ch-status mono error';
      status.textContent = '✗ ' + (err.message || String(err));
      btn.disabled = false;
      input.disabled = false;
      if (nameInput) nameInput.disabled = false;
    }
  });
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

  return `<a class="digest-card" href="/digest/${meta.slug}">
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

.top { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
.top-home {
  display: flex; align-items: center; gap: 14px;
  color: inherit; text-decoration: none;
}
.top-home:hover .brand { color: var(--ink); }
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
.top-nav { display: flex; align-items: center; gap: 8px; }
.nav-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border: 1px solid var(--rule-strong);
  background: #fff; color: var(--ink);
  border-radius: 6px; font-family: var(--font-sans);
  font-size: 13px; font-weight: 500;
  cursor: pointer; transition: border-color .12s, background .12s;
}
.nav-btn:hover { border-color: var(--ink); background: var(--bg-tint); }
.nav-btn svg { color: var(--ink-2); }

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

/* Channel cards */
.channel-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
}
.cc-t0 { --ch-stripe: oklch(0.72 0.14 75);  --ch-bg: oklch(0.95 0.04 80);  --ch-ink: oklch(0.32 0.10 60); }
.cc-t1 { --ch-stripe: oklch(0.68 0.11 180); --ch-bg: oklch(0.95 0.03 190); --ch-ink: oklch(0.35 0.08 195); }
.cc-t2 { --ch-stripe: oklch(0.67 0.13 25);  --ch-bg: oklch(0.95 0.03 30);  --ch-ink: oklch(0.36 0.10 25); }
.cc-t3 { --ch-stripe: oklch(0.67 0.10 140); --ch-bg: oklch(0.95 0.03 140); --ch-ink: oklch(0.34 0.08 140); }
.cc-t4 { --ch-stripe: oklch(0.66 0.11 280); --ch-bg: oklch(0.95 0.03 280); --ch-ink: oklch(0.36 0.08 280); }
.cc-t5 { --ch-stripe: oklch(0.66 0.10 240); --ch-bg: oklch(0.95 0.03 240); --ch-ink: oklch(0.34 0.08 240); }
.channel-card {
  display: flex; flex-direction: column; gap: 12px;
  padding: 20px 22px 20px 26px; border: 1px solid var(--rule);
  border-radius: 10px; background: #fff;
  transition: border-color .12s, transform .12s;
  color: inherit; min-height: 170px;
  position: relative; overflow: hidden;
}
.channel-card::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0;
  width: 4px; background: var(--ch-stripe, var(--accent));
  transition: width .12s;
}
.channel-card:hover {
  border-color: var(--ink); transform: translateY(-2px);
}
.channel-card:hover::before { width: 6px; }
.channel-card--pending { cursor: default; opacity: 0.75; }
.channel-card--pending:hover { border-color: var(--rule); transform: none; }
.channel-card--pending:hover::before { width: 4px; }
.cc-head { display: flex; align-items: center; gap: 10px; }
.cc-avatar {
  width: 34px; height: 34px; border-radius: 999px;
  background: var(--ch-bg, var(--accent-bg));
  color: var(--ch-ink, var(--accent-ink));
  display: inline-grid; place-items: center;
  font-family: var(--font-sans); font-size: 14px; font-weight: 600;
  flex-shrink: 0;
}
.cc-avatar--dim { background: var(--bg-tint); color: var(--ink-3); }
.cc-title {
  display: flex; align-items: center; gap: 6px;
  min-width: 0; flex: 1;
}
.cc-name {
  font-family: var(--font-sans); font-size: 14.5px; font-weight: 600;
  letter-spacing: -0.01em; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0;
}
.cc-dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 999px;
  background: var(--accent); flex-shrink: 0;
}
.cc-headline {
  font-family: var(--font-sans); font-size: 13.5px;
  line-height: 1.45; color: var(--ink-2);
  overflow: hidden; text-overflow: ellipsis;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.cc-headline--muted { color: var(--ink-4); }
.cc-meta {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: var(--ink-3);
}
.cc-meta .sep { color: var(--ink-4); }
.cc-meta .sp { flex: 1; }
.cc-cta {
  margin-top: auto; font-size: 11px; color: var(--ink-3);
  letter-spacing: 0.04em; padding-top: 4px;
}
.channel-card:not(.channel-card--pending):hover .cc-cta { color: var(--ink); }

/* Modal */
.modal {
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  padding: 40px 20px;
}
.modal[hidden] { display: none; }
.modal-backdrop {
  position: absolute; inset: 0;
  background: rgba(26, 24, 20, 0.48);
  backdrop-filter: blur(2px);
}
.modal-panel {
  position: relative; background: #fff;
  border-radius: 14px; max-width: 540px; width: 100%;
  max-height: calc(100vh - 80px); overflow-y: auto;
  box-shadow: 0 20px 60px -10px rgba(0,0,0,.2);
}
.modal-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 24px 28px 16px; border-bottom: 1px solid var(--rule);
  gap: 16px;
}
.modal-head .eyebrow {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ink-3); margin-bottom: 4px;
}
.modal-head h3 {
  font-family: var(--font-sans); font-size: 20px;
  font-weight: 600; letter-spacing: -0.02em; margin: 0;
}
.modal-close {
  background: none; border: none; padding: 4px;
  color: var(--ink-3); cursor: pointer; border-radius: 6px;
  display: inline-flex;
}
.modal-close:hover { background: var(--bg-tint); color: var(--ink); }
.modal-body { padding: 20px 28px 28px; }

.ch-section { margin-bottom: 24px; }
.ch-section:last-child { margin-bottom: 0; }
.ch-section-hd { margin-bottom: 10px; }
.t-label {
  font-family: var(--font-mono); font-size: 10.5px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ink-3);
}

.ch-list { list-style: none; padding: 0; margin: 0; }
.ch-item {
  display: grid; grid-template-columns: 28px 1fr auto; gap: 12px;
  align-items: center; padding: 10px 0;
  border-bottom: 1px solid var(--rule);
}
.ch-item:last-child { border-bottom: none; }
.ch-avatar {
  width: 28px; height: 28px; border-radius: 999px;
  background: var(--accent-bg); color: var(--accent-ink);
  display: inline-grid; place-items: center;
  font-family: var(--font-sans); font-size: 12px; font-weight: 600;
}
.ch-text {
  display: flex; flex-direction: column; gap: 2px;
  min-width: 0;
}
.ch-name {
  font-family: var(--font-sans); font-size: 13.5px;
  font-weight: 500; color: var(--ink);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ch-meta {
  font-size: 10.5px; color: var(--ink-3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ch-stat { font-size: 11px; color: var(--ink-3); }
.ch-empty { color: var(--ink-3); font-size: 13px; margin: 0; }

.ch-add-form { padding-top: 20px; border-top: 1px solid var(--rule); }
.ch-field {
  display: flex; flex-direction: column; gap: 5px;
  margin-bottom: 12px;
}
.ch-label {
  font-size: 10.5px; color: var(--ink-3);
  letter-spacing: 0.08em; text-transform: uppercase;
}
.ch-field input {
  font-family: var(--font-sans); font-size: 14px;
  color: var(--ink); background: #fff;
  border: 1px solid var(--rule-strong); border-radius: 6px;
  padding: 9px 12px; outline: none;
  transition: border-color .12s, box-shadow .12s;
}
.ch-field input:focus {
  border-color: var(--ink);
  box-shadow: 0 0 0 3px oklch(0.88 0.04 75);
}
.ch-field input:disabled {
  background: var(--bg-tint); color: var(--ink-3);
}
.ch-form-foot {
  display: flex; align-items: center; gap: 12px;
  margin-top: 14px;
}
.ch-status { flex: 1; font-size: 12px; color: var(--ink-3); line-height: 1.5; }
.ch-status.loading { color: var(--ink-2); }
.ch-status.success { color: oklch(0.4 0.12 145); }
.ch-status.error { color: oklch(0.45 0.15 28); }

@media (max-width: 720px) {
  .page { padding: 36px 20px 80px; }
  .top .v { display: none; }
  .masthead h1 { font-size: 35px; }
  .masthead .lead { font-size: 17px; }
  .stat-row { gap: 24px; }
  .digest-list { grid-template-columns: 1fr; }
  .channel-grid { grid-template-columns: 1fr; }
  .modal { padding: 20px 12px; }
  .modal-body { padding: 20px 20px 24px; }
  .modal-head { padding: 20px 20px 14px; }
}
@media (min-width: 721px) and (max-width: 900px) {
  .channel-grid { grid-template-columns: repeat(2, 1fr); }
}
`;
}
