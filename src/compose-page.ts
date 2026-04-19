export function renderComposePage(): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Compose · Tubelet</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<style>
${composeStyles()}
</style>
</head>
<body>
<div class="page">

  <div class="top">
    <a class="top-home" href="/" aria-label="홈으로">
      <div class="mark" aria-hidden="true"></div>
      <div class="brand">Tubelet<em>.</em></div>
    </a>
    <span class="v">Compose · 링크로 즉시 요약</span>
    <nav class="top-nav">
      <a href="/" class="nav-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        아카이브
      </a>
    </nav>
  </div>

  <header class="masthead">
    <div class="eyebrow">Tubelet / Compose</div>
    <h1>링크 하나로<br /><em>바로 요약.</em></h1>
    <p class="lead">YouTube URL을 붙여넣으면 Claude가 자막을 읽고 핵심을 정리해 드려요.</p>
  </header>

  <section class="compose-section">
    <form id="compose-form" class="compose-form">
      <div class="compose-input-wrap">
        <svg class="compose-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        <input
          id="compose-url"
          name="url"
          type="url"
          placeholder="https://www.youtube.com/watch?v=... 또는 https://youtu.be/..."
          required
          autocomplete="off"
          spellcheck="false"
          autofocus
        />
        <button type="submit" class="btn pri" id="compose-btn">정리하기</button>
      </div>
      <div id="compose-status" class="compose-status" role="status" aria-live="polite"></div>
    </form>

    <div class="hint-row">
      <div class="hint">
        <div class="hint-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        </div>
        <p>자막이 있는 영상은 30초~1분, 없으면 영상 설명 기반으로 요약합니다.</p>
      </div>
      <div class="hint">
        <div class="hint-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <p>카카오톡이 연동돼 있으면 요약 완료 즉시 '나와의 채팅'으로 전송됩니다.</p>
      </div>
    </div>
  </section>

  <footer class="foot">
    <span>Tubelet · Personal Digest</span>
    <span>·</span>
    <a href="/" class="mono foot-link">아카이브로 →</a>
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
  const btn = document.getElementById('compose-btn');
  if (!form || !input || !status || !btn) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    btn.disabled = true;
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
        '<span class="ok-dot"></span> <b>' + esc(data.headline) + '</b> — 요약 완료. 잠시 후 이동합니다.';

      setTimeout(function () {
        window.location.href = data.digestUrl;
      }, 1200);
    } catch (err) {
      status.className = 'compose-status error';
      status.textContent = '오류: ' + (err.message || String(err));
      btn.disabled = false;
      input.disabled = false;
    }
  });

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
`;
}

function composeStyles(): string {
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

.page { max-width: 780px; margin: 0 auto; padding: 56px 40px 120px; }

.top { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
.top-home { display: flex; align-items: center; gap: 14px; color: inherit; }
.mark {
  width: 26px; height: 26px; background: var(--ink);
  border-radius: 7px; display: inline-grid; place-items: center;
  color: #fff;
}
.mark::before {
  content: '';
  width: 0; height: 0;
  border-left: 7px solid currentColor;
  border-top: 4.5px solid transparent;
  border-bottom: 4.5px solid transparent;
  margin-left: 2px;
}
.brand { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
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
  border-radius: 6px; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: border-color .12s, background .12s;
}
.nav-btn:hover { border-color: var(--ink); background: var(--bg-tint); }
.nav-btn svg { color: var(--ink-2); }

.masthead {
  margin: 28px 0 56px; padding-bottom: 40px;
  border-bottom: 1px solid var(--rule);
}
.eyebrow {
  font-family: var(--font-mono); font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3);
}
.masthead h1 {
  font-size: 51px; font-weight: 700;
  letter-spacing: -0.03em; line-height: 1;
  margin: 14px 0 14px;
}
.masthead h1 em { font-style: italic; color: var(--ink-3); font-weight: 500; }
.masthead .lead {
  font-size: 19px; font-weight: 500; line-height: 1.5;
  color: var(--ink-2); max-width: 560px; margin: 0;
}

.compose-section { margin: 0 0 80px; }

.compose-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 40px; }

.compose-input-wrap {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px; align-items: center;
  padding: 10px 12px 10px 16px;
  border: 1px solid var(--rule-strong);
  border-radius: 10px;
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
  min-width: 0; width: 100%; padding: 6px 0;
}
#compose-url::placeholder { color: var(--ink-4); }
#compose-url:disabled { color: var(--ink-3); }

.compose-status {
  font-size: 13px; color: var(--ink-3); min-height: 22px; line-height: 1.5;
  display: flex; align-items: center; gap: 6px;
}
.compose-status.loading { color: var(--ink-2); }
.compose-status.success { color: oklch(0.38 0.12 145); }
.compose-status.error { color: oklch(0.45 0.15 28); }
.compose-status .ok-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: oklch(0.55 0.14 145); flex-shrink: 0;
}
.compose-status .spinner {
  display: inline-block; width: 13px; height: 13px;
  border: 2px solid var(--rule); border-top-color: var(--ink);
  border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.btn.pri {
  background: var(--ink); color: #fff;
  padding: 10px 20px; border: none; border-radius: 6px;
  font-family: var(--font-sans); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: background .12s; white-space: nowrap;
}
.btn.pri:hover { background: #000; }
.btn.pri:disabled { background: var(--ink-3); cursor: wait; }

.hint-row {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  padding-top: 32px; border-top: 1px solid var(--rule);
}
.hint {
  display: flex; gap: 12px; align-items: flex-start;
}
.hint-icon {
  width: 28px; height: 28px; border-radius: 6px;
  background: var(--bg-tint); display: inline-grid;
  place-items: center; flex-shrink: 0; color: var(--ink-3);
}
.hint p {
  margin: 0; font-size: 13px; color: var(--ink-3); line-height: 1.55;
}

.foot {
  margin-top: 80px; padding-top: 24px;
  border-top: 1px solid var(--rule);
  display: flex; gap: 14px; color: var(--ink-3);
  font-size: 12px; align-items: center;
}
.foot-link { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
.foot-link:hover { color: var(--ink); }
.mono { font-family: var(--font-mono); }

@media (max-width: 640px) {
  .page { padding: 36px 20px 80px; }
  .top .v { display: none; }
  .masthead h1 { font-size: 35px; }
  .masthead .lead { font-size: 16px; }
  .compose-input-wrap { grid-template-columns: auto 1fr; }
  .compose-input-wrap .btn.pri { grid-column: 1 / -1; padding: 12px 20px; }
  .hint-row { grid-template-columns: 1fr; }
}
`;
}
