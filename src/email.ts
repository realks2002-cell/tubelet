import { Resend } from "resend";
import type { DigestItem } from "./html.js";

const DEFAULT_FROM = "Tubelet <onboarding@resend.dev>";

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_TO;
}

export async function sendDigestEmail(
  html: string,
  items: DigestItem[],
  digestUrl: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.EMAIL_TO;
  if (!apiKey || !to) {
    throw new Error("RESEND_API_KEY 또는 EMAIL_TO 환경변수가 없습니다.");
  }

  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;
  const subject = buildSubject(items);
  const finalHtml = injectDigestLink(html, digestUrl);

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to,
    subject,
    html: finalHtml,
    replyTo: to,
  });

  if (result.error) {
    throw new Error(
      `Resend 전송 실패: ${result.error.name} — ${result.error.message}`,
    );
  }
}

function buildSubject(items: DigestItem[]): string {
  const today = formatDate(new Date());
  if (items.length === 0) {
    return `📺 Tubelet · ${today}`;
  }
  if (items.length === 1) {
    const head = items[0]!.summary.headline;
    return `📺 Tubelet · ${truncate(head, 40)}`;
  }
  const channels = Array.from(new Set(items.map((i) => i.video.channelName)));
  const channelLabel =
    channels.length === 1
      ? channels[0]
      : channels.length === 2
        ? `${channels[0]}, ${channels[1]}`
        : `${channels[0]} 외 ${channels.length - 1}곳`;
  return `📺 Tubelet · ${items.length}편 · ${channelLabel} · ${today}`;
}

function injectDigestLink(html: string, digestUrl: string): string {
  const banner = `<div style="background:#F5F2EC;color:#8A847C;font-size:12px;padding:12px 20px;text-align:center;border-bottom:1px solid #EAE5DA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  웹에서 더 예쁘게 보기: <a href="${escapeAttr(digestUrl)}" style="color:#1A1814;font-weight:500">${escapeHtml(digestUrl)}</a>
</div>`;
  return html.replace(/<body([^>]*)>/, `<body$1>${banner}`);
}

function formatDate(d: Date): string {
  // KST(UTC+9)로 이동 후 UTC 메서드로 읽기 — 서버 TZ 무관
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = k.getUTCFullYear();
  const m = String(k.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(k.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${dd}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
