import "dotenv/config";
import { fetchTranscript } from "../src/transcript.js";

const videoId = process.argv[2] ?? "XKL1ebMR7L4";
console.log(`테스트 영상: ${videoId}`);

const r = await fetchTranscript(videoId);
if (r) {
  console.log(`✓ 성공: lang=${r.lang}, 세그먼트=${r.segmentCount}개, 길이=${r.text.length}자`);
  console.log(`미리보기: ${r.text.slice(0, 200)}`);
} else {
  console.log("✗ 실패: 자막 없음 (null 반환)");
}
