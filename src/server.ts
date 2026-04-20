import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { db } from "./db.js";
import { renderDigest, type DigestItem } from "./html.js";
import { renderChannelPageFromDb, channelSlug } from "./channel-pages.js";
import { regenerateLanding } from "./landing.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildAuthUrl, exchangeCodeForToken, isKakaoConfigured } from "./kakao.js";
import { renderComposePage } from "./compose-page.js";
import { extractVideoId, fetchVideoById } from "./youtube.js";
import { fetchTranscript } from "./transcript.js";
import { summarizeVideo } from "./summarize.js";
import { isKakaoConfigured as kakaoOk, sendDigestToKakao } from "./kakao.js";
import type { StockItem } from "./summarize.js";

const PORT = Number(process.env.PORT ?? 3000);
const KAKAO_REDIRECT_URI = `http://localhost:${PORT}/auth/kakao/callback`;

const app = new Hono();

// 카카오 OAuth
app.get("/auth/kakao", (c) => {
  if (!isKakaoConfigured()) {
    return c.text("KAKAO_REST_API_KEY가 .env에 없습니다.", 500);
  }
  return c.redirect(buildAuthUrl(KAKAO_REDIRECT_URI));
});

app.get("/auth/kakao/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");
  if (error) return c.text(`카카오 인증 오류: ${error}`, 400);
  if (!code) return c.text("code 파라미터가 없습니다.", 400);
  try {
    const token = await exchangeCodeForToken(code, KAKAO_REDIRECT_URI);
    return c.html(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>카카오 연결 완료</title>
<style>body{font-family:-apple-system,sans-serif;max-width:600px;margin:80px auto;padding:0 20px}h1{color:#2a7d4a}pre{background:#F5F2EC;padding:16px;border-radius:8px;overflow:auto}</style>
</head><body>
<h1>✓ 카카오 연결 완료</h1>
<p>.env에 아래 토큰을 저장하세요:</p>
<pre>KAKAO_REFRESH_TOKEN=${token.refreshToken}</pre>
<p><a href="/">← 홈으로</a></p></body></html>`);
  } catch (err) {
    return c.text(`토큰 교환 실패: ${(err as Error).message}`, 500);
  }
});

// Compose 페이지
app.get("/compose", (c) => {
  return c.html(renderComposePage());
});

// 랜딩
app.get("/", async (c) => {
  try {
    const html = await regenerateLanding();
    return c.html(html);
  } catch (err) {
    return c.text((err as Error).message, 500);
  }
});

// 채널 페이지
app.get("/channel/:slug", async (c) => {
  const slug = c.req.param("slug");
  try {
    const { data: channels } = await db.from("tube_channels").select("id, name").eq("enabled", true);
    const channel = (channels ?? []).find((ch) => channelSlug(ch.name as string) === slug);
    if (!channel) return c.text(`채널을 찾을 수 없습니다: ${slug}`, 404);

    const { data: videos } = await db
      .from("tube_videos")
      .select("video_id, video_title, headline, stocks, generated_at")
      .eq("channel_name", channel.name)
      .order("generated_at", { ascending: false });

    return c.html(renderChannelPageFromDb(channel.name as string, videos ?? []));
  } catch (err) {
    return c.text((err as Error).message, 500);
  }
});

// 영상 상세
app.get("/video/:id", async (c) => {
  const videoId = c.req.param("id");
  try {
    const { data: v } = await db.from("tube_videos").select("*").eq("video_id", videoId).single();
    if (!v) return c.text(`영상을 찾을 수 없습니다: ${videoId}`, 404);

    const item: DigestItem = {
      video: {
        videoId,
        title: v.video_title as string,
        description: "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: (v.published_at as string) ?? "",
        channelId: (v.channel_id as string) ?? "",
        channelName: v.channel_name as string,
      },
      summary: {
        headline: (v.headline as string) ?? "",
        summary: (v.deck as string) ?? "",
        keyPoints: ((v.tldr as Array<{ text: string }>) ?? []).map((t) => t.text),
        stocks: (v.stocks as StockItem[]) ?? [],
        topics: (v.chips as string[]) ?? [],
        sentiment: "informative" as const,
      },
      hadTranscript: (v.had_transcript as boolean) ?? false,
    };

    return c.html(renderDigest([item], new Date(v.generated_at as string)));
  } catch (err) {
    return c.text((err as Error).message, 500);
  }
});

// 다이제스트 페이지
app.get("/digest/:slug", async (c) => {
  const slug = c.req.param("slug");
  try {
    const { data: run } = await db
      .from("tube_digest_runs")
      .select("slug, generated_at, video_ids")
      .eq("slug", slug)
      .single();
    if (!run) return c.text(`다이제스트를 찾을 수 없습니다: ${slug}`, 404);

    const videoIds = run.video_ids as string[];
    const { data: videos } = await db.from("tube_videos").select("*").in("video_id", videoIds);
    const videoMap = new Map((videos ?? []).map((v) => [v.video_id as string, v]));

    const items: DigestItem[] = videoIds.map((id) => {
      const v = videoMap.get(id);
      if (!v) return null;
      return {
        video: {
          videoId: id,
          title: v.video_title as string,
          description: "",
          url: `https://www.youtube.com/watch?v=${id}`,
          publishedAt: (v.published_at as string) ?? "",
          channelId: (v.channel_id as string) ?? "",
          channelName: v.channel_name as string,
        },
        summary: {
          headline: (v.headline as string) ?? "",
          summary: (v.deck as string) ?? "",
          keyPoints: ((v.tldr as Array<{ text: string }>) ?? []).map((t) => t.text),
          stocks: (v.stocks as StockItem[]) ?? [],
          topics: (v.chips as string[]) ?? [],
          sentiment: "informative" as const,
        },
        hadTranscript: (v.had_transcript as boolean) ?? false,
      } satisfies DigestItem;
    }).filter(Boolean) as DigestItem[];

    return c.html(renderDigest(items, new Date(run.generated_at as string)));
  } catch (err) {
    return c.text((err as Error).message, 500);
  }
});

