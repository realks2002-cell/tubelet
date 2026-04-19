import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "../src/db.js";
import type { DigestMeta } from "../src/save.js";

async function main() {
  console.log("=== Supabase 마이그레이션 시작 ===\n");

  // 1. channels.json → tube_channels
  console.log("1. 채널 이관...");
  try {
    const raw = await readFile("channels.json", "utf8");
    const { channels } = JSON.parse(raw) as {
      channels: Array<{ id: string; name: string; enabled?: boolean }>;
    };
    for (const c of channels) {
      const { error } = await db.from("tube_channels").upsert(
        { id: c.id, name: c.name, enabled: c.enabled ?? true },
        { onConflict: "id" },
      );
      if (error) console.error(`  ✗ ${c.name}:`, error.message);
      else console.log(`  ✓ ${c.name} (${c.id})`);
    }
  } catch {
    console.log("  channels.json 없음 — 건너뜀");
  }

  // 2. state/last-checked.json → tube_channel_state
  console.log("\n2. state 이관...");
  try {
    const raw = await readFile("state/last-checked.json", "utf8");
    const { seenVideoIds } = JSON.parse(raw) as { seenVideoIds: string[] };
    const { error } = await db.from("tube_channel_state").upsert(
      { channel_id: "__all__", seen_video_ids: seenVideoIds, checked_at: new Date().toISOString() },
      { onConflict: "channel_id" },
    );
    if (error) console.error("  ✗ state:", error.message);
    else console.log(`  ✓ ${seenVideoIds.length}개 seen videoId 이관 완료`);
  } catch {
    console.log("  last-checked.json 없음 — 건너뜀");
  }

  // 3. public/digest/*.json → tube_digest_runs + tube_videos (metadata only)
  console.log("\n3. 기존 다이제스트 메타 이관...");
  try {
    const files = await readdir("public/digest").catch(() => [] as string[]);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(resolve("public/digest", file), "utf8");
        const meta = JSON.parse(raw) as DigestMeta;

        const { error: rErr } = await db.from("tube_digest_runs").upsert(
          {
            slug: meta.slug,
            generated_at: meta.generatedAt,
            video_ids: meta.headlines.map((h) => h.videoId),
          },
          { onConflict: "slug" },
        );
        if (rErr) { console.error(`  ✗ run ${meta.slug}:`, rErr.message); continue; }

        for (const h of meta.headlines) {
          const { error: vErr } = await db.from("tube_videos").upsert(
            {
              video_id: h.videoId,
              channel_name: h.channelName,
              video_title: h.videoTitle,
              headline: h.headline,
              generated_at: meta.generatedAt,
            },
            { onConflict: "video_id" },
          );
          if (vErr) console.error(`  ✗ video ${h.videoId}:`, vErr.message);
        }
        console.log(`  ✓ ${meta.slug} (${meta.headlines.length}편)`);
      } catch (e) {
        console.error(`  ✗ ${file}:`, (e as Error).message);
      }
    }
  } catch {
    console.log("  public/digest 없음 — 건너뜀");
  }

  console.log("\n=== 마이그레이션 완료 ===");
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
