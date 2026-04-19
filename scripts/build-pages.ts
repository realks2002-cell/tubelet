import { regenerateLanding } from "../src/landing.js";

async function main(): Promise<void> {
  const indexPath = await regenerateLanding();
  console.log(`✓ 랜딩 + 채널 페이지 재생성: ${indexPath}`);
}

main().catch((err) => {
  console.error("빌드 실패:", err);
  process.exit(1);
});