// API: 채널 관리
app.get("/api/channels", async (c) => {
  const { data, error } = await db.from("tube_channels").select("id, name, enabled, added_at").order("added_at");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ channels: data });
});

app.post("/api/channels", async (c) => {
  try {
    const body = await c.req.json() as { input?: string; name?: string };
    const rawInput = body.input?.trim();
    if (!rawInput) return c.json({ error: "input 필드가 필요합니다." }, 400);

    const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;
    let channelId: string | null = null;
    if (CHANNEL_ID_RE.test(rawInput)) {
      channelId = rawInput;
    } else {
      try {
        const u = new URL(rawInput);
        const match = u.pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
        if (match) channelId = match[1]!;
      } catch { /* not a URL */ }
    }
    if (!channelId) return c.json({ error: "채널 ID를 인식하지 못했어요." }, 400);

    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return c.json({ error: "YOUTUBE_API_KEY 없음" }, 500);
    const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${key}`);
    const ytData = await ytRes.json() as { items?: Array<{ snippet?: { title?: string } }> };
    const title = ytData.items?.[0]?.snippet?.title;
    if (!title) return c.json({ error: `채널을 찾을 수 없습니다: ${channelId}` }, 404);

    const displayName = body.name?.trim() || title;
    const { error: insertErr } = await db.from("tube_channels").insert({ id: channelId, name: displayName, enabled: true });
    if (insertErr) return c.json({ error: insertErr.message }, 500);
    return c.json({ ok: true, message: `${displayName} 추가됨`, channel: { id: channelId, name: displayName } });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// API: 요약
app.post("/api/summarize", async (c) => {
  let body: { url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "JSON body가 필요합니다." }, 400);
  }
  const url = body.url?.trim();
  if (!url) return c.json({ error: "url 필드가 필요합니다." }, 400);

  const videoId = extractVideoId(url);
  if (!videoId) return c.json({ error: "유효한 YouTube URL이 아닙니다." }, 400);

  try {
    const video = await fetchVideoById(videoId);
    const transcript = await fetchTranscript(videoId);
    const summary = await summarizeVideo(video, transcript);
    const now = new Date();
    const slug = `solo-${toSlug(now)}-${videoId}`;

    const { error: vErr } = await db.from("tube_videos").upsert({
      video_id: videoId,
      channel_id: video.channelId || null,
      channel_name: video.channelName,
      video_title: video.title,
      published_at: video.publishedAt ?? null,
      headline: summary.headline,
      deck: summary.summary,
      tldr: summary.keyPoints.map((text, i) => ({ num: i + 1, text })),
      actions: summary.keyPoints.map((text, i) => ({ num: i + 1, text })),
      stocks: summary.stocks,
      chips: summary.topics ?? [],
      had_transcript: transcript !== null,
      generated_at: now.toISOString(),
    }, { onConflict: "video_id" });
    if (vErr) throw new Error(vErr.message);

    await db.from("tube_digest_runs").upsert({ slug, generated_at: now.toISOString(), video_ids: [videoId] }, { onConflict: "slug" });

    const digestUrl = `/video/${videoId}`;
    const digest: DigestItem[] = [{ video, summary, hadTranscript: transcript !== null }];

    if (kakaoOk()) {
      try {
        const fullUrl = `${process.env.SITE_URL ?? "http://localhost:" + PORT}${digestUrl}`;
        await sendDigestToKakao(digest, fullUrl);
      } catch { /* 카톡 실패 무시 */ }
    }

    return c.json({ ok: true, slug, digestUrl, headline: summary.headline, channelName: video.channelName, videoTitle: video.title, stockCount: summary.stocks.length });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// 정적 파일 (이미지 등)
app.use("/public/*", async (c) => {
  try {
    const path = c.req.path.replace("/public/", "");
    const data = await readFile(resolve("public", path));
    return new Response(data);
  } catch {
    return c.text("Not found", 404);
  }
});

function toSlug(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`\n  Tubelet 서버 실행 중 → http://localhost:${info.port}\n`);
});
