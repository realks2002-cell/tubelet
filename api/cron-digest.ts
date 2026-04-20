import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadChannels } from "../src/config.js";
import { loadState, markSeen, saveState } from "../src/state.js";
import { fetchChannelVideos } from "../src/youtube.js";
import { fetchTranscript } from "../src/transcript.js";
import { summarizeVideo } from "../src/summarize.js";
import { renderDigest, type DigestItem } from "../src/html.js";
import { saveDigestHtml } from "../src/save.js";
import { isKakaoConfigured, sendDigestToKakao } from "../src/kakao.js";
import { isEmailConfigured, sendDigestEmail } from "../src/email.js";

export const maxDuration = 300;

const MAX_AGE_HOURS = 72;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron은 Authorization 헤더로 보호됨
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const log: string[] = [];
  const out = (msg: string) => { console.log(msg); log.push(msg); };

  try {
    const channels = await loadChannels();
    if (channels.length === 0) {
      out("활성화된 채널 없음");
      return res.json({ ok: true, message: "채널 없음", log });
    }

    const state = await loadState();
    const seen = new Set(state.seenVideoIds);
    const cutoff = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000;
    const newVideos = [];

    for (const channel of channels) {
      out(`[${channel.name}] 조회 중...`);
      const videos = await fetchChannelVideos(channel.id);
      let skippedSeen = 0, skippedOld = 0;
      const fresh = videos.filter((v) => {
        if (seen.has(v.videoId)) { skippedSeen++; return false; }
        const ts = v.publishedAt ? Date.parse(v.publishedAt) : 0;
        if (ts < cutoff) { skippedOld++; return false; }
        return true;
      });
      out(`  → 전체 ${videos.length}개: 이미처리 ${skippedSeen}, 오래됨 ${skippedOld}, 신규 ${fresh.length}`);
      newVideos.push(...fresh);
    }

    if (newVideos.length === 0) {
      out("신규 영상 없음");
      return res.json({ ok: true, message: "신규 없음", log });
    }

    out(`=== 요약 시작 (${newVideos.length}개) ===`);
    const digest: DigestItem[] = [];

    for (const video of newVideos) {
      out(`• ${video.title}`);
      const transcript = await fetchTranscript(video.videoId);
      out(`  자막: ${transcript ? `${transcript.lang} ${transcript.segmentCount}세그` : "없음"}`);
      const summary = await summarizeVideo(video, transcript);
      out(`  요약: ${summary.headline}`);
      digest.push({ video, summary, hadTranscript: transcript !== null });
    }

    const html = renderDigest(digest);
    const saved = await saveDigestHtml(html, digest);
    out(`✓ 저장: ${saved.slug}`);

    const siteBase = process.env.SITE_URL ?? "https://tubelet.vercel.app";
    const digestUrl = `${siteBase}/digest/${saved.slug}`;

    if (isKakaoConfigured()) {
      await sendDigestToKakao(digest, digestUrl).catch((e) => out(`카톡 실패: ${e.message}`));
      out("✓ 카톡 전송");
    }

    if (isEmailConfigured()) {
      await sendDigestEmail(html, digest, digestUrl).catch((e) => out(`이메일 실패: ${e.message}`));
      out("✓ 이메일 전송");
    }

    const updated = markSeen(state, digest.map((d) => d.video.videoId));
    await saveState(updated);
    out(`✓ state 저장 (누적 ${updated.seenVideoIds.length}개)`);

    return res.json({ ok: true, processed: digest.length, slug: saved.slug, log });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("cron-digest 실패:", msg);
    return res.status(500).json({ ok: false, error: msg, log });
  }
}
