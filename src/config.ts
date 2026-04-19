import { db } from "./db.js";

export interface ChannelConfig {
  id: string;
  name: string;
  enabled: boolean;
}

export async function loadChannels(): Promise<ChannelConfig[]> {
  const { data, error } = await db
    .from("tube_channels")
    .select("id, name, enabled")
    .eq("enabled", true);
  if (error) throw new Error(`tube_channels 조회 실패: ${error.message}`);
  return data as ChannelConfig[];
}
