import "dotenv/config";
import { db } from "../src/db.js";
import { loadChannels } from "../src/config.js";
import { fetchChannelVideos } from "../src/youtube.js";
import { fetchTranscript } from "../src/transcript.js";
import { summarizeVideo } from "../src/summarize.js";
import { renderDigest, type DigestItem } from "../src/html.js";
import { saveDigestHtml } from "../src/save.js";
import { loadState, markSeen, saveState } from "../src/state.js";
import { isKakaoConfigured, sendDigestToKakao } from "../src/kakao.js";

const FETCH_COUNT = 20;
// 오늘(KST 기준 2026-04-20 00:00) = UTC 2026-04-19T15:00:00Z
const TODAY_CUTOFF = new Date("2026-04-19T15:00:00Z").getTime();

async function main() {
  const channels = await loadChannels();
  const state = await loadState();
  const seen = new Set(state.seenVideoIds);

  // tube_videos에 이미 있는 video_id 조회
  const { data: existing } = await db.from("tube_videos").select("video_id");
  const inDb = new Set((existing ?? []).map((r) => r.video_id as string));

  const toProcess = [];

  for (const channel of channels) {
    console.log(`\n[${channel.name}] 최근 ${FETCH_COUNT}개 조회...`);
    const videos = await fetchChannelVideos(channel.id, FETCH_COUNT);
    const missing = videos.filter((v) => {
      if (inDb.has(v.videoId)) return false;
      const ts = v.publishedAt ? Date.parse(v.publishedAt) : 0;
      return ts >= TODAY_CUTOFF;
    });
    console.log(`  → ${videos.length}개 중 DB 미존재 ${missing.length}개`);
    toProcess.push(...missing);
  }

  if (toProcess.length === 0) {
    console.log("\n누락된 영상 없음.");
    return;
  }

  console.log(`\n=== 백필 시작 (${toProcess.length}개) ===`);
  const digest: DigestItem[] = [];

  for (const video of toProcess) {
    console.log(`\n• [${video.channelName}] ${video.title}`);
    const transcript = await fetchTranscript(video.videoId);
    console.log(`  자막: ${transcript ? `${transcript.lang} ${transcript.segmentCount}세그` : "없음"}`);
    try {
      const summary = await summarizeVideo(video, transcript);
      console.log(`  ✓ ${summary.headline}`);
      digest.push({ video, summary, hadTranscript: transcript !== null });
    } catch (err) {
      console.error(`  ✗ 요약 실패:`, (err as Error).message);
    }
  }

  if (digest.length === 0) return;

  const html = renderDigest(digest);
  const saved = await saveDigestHtml(html, digest);
  console.log(`\n✓ 저장: ${saved.slug}`);

  const siteBase = process.env.SITE_URL ?? "http://localhost:3000";
  const digestUrl = `${siteBase}/digest/${saved.slug}`;

  if (isKakaoConfigured()) {
    await sendDigestToKakao(digest, digestUrl).catch((e) => console.error("카톡 실패:", e.message));
    console.log("✓ 카톡 전송");
  }

  const updated = markSeen(state, digest.map((d) => d.video.videoId));
  await saveState(updated);
  console.log(`✓ state 저장 (누적 ${updated.seenVideoIds.length}개)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
