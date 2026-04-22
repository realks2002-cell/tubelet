import "dotenv/config";
import { loadChannels } from "./config.js";
import { loadState, markSeen, saveState } from "./state.js";
import { fetchChannelVideos, type YoutubeVideo } from "./youtube.js";
import { fetchTranscript } from "./transcript.js";
import { summarizeVideo } from "./summarize.js";
import { renderDigest, type DigestItem } from "./html.js";
import { saveDigestHtml } from "./save.js";
import { regenerateLanding } from "./landing.js";
import { isKakaoConfigured, sendDigestToKakao } from "./kakao.js";
import { isEmailConfigured, sendDigestEmail } from "./email.js";

const MAX_AGE_HOURS = 72;

async function main() {
  const channels = await loadChannels();
  if (channels.length === 0) {
    console.log("활성화된 채널이 없습니다. channels.json에서 enabled:true로 설정하세요.");
    return;
  }

  const state = await loadState();
  const seen = new Set(state.seenVideoIds);
  const cutoff = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000;

  const newVideos: YoutubeVideo[] = [];

  for (const channel of channels) {
    console.log(`\n[${channel.name}] 신규 영상 조회 중...`);
    try {
      const videos = await fetchChannelVideos(channel.id);
      let skippedSeen = 0, skippedOld = 0;
      const fresh = videos.filter((v) => {
        if (seen.has(v.videoId)) { skippedSeen++; return false; }
        const ts = v.publishedAt ? Date.parse(v.publishedAt) : 0;
        if (ts < cutoff) { skippedOld++; return false; }
        return true;
      });
      console.log(`  → 전체 ${videos.length}개: 이미처리 ${skippedSeen}개, 오래됨 ${skippedOld}개, 신규 ${fresh.length}개`);
      newVideos.push(...fresh);
    } catch (err) {
      console.error(`  ✗ ${channel.name} 실패:`, (err as Error).message);
    }
  }

  if (newVideos.length === 0) {
    console.log("\n신규 영상 없음. 종료.");
    return;
  }

  console.log(`\n=== 요약 파이프라인 시작 (${newVideos.length}개 영상) ===`);
  const digest: DigestItem[] = [];

  for (const video of newVideos) {
    console.log(`\n• ${video.title}`);
    const transcript = await fetchTranscript(video.videoId);
    if (transcript) {
      console.log(
        `  ✓ 자막 확보 (${transcript.lang}, ${transcript.segmentCount}세그먼트, ${transcript.text.length}자)`,
      );
    } else {
      console.log(`  ⚠ 자막 없음 — 제목/설명만으로 요약`);
    }

    try {
      const summary = await summarizeVideo(video, transcript);
      console.log(`  ✓ 요약: ${summary.headline}`);
      digest.push({ video, summary, hadTranscript: transcript !== null });
    } catch (err) {
      console.error(`  ✗ 요약 실패:`, (err as Error).message);
    }
  }

  if (digest.length === 0) {
    console.log("\n요약된 영상이 없어 HTML을 생성하지 않습니다.");
    return;
  }

  const html = renderDigest(digest);
  const saved = await saveDigestHtml(html, digest);
  console.log(`\n✓ 다이제스트 Supabase 저장: ${saved.slug}`);

  const landingPath = await regenerateLanding();
  console.log(`✓ 랜딩페이지 재생성: ${landingPath}`);

  const siteBase = process.env.SITE_URL ?? "https://tubelet.vercel.app";
  const digestUrl = `${siteBase}/digest/${saved.slug}.html`;

  if (isKakaoConfigured()) {
    try {
      await sendDigestToKakao(digest, digestUrl);
      console.log(`✓ 카카오 나에게 보내기 완료`);
    } catch (err) {
      console.error(`✗ 카카오 전송 실패:`, (err as Error).message);
    }
  }

  if (isEmailConfigured()) {
    try {
      await sendDigestEmail(html, digest, digestUrl);
      console.log(`✓ 이메일 전송 완료 → ${process.env.EMAIL_TO}`);
    } catch (err) {
      console.error(`✗ 이메일 전송 실패:`, (err as Error).message);
    }
  }

  const updated = markSeen(
    state,
    digest.map((d) => d.video.videoId),
  );
  await saveState(updated);
  console.log(`✓ state 저장 완료 (누적 ${updated.seenVideoIds.length}개)`);
  console.log(`\n=== PIPELINE_DONE ===`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
