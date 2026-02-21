// YouTube Scraper Edge Function
// Fetches metadata from YouTube videos and playlists using YouTube Data API v3.
//
// API keys are read from Supabase secrets, never hardcoded in source.
// Set secrets via CLI:
//   supabase secrets set YOUTUBE_API_KEY=AIza...
//   supabase secrets set YOUTUBE_API_KEY_2=AIza...   (optional, for rotation)
//   ... up to YOUTUBE_API_KEY_9
//
// If no secrets are set, the function returns a clear error rather than
// falling back to source-embedded keys.

import { corsHeaders } from '../_shared/cors.ts';
import { ok, clientError, serverError, preflight } from '../_shared/response.ts';

// ---------------------------------------------------------------------------
// API Key Rotation
// ---------------------------------------------------------------------------

function buildKeyPool(): string[] {
  const keys: string[] = [];
  const primary = Deno.env.get('YOUTUBE_API_KEY');
  if (primary) keys.push(primary);
  for (let i = 2; i <= 9; i++) {
    const k = Deno.env.get(`YOUTUBE_API_KEY_${i}`);
    if (k) keys.push(k);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  try {
    const body = await req.json();
    const { url, query, type = 'auto' } = body;

    if (type !== 'search' && !url) {
      return clientError('url is required');
    }
    if (type === 'search' && !query) {
      return clientError('query is required for search');
    }

    const keyPool = buildKeyPool();
    if (keyPool.length === 0) {
      return serverError(
        'No YouTube API keys configured. Set YOUTUBE_API_KEY via: supabase secrets set YOUTUBE_API_KEY=AIza...',
        'NO_API_KEY'
      );
    }

    let videoId: string | null = null;
    let playlistId: string | null = null;
    if (type !== 'search') {
      videoId = extractVideoId(url);
      playlistId = extractPlaylistId(url);
    }

    // Retry across all available keys on quota exhaustion
    const failedKeys = new Set<number>();
    let lastError: Error | null = null;
    let videos: VideoResult[] = [];

    for (let attempt = 0; attempt < keyPool.length; attempt++) {
      const keyIndex = findNextKey(keyPool, failedKeys, attempt);
      if (keyIndex === -1) break;
      const apiKey = keyPool[keyIndex];

      try {
        if (type === 'search') {
          videos = await fetchSearch(query, apiKey);
        } else if (playlistId && (type === 'auto' || type === 'playlist')) {
          videos = await fetchPlaylist(playlistId, apiKey);
        } else if (videoId && (type === 'auto' || type === 'video')) {
          const v = await fetchVideo(videoId, apiKey);
          videos = v ? [v] : [];
        } else {
          return clientError('Could not detect video or playlist ID from URL');
        }
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.message.includes('quotaExceeded') || lastError.message.includes('Quota exceeded')) {
          console.warn(`[youtube-scraper] Quota exceeded on key index ${keyIndex}, trying next key`);
          failedKeys.add(keyIndex);
          continue;
        }
        throw lastError;
      }
    }

    if (lastError) {
      throw new Error(`All ${keyPool.length} API key(s) exhausted: ${lastError.message}`);
    }

    return ok({ videos, count: videos.length });

  } catch (error) {
    console.error('[youtube-scraper] Error:', error);
    return serverError(error);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNextKey(pool: string[], failed: Set<number>, startAt: number): number {
  for (let i = startAt; i < pool.length; i++) {
    if (!failed.has(i)) return i;
  }
  return -1;
}

interface VideoResult {
  id: string;
  title: string;
  artist: string;
  channelTitle?: string;
  duration: number;
  thumbnail: string;
  thumbnailUrl?: string;
  url: string;
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractPlaylistId(url: string): string | null {
  const patterns = [/[?&]list=([a-zA-Z0-9_-]+)/, /^PL[a-zA-Z0-9_-]+$/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function youtubeGet(url: string, apiKey: string): Promise<any> {
  const response = await fetch(url);
  if (response.status === 403) {
    const errorData = await response.json();
    const reason = errorData.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded') {
      throw new Error(`Quota exceeded for key ending in ...${apiKey.slice(-4)}`);
    }
    throw new Error(`YouTube API 403: ${JSON.stringify(errorData.error)}`);
  }
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchVideo(videoId: string, apiKey: string): Promise<VideoResult | null> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`;
  const data = await youtubeGet(url, apiKey);
  if (!data.items || data.items.length === 0) return null;
  return parseVideoItem(data.items[0]);
}

async function fetchSearch(query: string, apiKey: string): Promise<VideoResult[]> {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=10&key=${apiKey}`;
  const data = await youtubeGet(url, apiKey);
  return (data.items || []).map((item: any) => {
    const snippet = item.snippet;
    const titleParts = snippet.title.split(' - ');
    const artist = titleParts.length > 1 ? titleParts[0].trim() : snippet.channelTitle;
    const title = titleParts.length > 1 ? titleParts.slice(1).join(' - ').trim() : snippet.title;
    const thumb = snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '';
    return {
      id: item.id.videoId,
      title,
      artist,
      channelTitle: snippet.channelTitle,
      duration: 0,
      thumbnail: thumb,
      thumbnailUrl: thumb,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    };
  });
}

async function fetchPlaylist(playlistId: string, apiKey: string): Promise<VideoResult[]> {
  const videos: VideoResult[] = [];
  let pageToken: string | null = null;
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}&key=${apiKey}`;
    const data = await youtubeGet(url, apiKey);
    const videoIds = data.items.map((item: any) => item.contentDetails.videoId).join(',');
    const batch = await fetchVideosBatch(videoIds, apiKey);
    videos.push(...batch);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return videos;
}

async function fetchVideosBatch(videoIds: string, apiKey: string): Promise<VideoResult[]> {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${apiKey}`;
  const data = await youtubeGet(url, apiKey);
  return (data.items || []).map((item: any) => parseVideoItem(item));
}

function parseVideoItem(item: any): VideoResult {
  const snippet = item.snippet;
  const duration = parseDuration(item.contentDetails?.duration);
  const titleParts = snippet.title.split(' - ');
  const artist = titleParts.length > 1 ? titleParts[0].trim() : snippet.channelTitle;
  const title = titleParts.length > 1 ? titleParts.slice(1).join(' - ').trim() : snippet.title;
  const thumb = snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || '';
  return {
    id: item.id,
    title,
    artist,
    channelTitle: snippet.channelTitle,
    duration,
    thumbnail: thumb,
    thumbnailUrl: thumb,
    url: `https://www.youtube.com/watch?v=${item.id}`,
  };
}

function parseDuration(duration: string): number {
  const match = duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || '0', 10) * 3600) +
         (parseInt(match[2] || '0', 10) * 60) +
          parseInt(match[3] || '0', 10);
}
