import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { summarizeSingleUrl } from "./solo.js";
import { regenerateLanding } from "./landing.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = new Hono();

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
