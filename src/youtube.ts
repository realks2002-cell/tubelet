export interface YoutubeVideo {
  videoId: string;
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  channelId: string;
  channelName: string;
}

interface ChannelsListResponse {
  items?: Array<{
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
    snippet?: { title?: string };
  }>;
}

interface PlaylistItemsResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      resourceId?: { videoId?: string };
    };
  }>;
}

const API_BASE = "https://www.googleapis.com/youtube/v3";

function requireKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error("YOUTUBE_API_KEY가 .env에 설정되지 않았습니다.");
  }
  return key;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function resolveUploadsPlaylist(
  channelId: string,
): Promise<{ uploadsPlaylistId: string; channelName: string }> {
  const key = requireKey();
  const url = `${API_BASE}/channels?part=contentDetails,snippet&id=${channelId}&key=${key}`;
  const data = await getJson<ChannelsListResponse>(url);
  const item = data.items?.[0];
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) {
    throw new Error(`채널 ${channelId}의 uploads 플레이리스트를 찾을 수 없습니다.`);
  }
  return {
    uploadsPlaylistId: uploads,
    channelName: item?.snippet?.title ?? channelId,
  };
}

export function extractVideoId(url: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const shorts = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shorts?.[1]) return shorts[1];
      const embed = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embed?.[1]) return embed[1];
    }
  } catch {
    return null;
  }
  return null;
}

interface VideosListResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      channelId?: string;
      channelTitle?: string;
    };
  }>;
}

export async function fetchVideoById(videoId: string): Promise<YoutubeVideo> {
  const key = requireKey();
  const url = `${API_BASE}/videos?part=snippet&id=${videoId}&key=${key}`;
  const data = await getJson<VideosListResponse>(url);
  const item = data.items?.[0];
  if (!item || !item.snippet) {
    throw new Error(`영상을 찾을 수 없습니다: ${videoId}`);
  }
  const s = item.snippet;
  return {
    videoId,
    title: s.title ?? "",
    description: s.description ?? "",
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedAt: s.publishedAt ?? "",
    channelId: s.channelId ?? "",
    channelName: s.channelTitle ?? "",
  };
}

export async function fetchChannelVideos(
  channelId: string,
  maxResults = 10,
): Promise<YoutubeVideo[]> {
  const key = requireKey();
  const { uploadsPlaylistId, channelName } =
    await resolveUploadsPlaylist(channelId);

  const url = `${API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${key}`;
  const data = await getJson<PlaylistItemsResponse>(url);

  const videos: YoutubeVideo[] = [];
  for (const item of data.items ?? []) {
    const videoId = item.snippet?.resourceId?.videoId;
    const title = item.snippet?.title;
    if (!videoId || !title) continue;
    videos.push({
      videoId,
      title,
      description: item.snippet?.description ?? "",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: item.snippet?.publishedAt ?? "",
      channelId,
      channelName,
    });
  }
  return videos;
}
