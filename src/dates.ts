// KST(Asia/Seoul, UTC+9) 기준 포맷터. 서버 TZ 무관.
// Korea는 DST 없음 — 단순 +9h 시프트 후 UTC 메서드로 읽음.

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function toKst(d: Date): Date {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

export function formatDate(d: Date): string {
  const k = toKst(d);
  const y = k.getUTCFullYear();
  const m = String(k.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(k.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${dd} (${DAY_NAMES[k.getUTCDay()]})`;
}

export function formatTime(d: Date): string {
  const k = toKst(d);
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mi = String(k.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

export function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${formatTime(d)}`;
}

export function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return `${Math.floor(days / 7)}주 전`;
}
