import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { enhancementScript, enhancementStyles } from "./html.js";

const DIGEST_DIR = resolve("public/digest");
const SENTINEL = "tubelet-enhance:v1";

async function main(): Promise<void> {
  const files = await readdir(DIGEST_DIR).catch(() => [] as string[]);
  let migrated = 0;
  let skipped = 0;

  for (const f of files) {
    if (!f.endsWith(".html")) continue;
    const path = resolve(DIGEST_DIR, f);
    const content = await readFile(path, "utf8");
    if (content.includes(SENTINEL)) {
      skipped++;
      continue;
    }

    const withStyle = content.replace(
      /<\/style>/,
      `${enhancementStyles()}\n</style>`,
    );
    const withScript = withStyle.replace(
      /<\/body>/,
      `<script>\n${enhancementScript()}\n</script>\n</body>`,
    );

    if (withScript === content) {
      console.warn(`⚠ ${f}: <style> 또는 <body> 마커를 찾지 못해 건너뜀`);
      continue;
    }

    await writeFile(path, withScript, "utf8");
    migrated++;
    console.log(`✓ ${f}`);
  }

  console.log(`\n변환 ${migrated}개 / 건너뜀 ${skipped}개 / 전체 ${files.filter((f) => f.endsWith(".html")).length}개`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
