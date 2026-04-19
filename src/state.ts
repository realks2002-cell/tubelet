import { db } from "./db.js";

export interface StateFile {
  seenVideoIds: string[];
}

export async function loadState(): Promise<StateFile> {
  const { data, error } = await db
    .from("tube_channel_state")
    .select("seen_video_ids");
  if (error) throw new Error(`state 조회 실패: ${error.message}`);
  const seen = new Set<string>();
  for (const row of data ?? []) {
    for (const id of (row.seen_video_ids as string[]) ?? []) seen.add(id);
  }
  return { seenVideoIds: Array.from(seen) };
}

export async function saveState(state: StateFile): Promise<void> {
  // 전체 seen 목록을 채널 구분 없이 단일 sentinel row로 보관
  const { error } = await db.from("tube_channel_state").upsert(
    { channel_id: "__all__", seen_video_ids: state.seenVideoIds, checked_at: new Date().toISOString() },
    { onConflict: "channel_id" },
  );
  if (error) throw new Error(`state 저장 실패: ${error.message}`);
}

export function markSeen(state: StateFile, videoIds: string[]): StateFile {
  const set = new Set(state.seenVideoIds);
  for (const id of videoIds) set.add(id);
  return { seenVideoIds: Array.from(set).slice(-500) };
}
