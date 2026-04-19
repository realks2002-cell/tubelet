import Anthropic from "@anthropic-ai/sdk";
import type { YoutubeVideo } from "./youtube.js";
import type { TranscriptResult } from "./transcript.js";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TRANSCRIPT_CHARS = 40000;

const SYSTEM_PROMPT = `당신은 YouTube 영상을 깊이 있게 정리하는 전문 에디터입니다.
독자가 영상을 보지 않아도 A4 한 장 이상의 충실한 내용을 얻을 수 있도록 **풍부하고 상세하게** 작성합니다.
특히 **투자·경제·주식 영상에서는 종목별 상세 분석이 가장 중요한 산출물**입니다.

다음 규칙을 반드시 지키세요:
1. 출력은 **JSON 객체 하나만** 반환하세요. 앞뒤 설명이나 마크다운 코드펜스 금지.
2. 다음 스키마를 따르세요:
{
  "headline": "영상의 핵심을 한 문장으로 (30자 이내)",
  "summary": "영상 전체를 **10-15문장**으로 깊이 있게 요약. 도입부·전개·핵심 주장·결론을 모두 커버. 구체적 수치·사례·배경이 있으면 반드시 포함. 단순 나열이 아니라 흐름이 있는 글로 작성.",
  "keyPoints": [
    "거시·시장·이벤트 포인트를 **각각 2-4문장**으로 상세히. 수치·배경·의미를 포함. 단순 키워드가 아니라 완결된 문장으로 작성.",
    "..."
  ],
  "stocks": [
    {
      "name": "종목명 (예: 한화엔진, SK하이닉스, 리가켐바이오, 퀀텀스케이프)",
      "ticker": "종목코드 6자리 또는 미국 티커 (영상에서 언급되거나 확실할 때만, 모르면 빈 문자열)",
      "sector": "섹터/테마 (예: 조선-LNG, K-바이오, 방산, 반도체, 원전) - 없으면 빈 문자열",
      "catalyst": "종목이 영상에서 다뤄진 이유·재료·이벤트를 1문장으로",
      "analysis": "종목에 대한 **상세 분석을 7-12문장으로**. 반드시 아래를 모두 다룰 것:\\n- 영상에서 언급된 구체적 수치·가격·목표가·차트 레벨\\n- 왜 지금 주목받는지 (밸류에이션·실적·수급·정책·테마 측면)\\n- 해당 종목의 현재 이슈·배경·맥락\\n- 영상 진행자의 관점과 주요 발언 (귀속 명시: '진행자는 ~라고 분석했다')\\n- 관련 동종 업계·밸류체인 언급\\n- 앞으로 체크할 포인트 (실적 발표일·주요 레벨·리스크)",
      "keyLevels": "차트상 주요 가격/레벨/목표가가 언급된 경우 '15만원 저항, 12만원 지지' 형식. 없으면 빈 문자열",
      "sentiment": "bull" | "bear" | "watch" | "neutral"
    }
  ],
  "topics": ["주요 주제 태그 1", "..."],
  "sentiment": "positive" | "neutral" | "negative" | "informative"
}
3. **stocks 추출 규칙 (최우선)**:
   - 영상에서 **구체적으로 분석·언급된 모든 종목**을 빠짐없이 추출. 10개 이상이어도 OK.
   - 단, 스쳐지나간 이름만 나온 종목은 제외 (분석 내용이 없는 경우).
   - 같은 종목이 여러 번 나오면 **통합해서 한 엔트리로** 최대한 풍부하게.
   - analysis는 **영상 원문에 충실하게** 작성. 의견은 귀속 명시("진행자는 ~라고 분석했다").
   - sector/keyLevels는 정보가 없으면 ""로 두고 억지로 채우지 말 것.
   - sentiment: "bull"=매수/긍정, "bear"=매도/부정, "watch"=관찰, "neutral"=중립
   - 투자·주식과 무관한 영상이면 stocks는 빈 배열 [].
4. keyPoints는 4-8개. **종목 디테일은 전부 stocks로**, 거시경제·이벤트·시장 전반·정책만 keyPoints에. 각 포인트는 2-4문장의 충실한 설명으로.
5. topics는 2-5개의 짧은 키워드.
6. 자막이 불완전하면 "자막 기반 추정"임을 summary에 명시.
7. 반드시 한국어로 작성. **분량을 아끼지 말 것. 영상의 정보를 최대한 전달하는 것이 목표.**`;

