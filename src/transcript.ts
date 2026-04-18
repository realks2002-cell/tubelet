// @ts-expect-error - 패키지의 broken package.json 우회 (main은 CJS인데 type:module)
import { YoutubeTranscript } from "youtube-transcript/dist/youtube-transcript.esm.js";

export interface TranscriptResult {
  text: string;
  lang: string;
  segmentCount: number;
}

type Segment = { text: string; lang?: string };

export async function fetchTranscript(
  videoId: string,
): Promise<TranscriptResult | null> {
  const langPriorities = ["ko", "en"];

  for (const lang of langPriorities) {
    try {
      const segments = (await YoutubeTranscript.fetchTranscript(videoId, {
        lang,
      })) as Segment[];
      if (segments.length > 0) {
        return {
          text: segments.map((s) => s.text).join(" "),
          lang,
          segmentCount: segments.length,
        };
      }
    } catch {
      // 언어별 시도 실패 시 다음 언어로
    }
  }

  try {
    const segments = (await YoutubeTranscript.fetchTranscript(
      videoId,
    )) as Segment[];
    if (segments.length > 0) {
      return {
        text: segments.map((s) => s.text).join(" "),
        lang: segments[0]?.lang ?? "unknown",
        segmentCount: segments.length,
      };
    }
  } catch {
    return null;
  }
  return null;
}
