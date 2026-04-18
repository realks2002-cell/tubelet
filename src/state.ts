import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const STATE_PATH = "state/last-checked.json";

export interface StateFile {
  seenVideoIds: string[];
}

export async function loadState(): Promise<StateFile> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StateFile>;
    return { seenVideoIds: parsed.seenVideoIds ?? [] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { seenVideoIds: [] };
    }
    throw err;
  }
}

export async function saveState(state: StateFile): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export function markSeen(state: StateFile, videoIds: string[]): StateFile {
  const set = new Set(state.seenVideoIds);
  for (const id of videoIds) set.add(id);
  const recent = Array.from(set).slice(-500);
  return { seenVideoIds: recent };
}
