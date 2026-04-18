import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DigestItem } from "./html.js";

const KAUTH_BASE = "https://kauth.kakao.com";
const KAPI_BASE = "https://kapi.kakao.com";
const SCOPES = "talk_message";
const TOKEN_CACHE_PATH = resolve("state/kakao-token.json");

interface KakaoTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
}

export function isKakaoConfigured(): boolean {
  return !!process.env.KAKAO_REST_API_KEY;
}

export function buildAuthUrl(redirectUri: string): string {
  const restKey = requireRestApiKey();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: restKey,
    redirect_uri: redirectUri,
    scope: SCOPES,
  });
  return `${KAUTH_BASE}/oauth/authorize?${params}`;
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<CachedToken> {
  const restKey = requireRestApiKey();
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: restKey,
    redirect_uri: redirectUri,
    code,
  };
  const secret = process.env.KAKAO_CLIENT_SECRET;
  if (secret) params.client_secret = secret;

  const res = await fetch(`${KAUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    throw new Error(`카카오 토큰 교환 실패 (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as KakaoTokenResponse;
  const now = Date.now();
  const cached: CachedToken = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in - 60) * 1000,
    refreshToken: data.refresh_token ?? "",
    refreshTokenExpiresAt:
      now + ((data.refresh_token_expires_in ?? 60 * 60 * 24 * 60) - 60) * 1000,
  };
  await saveToken(cached);
  return cached;
}

async function refreshAccessToken(refreshToken: string): Promise<CachedToken> {
  const restKey = requireRestApiKey();
  const params: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: restKey,
    refresh_token: refreshToken,
  };
  const secret = process.env.KAKAO_CLIENT_SECRET;
  if (secret) params.client_secret = secret;

  const res = await fetch(`${KAUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    throw new Error(`카카오 토큰 갱신 실패 (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as KakaoTokenResponse;
  const existing = await loadToken();
  const now = Date.now();
  const updated: CachedToken = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in - 60) * 1000,
    refreshToken: data.refresh_token ?? existing?.refreshToken ?? refreshToken,
    refreshTokenExpiresAt: data.refresh_token_expires_in
      ? now + (data.refresh_token_expires_in - 60) * 1000
      : existing?.refreshTokenExpiresAt ?? now + 60 * 24 * 60 * 60 * 1000,
  };
  await saveToken(updated);
  return updated;
}

async function getAccessToken(): Promise<string> {
  const cached = await loadToken();
  const envRefresh = process.env.KAKAO_REFRESH_TOKEN;

  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const refreshToken = cached?.refreshToken || envRefresh;
  if (!refreshToken) {
    throw new Error(
      "카카오 refresh_token이 없습니다. http://localhost:3000/auth/kakao 에서 최초 로그인을 수행하세요.",
    );
  }
  const fresh = await refreshAccessToken(refreshToken);
  return fresh.accessToken;
}

export async function sendDigestToKakao(
  items: DigestItem[],
  digestUrl: string,
): Promise<void> {
  if (!isKakaoConfigured()) return;

  const accessToken = await getAccessToken();
  const message = formatDigestMessage(items);

  const templateObject = {
    object_type: "text",
    text: message,
    link: {
      web_url: digestUrl,
      mobile_web_url: digestUrl,
    },
    button_title: "열어보기",
  };

  const res = await fetch(`${KAPI_BASE}/v2/api/talk/memo/default/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      template_object: JSON.stringify(templateObject),
    }),
  });
  if (!res.ok) {
    throw new Error(`카카오 메시지 전송 실패 (${res.status}): ${await res.text()}`);
  }
}

function formatDigestMessage(items: DigestItem[]): string {
  const count = items.length;
  const head = `📺 Tubelet · 새 요약 ${count}편`;
  const stockTotal = items.reduce((sum, it) => sum + it.summary.stocks.length, 0);
  const stockLabel = stockTotal > 0 ? ` · 종목 ${stockTotal}개 분석` : "";

  const previewLimit = count === 1 ? 1 : Math.min(3, count);
  const lines = items
    .slice(0, previewLimit)
    .map((it) => `• ${truncate(it.summary.headline, 30)}`)
    .join("\n");
  const more = count > previewLimit ? `\n외 ${count - previewLimit}편` : "";

  const message = `${head}${stockLabel}\n\n${lines}${more}`;
  return message.slice(0, 200);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function requireRestApiKey(): string {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY가 .env에 없습니다.");
  return key;
}

async function saveToken(token: CachedToken): Promise<void> {
  await mkdir(dirname(TOKEN_CACHE_PATH), { recursive: true });
  await writeFile(TOKEN_CACHE_PATH, JSON.stringify(token, null, 2), "utf8");
}

async function loadToken(): Promise<CachedToken | null> {
  try {
    const raw = await readFile(TOKEN_CACHE_PATH, "utf8");
    return JSON.parse(raw) as CachedToken;
  } catch {
    return null;
  }
}