export interface StockItem {
  name: string;
  ticker: string;
  sector: string;
  catalyst: string;
  analysis: string;
  keyLevels: string;
  sentiment: "bull" | "bear" | "watch" | "neutral";
}

export interface VideoSummary {
  headline: string;
  summary: string;
  keyPoints: string[];
  stocks: StockItem[];
  topics: string[];
  sentiment: "positive" | "neutral" | "negative" | "informative";
}

const client = new Anthropic();

export async function summarizeVideo(
  video: YoutubeVideo,
  transcript: TranscriptResult | null,
): Promise<VideoSummary> {
  const transcriptBlock = transcript
    ? `## 자막 (${transcript.lang}, ${transcript.segmentCount}개 세그먼트)\n${truncate(transcript.text, MAX_TRANSCRIPT_CHARS)}`
    : `## 자막\n(자막을 가져올 수 없었습니다. 제목과 설명만으로 요약하세요.)`;

  const userContent = `다음 YouTube 영상을 요약해주세요.

## 채널
${video.channelName}

## 제목
${video.title}

## 설명
${video.description || "(설명 없음)"}

${transcriptBlock}

JSON 스키마에 맞는 객체 하나만 출력하세요. 주식·투자 영상이라면 stocks 배열에 종목별 분석을 반드시 넣으세요.`;

  return await callWithRetry(userContent, 2);
}

async function callWithRetry(
  userContent: string,
  attemptsLeft: number,
  hint?: string,
): Promise<VideoSummary> {
  const finalUser = hint ? `${userContent}\n\n[재시도] ${hint}` : userContent;
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: finalUser }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude 응답에 텍스트 블록이 없습니다.");
  }

  try {
    return parseSummary(textBlock.text);
  } catch (err) {
    if (attemptsLeft <= 0) throw err;
    const stopReason = response.stop_reason;
    const truncated = stopReason === "max_tokens";
    const retryHint = truncated
      ? "이전 응답이 토큰 한도로 잘렸습니다. stocks의 analysis를 각 3-4문장으로 줄이고, stocks 개수도 꼭 언급된 종목만 남겨 더 집약적으로 작성하세요. 유효한 JSON으로 완결지으세요."
      : "이전 응답의 JSON 형식이 유효하지 않았습니다. 문자열 안의 따옴표를 이스케이프하고, 배열 마지막 항목 뒤 콤마 없이 완결된 JSON만 반환하세요.";
    return callWithRetry(userContent, attemptsLeft - 1, retryHint);
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...[자막 길이 제한으로 절삭]";
}

function parseSummary(raw: string): VideoSummary {
  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr) as Partial<VideoSummary>;
  if (
    typeof parsed.headline !== "string" ||
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.keyPoints) ||
    !Array.isArray(parsed.topics)
  ) {
    throw new Error(`요약 JSON 스키마 불일치: ${raw.slice(0, 200)}`);
  }
  return {
    headline: parsed.headline,
    summary: parsed.summary,
    keyPoints: parsed.keyPoints.filter((p): p is string => typeof p === "string"),
    stocks: Array.isArray(parsed.stocks) ? parsed.stocks.filter(isValidStock) : [],
    topics: parsed.topics.filter((t): t is string => typeof t === "string"),
    sentiment: parsed.sentiment ?? "informative",
  };
}

function isValidStock(s: unknown): s is StockItem {
  if (!s || typeof s !== "object") return false;
  const obj = s as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name.length === 0) return false;
  if (typeof obj.analysis !== "string" || obj.analysis.length === 0) return false;
  const sent = obj.sentiment;
  obj.ticker = typeof obj.ticker === "string" ? obj.ticker : "";
  obj.sector = typeof obj.sector === "string" ? obj.sector : "";
  obj.catalyst = typeof obj.catalyst === "string" ? obj.catalyst : "";
  obj.keyLevels = typeof obj.keyLevels === "string" ? obj.keyLevels : "";
  obj.sentiment =
    sent === "bull" || sent === "bear" || sent === "watch" || sent === "neutral"
      ? sent
      : "neutral";
  return true;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1) return trimmed.slice(start, end + 1);
  throw new Error("JSON을 응답에서 추출할 수 없습니다.");
}
