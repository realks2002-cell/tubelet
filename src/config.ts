import { readFile } from "node:fs/promises";

export interface ChannelConfig {
  id: string;
  name: string;
  enabled: boolean;
}

interface ChannelsFile {
  channels: ChannelConfig[];
}

export async function loadChannels(): Promise<ChannelConfig[]> {
  const raw = await readFile("channels.json", "utf8");
  const parsed = JSON.parse(raw) as ChannelsFile;
  return parsed.channels.filter((c) => c.enabled);
}
