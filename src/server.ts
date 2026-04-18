import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { summarizeSingleUrl } from "./solo.js";
import { regenerateLanding } from "./landing.js";
import {
  buildAuthUrl,
  exchangeCodeForToken,
  isKakaoConfigured,
} from "./kakao.js";

const PORT = Number(process.env.PORT ?? 3000);
const KAKAO_REDIRECT_URI = `http://localhost:${PORT}/auth/kakao/callback`;

const app = new Hono();

app.get("/auth/kakao", (c) => {
  if (!isKakaoConfigured()) {
    return c.text(
      "KAKAO_REST_API_KEY가 .env에 없습니다. 카카오 디벨로퍼스에서 발급 후 재시작하세요.",
      500,
    );
  }
  const authUrl = buildAuthUrl(KAKAO_REDIRECT_URI);
  return c.redirect(authUrl);
});

app.get("/auth/kakao/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");
  if (error) {
    return c.text(`카카오 인증 오류: ${error}`, 400);
  }
  if (!code) {
    return c.text("code 파라미터가 없습니다.", 400);
  }
  try {
    const token = await exchangeCodeForToken(code, KAKAO_REDIRECT_URI);
    return c.html(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>카카오 연결 완료</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:80px auto;padding:0 20px;color:#1A1814;line-height:1.6}
h1{font-size:28px;letter-spacing:-0.02em}code{background:#F5F2EC;padding:2px 8px;border-radius:4px;font-family:ui-monospace}
.ok{color:#2a7d4a}.meta{color:#8A847C;font-size:14px;margin:24px 0}</style>
</head><body>
<h1 class="ok">✓ 카카오 연결 완료</h1>
<p>refresh_token이 <code>state/kakao-token.json</code>에 저장됐어요.</p>
<p class="meta">만료: ${new Date(token.refreshTokenExpiresAt).toLocaleString("ko-KR")}</p>
<p><b>.env에도 백업하세요</b> (토큰 캐시 파일이 날아가도 복구 가능):</p>
<pre style="background:#F5F2EC;padding:16px;border-radius:8px;font-size:13px;overflow:auto">KAKAO_REFRESH_TOKEN=${token.refreshToken}</pre>
<p><a href="/">← 랜딩으로</a></p>
</body></html>`);
  } catch (err) {
    return c.text(`토큰 교환 실패: ${(err as Error).message}`, 500);
  }
});

app.post("/api/summarize", async (c) => {
  let body: { url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON body가 필요합니다." }, 400);
  }
  const url = body.url?.trim();
  if (!url) {
    return c.json({ error: "url 필드가 필요합니다." }, 400);
  }

  try {
    console.log(`[API] summarize: ${url}`);
    const result = await summarizeSingleUrl(url);
    console.log(`  ✓ ${result.headline}`);
    return c.json({
      ok: true,
      slug: result.slug,
      digestUrl: `/digest/${result.slug}.html`,
      headline: result.headline,
      channelName: result.channelName,
      videoTitle: result.videoTitle,
      stockCount: result.stockCount,
    });
  } catch (err) {
    console.error(`  ✗ 실패:`, (err as Error).message);
    return c.json({ error: (err as Error).message }, 500);
  }
});

app.use("/*", serveStatic({ root: "./public" }));
app.get("/", serveStatic({ path: "./public/index.html" }));

async function main() {
  try {
    await regenerateLanding();
  } catch (err) {
    console.warn("랜딩 초기 재생성 실패:", (err as Error).message);
  }

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`\n  Tubelet 서버 실행 중 → http://localhost:${info.port}\n`);
  });
}

main();
